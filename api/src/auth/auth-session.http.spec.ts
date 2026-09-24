import { INestApplication, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TrustedOriginGuard } from './trusted-origin.guard';

const FRONT = 'https://www.delcastanher.srv.br';

const SESSION = {
  idToken: 'id-token',
  expiresIn: 3600,
  user: { uid: 'uid-1', email: 'aluno@delcastanher.com', name: 'Aluno', role: 'aluno' },
};

const ENV: Record<string, string | undefined> = { CORS_ORIGINS: FRONT };

async function buildApp() {
  const auth = {
    login: jest.fn().mockResolvedValue({ session: SESSION, refreshToken: 'refresh-do-login' }),
    refresh: jest.fn().mockResolvedValue({ session: SESSION, refreshToken: 'refresh-rotacionado' }),
    requestAccount: jest.fn(),
    requestPasswordReset: jest.fn(),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: ConfigService, useValue: { get: (key: string) => ENV[key] } },
      TrustedOriginGuard,
    ],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();

  app.use(cookieParser());
  await app.init();

  return { app, auth };
}

/** Cabecalhos `Set-Cookie` da resposta, sempre como lista. */
function setCookies(response: request.Response): string[] {
  const raw = response.headers['set-cookie'] as string | string[] | undefined;

  return raw === undefined ? [] : ([] as string[]).concat(raw);
}

/** O `Set-Cookie` do refresh token, ou `undefined` quando a resposta nao mexe nele. */
function refreshCookie(response: request.Response): string | undefined {
  return setCookies(response).find(cookie => cookie.startsWith('__Secure-refresh='));
}

/** Um `Set-Cookie` que apaga: valor vazio e data no passado. */
function isCleared(cookie: string | undefined): boolean {
  return !!cookie && cookie.startsWith('__Secure-refresh=;') && /Expires=Thu, 01 Jan 1970/.test(cookie);
}

/**
 * Sessao com refresh token em cookie HttpOnly (Spec 017, decisoes 12 a 17).
 */
describe('sessao por cookie em /auth', () => {
  let app: INestApplication;
  let auth: Awaited<ReturnType<typeof buildApp>>['auth'];

  beforeEach(async () => {
    ({ app, auth } = await buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('responde a sessao sem o refresh token no corpo (decisao 13)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'aluno@delcastanher.com', password: 'senha123' })
        .expect(200);

      expect(response.body).toEqual(SESSION);
      expect(JSON.stringify(response.body)).not.toContain('refresh-do-login');
    });

    it('grava o refresh token no cookie com HttpOnly, Secure, SameSite=Strict e Path=/auth, sem Domain', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'aluno@delcastanher.com', password: 'senha123' })
        .expect(200);

      const cookie = refreshCookie(response);

      expect(cookie).toMatch(/^__Secure-refresh=refresh-do-login;/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Strict/);
      expect(cookie).toMatch(/; Path=\/auth(;|$)/);
      expect(cookie).toMatch(/; Max-Age=2592000;/);
      expect(cookie).not.toMatch(/Domain=/i);
    });

    it('nao grava cookie quando o login falha', async () => {
      auth.login.mockRejectedValue(new UnauthorizedException('E-mail ou senha invalidos.'));

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'aluno@delcastanher.com', password: 'errada' })
        .expect(401);

      expect(refreshCookie(response)).toBeUndefined();
    });
  });

  describe('POST /auth/refresh', () => {
    it('troca o cookie por uma sessao nova e regrava o cookie com o token devolvido (decisao 14)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Origin', FRONT)
        .set('Cookie', '__Secure-refresh=refresh-do-login')
        .expect(200);

      expect(auth.refresh).toHaveBeenCalledWith('refresh-do-login');
      expect(response.body).toEqual(SESSION);
      expect(refreshCookie(response)).toMatch(/^__Secure-refresh=refresh-rotacionado;.*Max-Age=2592000/);
    });

    it('repassa ao servico a ausencia de cookie, que decide o 401', async () => {
      auth.refresh.mockRejectedValue(new UnauthorizedException('Sessao encerrada.'));

      await request(app.getHttpServer()).post('/auth/refresh').set('Origin', FRONT).expect(401);

      expect(auth.refresh).toHaveBeenCalledWith(undefined);
    });

    it('apaga o cookie quando o Firebase recusa o token — um cookie morto so geraria 401 em loop', async () => {
      auth.refresh.mockRejectedValue(new UnauthorizedException('Sessao encerrada.'));

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Origin', FRONT)
        .set('Cookie', '__Secure-refresh=revogado')
        .expect(401);

      const cookie = refreshCookie(response);

      expect(isCleared(cookie)).toBe(true);
      expect(cookie).toMatch(/; Path=\/auth(;|$)/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; SameSite=Strict/);
    });

    it('mantem o cookie quando o Firebase esta fora do ar: o token nao foi recusado', async () => {
      auth.refresh.mockRejectedValue(new ServiceUnavailableException('Tente novamente.'));

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Origin', FRONT)
        .set('Cookie', '__Secure-refresh=valido')
        .expect(503);

      expect(refreshCookie(response)).toBeUndefined();
    });
  });
});
