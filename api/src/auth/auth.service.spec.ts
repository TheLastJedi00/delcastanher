import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { FirebaseService } from '../firebase/firebase.service';

const verifyIdToken = jest.fn();
const getUser = jest.fn();

const firebaseMock = {
  webApiKey: 'web-key',
  auth: { verifyIdToken, getUser },
} as unknown as FirebaseService;

function restResponse(ok: boolean, body: unknown) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  } as Response);
}

const SIGN_IN_OK = {
  localId: 'uid-1',
  email: 'aluno@delcastanher.com',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  expiresIn: '3600',
};

describe('AuthService', () => {
  let service: AuthService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: FirebaseService, useValue: firebaseMock },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('autentica na REST API do Firebase e devolve a sessao com o perfil do usuario', async () => {
      fetchMock.mockReturnValue(restResponse(true, SIGN_IN_OK));
      verifyIdToken.mockResolvedValue({
        uid: 'uid-1',
        email: 'aluno@delcastanher.com',
        name: 'Aluno Teste',
        role: 'admin',
      });

      const issued = await service.login('aluno@delcastanher.com', 'senha123');

      expect(issued.session).toEqual({
        idToken: 'id-token',
        expiresIn: 3600,
        user: {
          uid: 'uid-1',
          email: 'aluno@delcastanher.com',
          name: 'Aluno Teste',
          role: 'admin',
        },
      });
    });

    it('separa o refresh token da sessao, que vai para o corpo da resposta (Spec 017, decisao 13)', async () => {
      fetchMock.mockReturnValue(restResponse(true, SIGN_IN_OK));
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'aluno@delcastanher.com' });

      const issued = await service.login('aluno@delcastanher.com', 'senha123');

      expect(issued.refreshToken).toBe('refresh-token');
      expect(issued.session).not.toHaveProperty('refreshToken');
    });

    it('chama o endpoint signInWithPassword com a web api key', async () => {
      fetchMock.mockReturnValue(restResponse(true, SIGN_IN_OK));
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'aluno@delcastanher.com' });

      await service.login('aluno@delcastanher.com', 'senha123');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('accounts:signInWithPassword');
      expect(url).toContain('key=web-key');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        email: 'aluno@delcastanher.com',
        password: 'senha123',
        returnSecureToken: true,
      });
    });

    it('assume o perfil aluno quando nao ha custom claim de role', async () => {
      fetchMock.mockReturnValue(restResponse(true, SIGN_IN_OK));
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'aluno@delcastanher.com' });

      const { session } = await service.login('aluno@delcastanher.com', 'senha123');

      expect(session.user.role).toBe('aluno');
      expect(session.user.name).toBeNull();
    });

    it('normaliza o e-mail antes de enviar ao Firebase', async () => {
      fetchMock.mockReturnValue(restResponse(true, SIGN_IN_OK));
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'aluno@delcastanher.com' });

      await service.login('  Aluno@Delcastanher.com  ', 'senha123');

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).email).toBe('aluno@delcastanher.com');
    });

    it.each([['EMAIL_NOT_FOUND'], ['INVALID_PASSWORD'], ['INVALID_LOGIN_CREDENTIALS']])(
      'traduz %s para uma mensagem generica de credenciais invalidas',
      async code => {
        fetchMock.mockReturnValue(restResponse(false, { error: { message: code } }));

        await expect(service.login('a@b.com', 'x')).rejects.toThrow(UnauthorizedException);
        await expect(service.login('a@b.com', 'x')).rejects.toThrow('E-mail ou senha invalidos.');
      },
    );

    it('informa quando a conta esta desativada', async () => {
      fetchMock.mockReturnValue(restResponse(false, { error: { message: 'USER_DISABLED' } }));

      await expect(service.login('a@b.com', 'x')).rejects.toThrow('Conta desativada.');
    });

    it('informa quando o Firebase bloqueia por excesso de tentativas', async () => {
      fetchMock.mockReturnValue(
        restResponse(false, { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : tente depois' } }),
      );

      await expect(service.login('a@b.com', 'x')).rejects.toThrow(
        /muitas tentativas/i,
      );
    });

    it('propaga erro de indisponibilidade quando o Firebase nao responde', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.login('a@b.com', 'x')).rejects.toThrow(ServiceUnavailableException);
    });

    it('rejeita quando o idToken devolvido nao passa na verificacao do Admin SDK', async () => {
      fetchMock.mockReturnValue(restResponse(true, SIGN_IN_OK));
      verifyIdToken.mockRejectedValue(new Error('token invalido'));

      await expect(service.login('a@b.com', 'x')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verify', () => {
    it('devolve o usuario quando o idToken e valido', async () => {
      verifyIdToken.mockResolvedValue({
        uid: 'uid-1',
        email: 'admin@delcastanher.com',
        name: 'Admin',
        role: 'admin',
      });

      await expect(service.verify('id-token')).resolves.toEqual({
        uid: 'uid-1',
        email: 'admin@delcastanher.com',
        name: 'Admin',
        role: 'admin',
      });
      expect(verifyIdToken).toHaveBeenCalledWith('id-token', true);
    });

    it('rejeita idToken invalido ou expirado', async () => {
      verifyIdToken.mockRejectedValue(new Error('expired'));

      await expect(service.verify('ruim')).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita idToken vazio', async () => {
      await expect(service.verify('')).rejects.toThrow(BadRequestException);
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('ignora uma role desconhecida vinda das claims e assume aluno', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'a@b.com', role: 'root' });

      await expect(service.verify('id-token')).resolves.toMatchObject({ role: 'aluno' });
    });
  });

  /**
   * Troca do refresh token por um idToken novo (Spec 017, decisao 14). A
   * resposta da Secure Token API usa snake_case, ao contrario da Identity
   * Toolkit do login.
   */
  describe('refresh', () => {
    const TOKEN_OK = {
      id_token: 'id-token-novo',
      refresh_token: 'refresh-token-novo',
      expires_in: '3600',
      token_type: 'Bearer',
      user_id: 'uid-1',
    };

    it('troca o refresh token na Secure Token API com a web api key', async () => {
      fetchMock.mockReturnValue(restResponse(true, TOKEN_OK));
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'aluno@delcastanher.com' });

      await service.refresh('refresh-token');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://securetoken.googleapis.com/v1/token?key=web-key');
      expect(init.method).toBe('POST');
      expect(new URLSearchParams(init.body as string).get('grant_type')).toBe('refresh_token');
      expect(new URLSearchParams(init.body as string).get('refresh_token')).toBe('refresh-token');
    });

    it('devolve a sessao nova e o refresh token que o Firebase devolveu, para regravar o cookie', async () => {
      fetchMock.mockReturnValue(restResponse(true, TOKEN_OK));
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'aluno@delcastanher.com', name: 'Aluno' });

      await expect(service.refresh('refresh-token')).resolves.toEqual({
        session: {
          idToken: 'id-token-novo',
          expiresIn: 3600,
          user: { uid: 'uid-1', email: 'aluno@delcastanher.com', name: 'Aluno', role: 'aluno' },
        },
        refreshToken: 'refresh-token-novo',
      });
    });

    it('revalida o idToken novo pelo Admin SDK e traz o papel atual, nao o do login', async () => {
      fetchMock.mockReturnValue(restResponse(true, TOKEN_OK));
      // Promovido a admin depois do login: o refresh e o momento em que o
      // papel novo chega ao front sem novo login.
      verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'aluno@delcastanher.com', role: 'admin' });

      const { session } = await service.refresh('refresh-token');

      expect(verifyIdToken).toHaveBeenCalledWith('id-token-novo', true);
      expect(session.user.role).toBe('admin');
    });

    it.each([[undefined], [''], ['   ']])('recusa sem tocar no Firebase quando nao ha refresh token (%p)', async token => {
      await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['TOKEN_EXPIRED'],
      ['USER_DISABLED'],
      ['USER_NOT_FOUND'],
      ['INVALID_REFRESH_TOKEN'],
      ['INVALID_GRANT_TYPE'],
      ['MISSING_REFRESH_TOKEN'],
    ])('trata %s como sessao encerrada (401)', async code => {
      fetchMock.mockReturnValue(restResponse(false, { error: { message: code } }));

      await expect(service.refresh('refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('trata como sessao encerrada quando o idToken novo nao passa no Admin SDK (token revogado)', async () => {
      fetchMock.mockReturnValue(restResponse(true, TOKEN_OK));
      verifyIdToken.mockRejectedValue(Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }));

      await expect(service.refresh('refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('sinaliza indisponibilidade (503), e nao sessao encerrada, quando o Firebase nao responde', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.refresh('refresh-token')).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
