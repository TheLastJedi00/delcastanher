import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { mercadoPagoOAuthClient, mercadoPagoSandbox } from '../config/payments.config';

/** Onde o vendedor autoriza a aplicacao. */
const AUTHORIZATION_URL = 'https://auth.mercadopago.com/authorization';
/** Troca e renovacao de token — fora do `/v1` da Orders API. */
const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const ACCOUNT_URL = 'https://api.mercadopago.com/users/me';

/** Tokens de uma autorizacao, no vocabulario desta plataforma. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  mpUserId: string;
  scope: string;
  liveMode: boolean;
  expiresAt: Date;
}

/** Apelido e e-mail da conta, para o painel. */
export interface MercadoPagoAccount {
  nickname: string | null;
  email: string | null;
}

/**
 * Recusa do Mercado Pago na troca ou na renovacao — `invalid_grant` quando o
 * `code` venceu ou o vendedor revogou a autorizacao. E separada da falha de
 * rede de proposito: recusa desconecta a conta, rede fora do ar nao (decisao 8).
 */
export class OAuthGrantError extends Error {
  constructor(readonly code: string) {
    super(`Mercado Pago recusou o OAuth: ${code}`);
    this.name = 'OAuthGrantError';
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user_id: number | string;
  scope?: string;
  live_mode?: boolean;
  expires_in: number;
}

/**
 * OAuth do Mercado Pago (Spec 020, decisoes 5 e 8): a URL que o vendedor abre,
 * a troca do `code` e a renovacao.
 *
 * Como o `MercadoPagoService` para as orders, isola a rede num arquivo so, e
 * nao guarda nada: quem grava e cifra e o `MercadoPagoConnectionService`.
 */
@Injectable()
export class MercadoPagoOAuthService {
  private readonly logger = new Logger(MercadoPagoOAuthService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Par do PKCE, com S256. O verifier tem 43 caracteres base64url (32 bytes
   * aleatorios), o minimo que a RFC 7636 aceita e o bastante para nao ser
   * adivinhado.
   */
  pkcePair(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
  }

  /** URL que o dono da conta vendedora abre para autorizar. */
  authorizationUrl(state: string, challenge: string): string {
    const { clientId, redirectUri } = mercadoPagoOAuthClient(this.config);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `${AUTHORIZATION_URL}?${params.toString()}`;
  }

  /**
   * Troca o `code` do retorno pelos tokens.
   *
   * `test_token` segue o ambiente, que e definido pela branch: preview roda
   * com `MP_SANDBOX=true` e credenciais `TEST-`, producao com `APP_USR-`
   * (decisao 13). A Spec 014 (decisao 24) viu a Orders API recusar chaves
   * `TEST-` da conta da plataforma; se o token de teste do vendedor tiver a
   * mesma sorte, e a verificacao em preview que vai dizer.
   */
  async exchangeCode(code: string, verifier: string, now: Date = new Date()): Promise<OAuthTokens> {
    const { clientId, clientSecret, redirectUri } = mercadoPagoOAuthClient(this.config);

    return this.token(
      {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        test_token: String(mercadoPagoSandbox(this.config)),
      },
      now,
    );
  }

  /** Renova o par. O `refresh_token` antigo deixa de valer (decisao 8). */
  async refresh(refreshToken: string, now: Date = new Date()): Promise<OAuthTokens> {
    const { clientId, clientSecret } = mercadoPagoOAuthClient(this.config);

    return this.token(
      {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      now,
    );
  }

  /**
   * Apelido e e-mail da conta conectada. Sao so para o painel: a falha daqui
   * devolve vazio, e nao derruba uma conexao que ja tem token valido.
   */
  async fetchAccount(accessToken: string): Promise<MercadoPagoAccount> {
    try {
      const response = await fetch(ACCOUNT_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        this.logger.warn(`Mercado Pago respondeu ${response.status} em /users/me.`);

        return { nickname: null, email: null };
      }

      const body = (await response.json()) as { nickname?: string; email?: string };

      return { nickname: body.nickname ?? null, email: body.email ?? null };
    } catch {
      return { nickname: null, email: null };
    }
  }

  private async token(body: Record<string, string>, now: Date): Promise<OAuthTokens> {
    let response: Response;

    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível falar com o Mercado Pago. Tente de novo em instantes.',
      );
    }

    if (!response.ok) {
      const error = await this.errorCode(response);

      // So o status e o codigo: o corpo da requisicao leva `client_secret`,
      // `code` ou `refresh_token`, e nenhum deles pode acabar no log.
      this.logger.error(
        `Mercado Pago recusou ${body.grant_type} com ${response.status}: ${error}`,
      );

      throw new OAuthGrantError(error);
    }

    const tokens = (await response.json()) as TokenResponse;

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      mpUserId: String(tokens.user_id),
      scope: tokens.scope ?? '',
      liveMode: tokens.live_mode ?? true,
      expiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    };
  }

  private async errorCode(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: string };

      return body.error ?? `http_${response.status}`;
    } catch {
      return `http_${response.status}`;
    }
  }
}
