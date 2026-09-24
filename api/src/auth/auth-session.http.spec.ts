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

  /**
   * CSRF (decisao 16): o CORS impede outra origem de LER a resposta, mas nao
   * de disparar o POST. A conferencia de `Origin` impede o disparo.
   */
  describe('conferencia de Origin nas rotas com cookie', () => {
    it.each([['/auth/refresh'], ['/auth/logout']])('%s recusa origem fora de CORS_ORIGINS com 403', async path => {
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Origin', 'https://atacante.example')
        .set('Cookie', '__Secure-refresh=valido')
        .expect(403);

      expect(refreshCookie(response)).toBeUndefined();
      expect(auth.refresh).not.toHaveBeenCalled();
    });

    it.each([['/auth/refresh'], ['/auth/logout']])('%s recusa requisicao sem Origin com 403', async path => {
      await request(app.getHttpServer()).post(path).set('Cookie', '__Secure-refresh=valido').expect(403);

      expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('nao confunde origem parecida com a liberada', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Origin', `${FRONT}.atacante.example`)
        .set('Cookie', '__Secure-refresh=valido')
        .expect(403);
    });

    it('o login nao le cookie e continua aceitando chamada sem Origin', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'aluno@delcastanher.com', password: 'senha123' })
        .expect(200);
    });
  });

  /**
   * Logout (decisao 17): com o token em HttpOnly o front nao consegue apagar
   * o cookie sozinho. Sair deste navegador nao derruba os outros dispositivos.
   */
  describe('POST /auth/logout', () => {
    it('responde 204 e apaga o cookie com os mesmos atributos com que foi gravado', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', FRONT)
        .set('Cookie', '__Secure-refresh=valido')
        .expect(204);

      const cookie = refreshCookie(response);

      expect(isCleared(cookie)).toBe(true);
      expect(cookie).toMatch(/; Path=\/auth(;|$)/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).not.toMatch(/Domain=/i);
    });

    it('responde igual sem cookie: sair duas vezes nao e erro', async () => {
      const response = await request(app.getHttpServer()).post('/auth/logout').set('Origin', FRONT).expect(204);

      expect(isCleared(refreshCookie(response))).toBe(true);
    });

    it('nao fala com o Firebase: nenhuma revogacao, que encerraria todos os dispositivos', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', FRONT)
        .set('Cookie', '__Secure-refresh=valido')
        .expect(204);

      for (const method of Object.values(auth)) {
        expect(method).not.toHaveBeenCalled();
      }
    });
  });

  describe('POST /auth/verify', () => {
    it('deixou de existir: a retomada de sessao e o /auth/refresh (decisao 21)', async () => {
      await request(app.getHttpServer()).post('/auth/verify').send({ idToken: 'id-token' }).expect(404);
    });
  });
});
