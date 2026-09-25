import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mercadoPagoAccessToken, mercadoPagoSandbox } from '../config/payments.config';
import { MercadoPagoConnection, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MercadoPagoAccount,
  MercadoPagoOAuthService,
  OAuthGrantError,
  OAuthTokens,
} from './mercado-pago-oauth.service';
import { TokenCipher } from './token-cipher';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Renova com menos de 30 dias de validade (decisao 8). */
const REFRESH_WINDOW_MS = 30 * DAY_MS;
/** O painel avisa com menos de 15 dias (decisao 12). */
const WARNING_WINDOW_MS = 15 * DAY_MS;
/** A renovacao chama o Mercado Pago com a linha travada. */
const REFRESH_TX_TIMEOUT_MS = 15_000;

/** Por que a conexao saiu de ativa. */
export type DisconnectReason = 'manual' | 'replaced' | 'revoked';

/** Token de uma order nova e a conexao em que ela vai nascer. */
export interface ActiveCredential {
  connectionId: string;
  accessToken: string;
}

/** Quem gerou o link — autor da conexao. */
export interface ConnectionAuthor {
  id: string;
  email: string;
}

/** Conexao como o painel a ve. **Nunca** leva token (decisao 4). */
export interface ConnectionView {
  environment: 'production' | 'sandbox';
  /** `never` e o ambiente que nunca teve conexao. */
  status: 'connected' | 'disconnected' | 'revoked' | 'never';
  account: { mpUserId: string; nickname: string | null; email: string | null } | null;
  connectedAt: string | null;
  connectedByEmail: string | null;
  expiresAt: string | null;
  lastRefreshedAt: string | null;
  disconnectedAt: string | null;
  disconnectReason: string | null;
  /** Menos de 15 dias de validade numa conexao ativa. */
  expiringSoon: boolean;
}

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Conta que recebe as vendas (Spec 020, decisoes 3, 6, 7 e 8).
 *
 * Tres regras organizam o que esta aqui:
 *
 * 1. **Uma conexao ativa por ambiente.** O ambiente e o da branch (`MP_SANDBOX`)
 *    e vira `liveMode` na linha: preview e producao dividem o banco, e cada um
 *    so enxerga a conexao dele.
 * 2. **O token em claro so sai para chamar o Mercado Pago**, por
 *    `activeCredential` e `accessTokenFor`. A visao do painel nao o carrega.
 * 3. **A renovacao trava a linha.** O `refresh_token` troca a cada uso, e duas
 *    renovacoes simultaneas com o mesmo token perderiam o par novo.
 */
@Injectable()
export class MercadoPagoConnectionService {
  private readonly logger = new Logger(MercadoPagoConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipher,
    private readonly oauth: MercadoPagoOAuthService,
    private readonly config: ConfigService,
  ) {}

  /** Ambiente desta API: producao fora do sandbox. */
  liveMode(): boolean {
    return !mercadoPagoSandbox(this.config);
  }

  /**
   * Grava a conexao nova e desconecta a anterior do mesmo ambiente.
   *
   * Aceita a transacao de quem chama: o callback do OAuth consome o `state` na
   * mesma transacao, e um segundo uso do link nao conecta de novo (decisao 5).
   */
  async connect(
    tokens: OAuthTokens,
    account: MercadoPagoAccount,
    author: ConnectionAuthor,
    now: Date = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<MercadoPagoConnection> {
    const write = async (db: Prisma.TransactionClient) => {
      const liveMode = this.liveMode();

      await db.mercadoPagoConnection.updateMany({
        where: { liveMode, disconnectedAt: null },
        data: { disconnectedAt: now, disconnectReason: 'replaced' satisfies DisconnectReason },
      });

      return db.mercadoPagoConnection.create({
        data: {
          mpUserId: tokens.mpUserId,
          nickname: account.nickname,
          email: account.email,
          accessTokenEncrypted: this.cipher.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.cipher.encrypt(tokens.refreshToken),
          scope: tokens.scope,
          // O ambiente e o da branch, e nao o que o token declara.
          liveMode,
          expiresAt: tokens.expiresAt,
          connectedAt: now,
          connectedById: author.id,
          connectedByEmail: author.email,
        },
      });
    };

    return tx ? write(tx) : this.prisma.$transaction((client) => write(client));
  }

  /**
   * Token para criar uma order, ja renovado se estiver na janela. Nulo sem
   * conexao ativa: quem chama fecha a loja, e **nunca** cai no token da
   * plataforma (decisao 7).
   */
  async activeCredential(now: Date = new Date()): Promise<ActiveCredential | null> {
    const active = await this.active();

    if (!active) {
      return null;
    }

    const current = await this.refreshIfDue(active.id, now);

    if (!current) {
      return null;
    }

    return { connectionId: current.id, accessToken: this.cipher.decrypt(current.accessTokenEncrypted) };
  }

  /** Se ha conta ativa neste ambiente — o que abre e fecha a loja. */
  async hasActive(): Promise<boolean> {
    return (await this.active()) !== null;
  }

  /**
   * Token para consultar um pedido: o da conta em que ele nasceu, mesmo que ja
   * desconectada, ou o da plataforma no pedido anterior a Spec 020 (decisao 6).
   */
  async accessTokenFor(connectionId: string | null, now: Date = new Date()): Promise<string> {
    if (!connectionId) {
      return mercadoPagoAccessToken(this.config);
    }

    const connection = await this.prisma.mercadoPagoConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return mercadoPagoAccessToken(this.config);
    }

    // So a ativa e renovada; a desconectada vale ate vencer ou ser revogada.
    const current = connection.disconnectedAt
      ? connection
      : ((await this.refreshIfDue(connection.id, now)) ?? connection);

    return this.cipher.decrypt(current.accessTokenEncrypted);
  }

  /** Rotina diaria (decisao 8): renova as ativas dos dois ambientes. */
  async refreshDue(now: Date = new Date()): Promise<{ checked: number }> {
    const active = await this.prisma.mercadoPagoConnection.findMany({
      where: { disconnectedAt: null },
    });

    for (const connection of active) {
      await this.refreshIfDue(connection.id, now);
    }

    return { checked: active.length };
  }

  /** Desconecta pelo painel. A revogacao no Mercado Pago e do vendedor. */
  async disconnect(now: Date = new Date()): Promise<void> {
    await this.prisma.mercadoPagoConnection.updateMany({
      where: { liveMode: this.liveMode(), disconnectedAt: null },
      data: { disconnectedAt: now, disconnectReason: 'manual' satisfies DisconnectReason },
    });
  }

  /** Estado da conexao deste ambiente para o painel, sem token. */
  async view(now: Date = new Date()): Promise<ConnectionView> {
    const liveMode = this.liveMode();
    const latest = await this.prisma.mercadoPagoConnection.findFirst({
      where: { liveMode },
      orderBy: { connectedAt: 'desc' },
    });
    const environment = liveMode ? 'production' : 'sandbox';

    if (!latest) {
      return {
        environment,
        status: 'never',
        account: null,
        connectedAt: null,
        connectedByEmail: null,
        expiresAt: null,
        lastRefreshedAt: null,
        disconnectedAt: null,
        disconnectReason: null,
        expiringSoon: false,
      };
    }

    const status = !latest.disconnectedAt
      ? 'connected'
      : latest.disconnectReason === 'revoked'
        ? 'revoked'
        : 'disconnected';

    return {
      environment,
      status,
      account: { mpUserId: latest.mpUserId, nickname: latest.nickname, email: latest.email },
      connectedAt: latest.connectedAt.toISOString(),
      connectedByEmail: latest.connectedByEmail,
      expiresAt: latest.expiresAt.toISOString(),
      lastRefreshedAt: latest.lastRefreshedAt?.toISOString() ?? null,
      disconnectedAt: latest.disconnectedAt?.toISOString() ?? null,
      disconnectReason: latest.disconnectReason,
      expiringSoon:
        status === 'connected' && latest.expiresAt.getTime() - now.getTime() < WARNING_WINDOW_MS,
    };
  }

  private active(db: Db = this.prisma): Promise<MercadoPagoConnection | null> {
    return db.mercadoPagoConnection.findFirst({
      where: { liveMode: this.liveMode(), disconnectedAt: null },
    });
  }

  /**
   * Renova se faltar menos de 30 dias, com a linha travada e relida depois da
   * trava: quem chegou em segundo encontra o par que o primeiro gravou.
   *
   * Devolve a conexao utilizavel, ou nulo se ela foi revogada ou venceu.
   */
  private refreshIfDue(connectionId: string, now: Date): Promise<MercadoPagoConnection | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "mercado_pago_connections" WHERE "id" = ${connectionId} FOR UPDATE`;

        const connection = await tx.mercadoPagoConnection.findUnique({ where: { id: connectionId } });

        if (!connection || connection.disconnectedAt) {
          return null;
        }

        if (connection.expiresAt.getTime() - now.getTime() > REFRESH_WINDOW_MS) {
          return connection;
        }

        try {
          const tokens = await this.oauth.refresh(
            this.cipher.decrypt(connection.refreshTokenEncrypted),
            now,
          );

          return tx.mercadoPagoConnection.update({
            where: { id: connection.id },
            data: {
              accessTokenEncrypted: this.cipher.encrypt(tokens.accessToken),
              refreshTokenEncrypted: this.cipher.encrypt(tokens.refreshToken),
              scope: tokens.scope,
              expiresAt: tokens.expiresAt,
              lastRefreshedAt: now,
            },
          });
        } catch (error) {
          if (error instanceof OAuthGrantError) {
            // O vendedor revogou, ou o refresh_token venceu: a loja fecha, e o
            // painel mostra o motivo.
            this.logger.warn(`Conexao ${connection.id} revogada na renovacao: ${error.code}`);

            await tx.mercadoPagoConnection.update({
              where: { id: connection.id },
              data: { disconnectedAt: now, disconnectReason: 'revoked' satisfies DisconnectReason },
            });

            return null;
          }

          // Rede fora do ar nao e revogacao: o token atual serve ate vencer.
          this.logger.warn(`Renovacao da conexao ${connection.id} falhou; segue com o token atual.`);

          return connection.expiresAt.getTime() > now.getTime() ? connection : null;
        }
      },
      { timeout: REFRESH_TX_TIMEOUT_MS },
    );
  }
}
