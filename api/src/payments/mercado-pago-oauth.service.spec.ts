import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { MercadoPagoOAuthService, OAuthGrantError } from './mercado-pago-oauth.service';

const CONFIG: Record<string, string> = {
  MP_CLIENT_ID: '4932690255162951',
  MP_CLIENT_SECRET: 'segredo-da-aplicacao',
  MP_OAUTH_REDIRECT_URI: 'https://api.delcastanher.srv.br/mercadopago/oauth/callback',
  MP_SANDBOX: 'true',
};

/** Resposta de `POST /oauth/token`, no formato do Mercado Pago. */
const TOKEN_RESPONSE = {
  access_token: 'APP_USR-4932690255162951-092512-abc-123456789',
  token_type: 'Bearer',
  expires_in: 15552000,
  scope: 'offline_access read write',
  user_id: 123456789,
  refresh_token: 'TG-refresh-1',
  public_key: 'APP_USR-public-do-vendedor',
  live_mode: false,
};

function mockFetch(response: unknown, ok = true, status = ok ? 200 : 400) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  return fetchMock;
}

function service(overrides: Record<string, string> = {}): MercadoPagoOAuthService {
  const values = { ...CONFIG, ...overrides };
  const config = { get: jest.fn((name: string) => values[name]) };

  return new MercadoPagoOAuthService(config as unknown as ConfigService);
}

function bodyOf(fetchMock: jest.Mock): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
}

describe('MercadoPagoOAuthService (Spec 020)', () => {
  describe('PKCE (decisao 5)', () => {
    it('gera um verifier de 43 a 128 caracteres, so com os caracteres permitidos', () => {
      const { verifier } = service().pkcePair();

      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('deriva o challenge por S256: BASE64URL(SHA256(verifier))', () => {
      const { verifier, challenge } = service().pkcePair();
      const expected = createHash('sha256').update(verifier).digest('base64url');

      expect(challenge).toBe(expected);
    });

    it('gera um par novo a cada chamada', () => {
      expect(service().pkcePair().verifier).not.toBe(service().pkcePair().verifier);
    });
  });

  describe('URL de autorizacao', () => {
    it('leva aplicacao, redirect fixo, state e o desafio do PKCE', () => {
      const url = new URL(service().authorizationUrl('estado-1', 'desafio-1'));

      expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com/authorization');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: '4932690255162951',
        response_type: 'code',
        platform_id: 'mp',
        redirect_uri: 'https://api.delcastanher.srv.br/mercadopago/oauth/callback',
        state: 'estado-1',
        code_challenge: 'desafio-1',
        code_challenge_method: 'S256',
      });
    });
  });

  describe('troca do code', () => {
    it('envia code, verifier, credenciais e o redirect cadastrado', async () => {
      const fetchMock = mockFetch(TOKEN_RESPONSE);

      await service().exchangeCode('TG-code-1', 'verifier-1');

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.mercadopago.com/oauth/token');
      expect(bodyOf(fetchMock)).toEqual({
        client_id: '4932690255162951',
        client_secret: 'segredo-da-aplicacao',
        grant_type: 'authorization_code',
        code: 'TG-code-1',
        code_verifier: 'verifier-1',
        redirect_uri: 'https://api.delcastanher.srv.br/mercadopago/oauth/callback',
        test_token: 'true',
      });
    });

    // O ambiente e da branch: preview roda com `MP_SANDBOX=true` e credencial
    // `TEST-`, producao com `APP_USR-`. O token do vendedor acompanha.
    it('pede token de teste em sandbox, e de producao fora dele', async () => {
      const sandbox = mockFetch(TOKEN_RESPONSE);
      await service().exchangeCode('TG-code-1', 'verifier-1');
      expect(bodyOf(sandbox).test_token).toBe('true');

      const production = mockFetch(TOKEN_RESPONSE);
      await service({ MP_SANDBOX: 'false' }).exchangeCode('TG-code-1', 'verifier-1');
      expect(bodyOf(production).test_token).toBe('false');
    });

    it('devolve tokens, conta, escopo, ambiente e vencimento', async () => {
      mockFetch(TOKEN_RESPONSE);
      const now = new Date('2026-09-25T12:00:00.000Z');

      const tokens = await service().exchangeCode('TG-code-1', 'verifier-1', now);

      expect(tokens).toEqual({
        accessToken: TOKEN_RESPONSE.access_token,
        refreshToken: 'TG-refresh-1',
        mpUserId: '123456789',
        scope: 'offline_access read write',
        liveMode: false,
        expiresAt: new Date(now.getTime() + 15552000 * 1000),
      });
    });

    it('traduz a recusa do Mercado Pago em OAuthGrantError com o codigo dele', async () => {
      mockFetch({ error: 'invalid_grant', message: 'invalid_grant' }, false);

      await expect(service().exchangeCode('TG-velho', 'verifier-1')).rejects.toEqual(
        new OAuthGrantError('invalid_grant'),
      );
    });

    // O corpo da requisicao leva `client_secret` e `code`: nenhum dos dois
    // pode acabar no log.
    it('nao loga o corpo da requisicao na falha', async () => {
      mockFetch({ error: 'invalid_client' }, false, 401);
      const logged: string[] = [];
      const oauth = service();
      jest
        .spyOn((oauth as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
        .mockImplementation((message: string) => logged.push(message));

      await expect(oauth.exchangeCode('TG-code-1', 'verifier-1')).rejects.toBeInstanceOf(
        OAuthGrantError,
      );

      expect(logged.join(' ')).not.toContain('segredo-da-aplicacao');
      expect(logged.join(' ')).not.toContain('TG-code-1');
    });

    it('loga a explicacao do Mercado Pago junto do codigo', async () => {
      mockFetch({ error: 'invalid_request', message: 'code_verifier is required' }, false);
      const logged: string[] = [];
      const oauth = service();
      jest
        .spyOn((oauth as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
        .mockImplementation((message: string) => logged.push(message));

      await expect(oauth.exchangeCode('TG-code-1', 'verifier-1')).rejects.toEqual(
        new OAuthGrantError('invalid_request'),
      );

      expect(logged).toEqual([
        'Mercado Pago recusou authorization_code com 400: invalid_request (code_verifier is required)',
      ]);
    });

    it('trata falha de rede como indisponibilidade, e nao como recusa', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;

      await expect(service().exchangeCode('TG-code-1', 'verifier-1')).rejects.toMatchObject({
        status: 503,
      });
    });
  });

  describe('renovacao (decisao 8)', () => {
    it('troca o refresh_token por um par novo', async () => {
      const fetchMock = mockFetch({ ...TOKEN_RESPONSE, refresh_token: 'TG-refresh-2' });

      const tokens = await service().refresh('TG-refresh-1');

      expect(bodyOf(fetchMock)).toEqual({
        client_id: '4932690255162951',
        client_secret: 'segredo-da-aplicacao',
        grant_type: 'refresh_token',
        refresh_token: 'TG-refresh-1',
      });
      expect(tokens.refreshToken).toBe('TG-refresh-2');
    });
  });

  describe('conta conectada', () => {
    it('busca apelido e e-mail com o token do vendedor', async () => {
      const fetchMock = mockFetch({ id: 123456789, nickname: 'LIDIANE', email: 'l@exemplo.com' });

      const account = await service().fetchAccount('APP_USR-token');

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.mercadopago.com/users/me');
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer APP_USR-token');
      expect(account).toEqual({ nickname: 'LIDIANE', email: 'l@exemplo.com' });
    });

    // Apelido e e-mail sao para o painel; a falha deles nao pode derrubar uma
    // conexao que ja tem token valido.
    it('devolve vazio se a consulta falhar', async () => {
      mockFetch({ message: 'forbidden' }, false, 403);

      await expect(service().fetchAccount('APP_USR-token')).resolves.toEqual({
        nickname: null,
        email: null,
      });
    });
  });
});
