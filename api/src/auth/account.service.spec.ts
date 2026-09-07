import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { FirebaseService } from '../firebase/firebase.service';

const getUserByEmail = jest.fn();
const createUser = jest.fn();

const firebaseMock = {
  webApiKey: 'web-key',
  auth: { getUserByEmail, createUser, verifyIdToken: jest.fn() },
} as unknown as FirebaseService;

function restResponse(ok: boolean, body: unknown) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) } as Response);
}

/** Erro no formato do Admin SDK para usuario inexistente. */
function userNotFound() {
  return Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
}

describe('AuthService - criacao de conta e definicao de senha', () => {
  let service: AuthService;
  let fetchMock: jest.Mock;
  const env: Record<string, string | undefined> = { FRONTEND_URL: 'https://app.delcastanher.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockReturnValue(restResponse(true, { email: 'novo@delcastanher.com' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: FirebaseService, useValue: firebaseMock },
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('requestAccount', () => {
    it('cria o usuario no Firebase quando o e-mail ainda nao tem conta', async () => {
      getUserByEmail.mockRejectedValue(userNotFound());
      createUser.mockResolvedValue({ uid: 'uid-novo' });

      await service.requestAccount('novo@delcastanher.com');

      expect(createUser).toHaveBeenCalledTimes(1);
      const [payload] = createUser.mock.calls[0] as [{ email: string; password: string }];
      expect(payload.email).toBe('novo@delcastanher.com');
      // Senha temporaria descartavel: o usuario define a dele pelo link do e-mail.
      expect(payload.password.length).toBeGreaterThanOrEqual(24);
    });

    it('nao recria a conta quando o e-mail ja existe', async () => {
      getUserByEmail.mockResolvedValue({ uid: 'uid-existente' });

      await service.requestAccount('existente@delcastanher.com');

      expect(createUser).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('dispara o e-mail de definicao de senha com o continueUrl apontando para o login', async () => {
      getUserByEmail.mockResolvedValue({ uid: 'uid-1' });

      await service.requestAccount('  Novo@Delcastanher.com  ');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('accounts:sendOobCode');
      expect(url).toContain('key=web-key');
      expect(JSON.parse(init.body as string)).toEqual({
        requestType: 'PASSWORD_RESET',
        email: 'novo@delcastanher.com',
        continueUrl: 'https://app.delcastanher.com/login',
        canHandleCodeInApp: false,
      });
    });

    it('cai no localhost:4200 quando FRONTEND_URL nao esta configurada', async () => {
      env.FRONTEND_URL = undefined;
      getUserByEmail.mockResolvedValue({ uid: 'uid-1' });

      await service.requestAccount('novo@delcastanher.com');

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).continueUrl).toBe('http://localhost:4200/login');
      env.FRONTEND_URL = 'https://app.delcastanher.com';
    });

    it('devolve a mesma mensagem para conta nova e conta existente', async () => {
      getUserByEmail.mockResolvedValue({ uid: 'uid-1' });
      const existente = await service.requestAccount('existente@delcastanher.com');

      getUserByEmail.mockRejectedValue(userNotFound());
      createUser.mockResolvedValue({ uid: 'uid-novo' });
      const nova = await service.requestAccount('novo@delcastanher.com');

      expect(nova.message).toBe(existente.message);
      expect(nova.message).toMatch(/link/i);
    });

    it('rejeita e-mail vazio antes de tocar no Firebase', async () => {
      await expect(service.requestAccount('   ')).rejects.toThrow(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('traduz o erro do Firebase quando o envio falha', async () => {
      getUserByEmail.mockResolvedValue({ uid: 'uid-1' });
      fetchMock.mockReturnValue(restResponse(false, { error: { message: 'INVALID_EMAIL' } }));

      await expect(service.requestAccount('a@b.com')).rejects.toThrow('E-mail invalido.');
    });

    it('sinaliza indisponibilidade quando o Firebase nao responde', async () => {
      getUserByEmail.mockResolvedValue({ uid: 'uid-1' });
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.requestAccount('a@b.com')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('requestPasswordReset', () => {
    it('envia o link sem criar conta para quem ja tem cadastro', async () => {
      getUserByEmail.mockResolvedValue({ uid: 'uid-1' });

      await service.requestPasswordReset('existente@delcastanher.com');

      expect(createUser).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('nao cria conta nem revela ausencia quando o e-mail nao existe', async () => {
      getUserByEmail.mockRejectedValue(userNotFound());

      const result = await service.requestPasswordReset('naoexiste@delcastanher.com');

      expect(createUser).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.message).toMatch(/link/i);
    });
  });
});
