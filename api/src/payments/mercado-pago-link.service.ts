import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionAuthor, MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoOAuthService, OAuthTokens } from './mercado-pago-oauth.service';

/** Validade do link: o bastante para o vendedor ler a mensagem (decisao 5). */
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
/** Estados vencidos ha mais que isso sao apagados pela rotina diaria. */
const STATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Pagina publica do front que mostra o resultado. */
const RESULT_PATH = '/conexao-mercado-pago';

/**
 * Motivos fechados de falha, que a pagina de retorno traduz em texto fixo. A
 * mensagem do Mercado Pago nunca vai para a URL.
 */
export type ConnectFailure = 'expirado' | 'usado' | 'negado' | 'sem_offline_access' | 'falha';

/** Link que o admin copia ou abre. */
export interface ConnectionLink {
  url: string;
  expiresAt: string;
}

/** Query do retorno do Mercado Pago. */
export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

/**
 * Link de conexao e retorno do OAuth (Spec 020, decisao 5).
 *
 * O dono da conta vendedora nao precisa ter conta nesta plataforma: o admin
 * gera o link, repassa, e o retorno e autenticado pelo `state`, e nao por
 * sessao. O `state` e de uso unico e e consumido na mesma transacao que grava
 * a conexao.
 */
@Injectable()
export class MercadoPagoLinkService {
  private readonly logger = new Logger(MercadoPagoLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MercadoPagoOAuthService,
    private readonly connections: MercadoPagoConnectionService,
    private readonly config: ConfigService,
  ) {}

  /** Gera um link novo e invalida os anteriores ainda nao usados. */
  async createLink(author: ConnectionAuthor, now: Date = new Date()): Promise<ConnectionLink> {
    const { verifier, challenge } = this.oauth.pkcePair();
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + LINK_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      // Um link esquecido num chat nao continua valendo depois de outro.
      await tx.mercadoPagoOAuthState.updateMany({
        where: { usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });

      await tx.mercadoPagoOAuthState.create({
        data: {
          state,
          codeVerifier: verifier,
          createdById: author.id,
          createdByEmail: author.email,
          expiresAt,
        },
      });
    });

    return { url: this.oauth.authorizationUrl(state, challenge), expiresAt: expiresAt.toISOString() };
  }

  /**
   * Trata o retorno e devolve para onde mandar o navegador.
   *
   * Nunca lanca: o vendedor esta no meio de um redirecionamento, e um 500
   * cru seria pior do que a pagina dizendo o que aconteceu.
   */
  async complete(query: CallbackQuery, now: Date = new Date()): Promise<string> {
    const saved = query.state
      ? await this.prisma.mercadoPagoOAuthState.findUnique({ where: { state: query.state } })
      : null;

    if (!saved || saved.expiresAt.getTime() <= now.getTime()) {
      return saved?.usedAt ? this.failure('usado') : this.failure('expirado');
    }

    if (saved.usedAt) {
      return this.failure('usado');
    }

    if (query.error) {
      return this.failure(query.error === 'access_denied' ? 'negado' : 'falha');
    }

    if (!query.code) {
      return this.failure('falha');
    }

    let tokens: OAuthTokens;

    try {
      tokens = await this.oauth.exchangeCode(query.code, saved.codeVerifier, now);
    } catch (error) {
      this.logger.warn(`Troca do code falhou: ${(error as Error).message}`);

      return this.failure('falha');
    }

    // Sem offline_access nao ha renovacao: melhor recusar agora do que fechar
    // a loja 180 dias depois (decisao 8).
    if (!tokens.scope.split(/\s+/).includes('offline_access')) {
      return this.failure('sem_offline_access');
    }

    const account = await this.oauth.fetchAccount(tokens.accessToken);

    const connected = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.mercadoPagoOAuthState.updateMany({
        where: { id: saved.id, usedAt: null },
        data: { usedAt: now },
      });

      // Outro retorno com o mesmo state chegou antes.
      if (count === 0) {
        return false;
      }

      await this.connections.connect(
        tokens,
        account,
        { id: saved.createdById, email: saved.createdByEmail },
        now,
        tx,
      );

      return true;
    });

    return connected ? this.result('resultado=ok') : this.failure('usado');
  }

  /** Apaga estados vencidos ha mais de 7 dias. Devolve quantos. */
  async purgeStates(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.mercadoPagoOAuthState.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - STATE_RETENTION_MS) } },
    });

    return count;
  }

  private failure(reason: ConnectFailure): string {
    return this.result(`resultado=erro&motivo=${reason}`);
  }

  /** A origem e a do front configurada (Spec 017), nunca uma URL da query. */
  private result(query: string): string {
    const front = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200').replace(/\/+$/, '');

    return `${front}${RESULT_PATH}?${query}`;
  }
}
