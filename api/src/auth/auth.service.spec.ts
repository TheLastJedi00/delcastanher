import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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
      providers: [AuthService, { provide: FirebaseService, useValue: firebaseMock }],
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

      const session = await service.login('aluno@delcastanher.com', 'senha123');

      expect(session).toEqual({
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        user: {
          uid: 'uid-1',
          email: 'aluno@delcastanher.com',
          name: 'Aluno Teste',
          role: 'admin',
        },
      });
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

      const session = await service.login('aluno@delcastanher.com', 'senha123');

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
});
