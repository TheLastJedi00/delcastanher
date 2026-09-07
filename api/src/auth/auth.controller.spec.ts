import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import { AccountDto } from './dto/account.dto';
import { AuthSession } from './auth.types';

const SESSION: AuthSession = {
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
  user: { uid: 'uid-1', email: 'aluno@delcastanher.com', name: 'Aluno', role: 'aluno' },
};

async function errorsFor<T extends object>(cls: new () => T, payload: unknown) {
  return validate(plainToInstance(cls, payload as object));
}

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    login: jest.fn(),
    verify: jest.fn(),
    requestAccount: jest.fn(),
    requestPasswordReset: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  describe('POST /auth/login', () => {
    it('delega ao AuthService e devolve a sessao', async () => {
      authService.login.mockResolvedValue(SESSION);

      await expect(
        controller.login({ email: 'aluno@delcastanher.com', password: 'senha123' }),
      ).resolves.toEqual(SESSION);
      expect(authService.login).toHaveBeenCalledWith('aluno@delcastanher.com', 'senha123');
    });

    it('propaga o erro do servico sem mascarar', async () => {
      const boom = new Error('falhou');
      authService.login.mockRejectedValue(boom);

      await expect(controller.login({ email: 'a@b.com', password: 'x' })).rejects.toBe(boom);
    });
  });

  describe('POST /auth/verify', () => {
    it('devolve o usuario correspondente ao idToken', async () => {
      authService.verify.mockResolvedValue(SESSION.user);

      await expect(controller.verify({ idToken: 'id-token' })).resolves.toEqual(SESSION.user);
      expect(authService.verify).toHaveBeenCalledWith('id-token');
    });
  });

  describe('POST /auth/account', () => {
    it('delega a criacao de conta ao AuthService', async () => {
      authService.requestAccount.mockResolvedValue({ message: 'ok' });

      await expect(controller.requestAccount({ email: 'novo@delcastanher.com' })).resolves.toEqual({
        message: 'ok',
      });
      expect(authService.requestAccount).toHaveBeenCalledWith('novo@delcastanher.com');
    });
  });

  describe('POST /auth/password-reset', () => {
    it('delega o reenvio do link ao AuthService', async () => {
      authService.requestPasswordReset.mockResolvedValue({ message: 'ok' });

      await controller.requestPasswordReset({ email: 'existente@delcastanher.com' });

      expect(authService.requestPasswordReset).toHaveBeenCalledWith('existente@delcastanher.com');
    });
  });

  describe('AccountDto', () => {
    it('aceita e normaliza um e-mail valido', () => {
      expect(plainToInstance(AccountDto, { email: ' A@B.com ' }).email).toBe('a@b.com');
    });

    it('rejeita e-mail invalido', async () => {
      expect((await errorsFor(AccountDto, { email: 'x' })).map(e => e.property)).toContain('email');
    });
  });

  describe('LoginDto', () => {
    it('aceita um payload valido', async () => {
      expect(await errorsFor(LoginDto, { email: 'a@b.com', password: 'senha123' })).toHaveLength(0);
    });

    it('rejeita e-mail em formato invalido', async () => {
      const errors = await errorsFor(LoginDto, { email: 'nao-e-email', password: 'senha123' });

      expect(errors.map(e => e.property)).toContain('email');
    });

    it('rejeita senha ausente', async () => {
      const errors = await errorsFor(LoginDto, { email: 'a@b.com' });

      expect(errors.map(e => e.property)).toContain('password');
    });

    it('normaliza o e-mail para minusculas e sem espacos', () => {
      const dto = plainToInstance(LoginDto, { email: '  A@B.com ', password: 'senha123' });

      expect(dto.email).toBe('a@b.com');
    });
  });

  describe('VerifyDto', () => {
    it('aceita um idToken preenchido', async () => {
      expect(await errorsFor(VerifyDto, { idToken: 'abc' })).toHaveLength(0);
    });

    it('rejeita idToken vazio', async () => {
      const errors = await errorsFor(VerifyDto, { idToken: '' });

      expect(errors.map(e => e.property)).toContain('idToken');
    });
  });
});
