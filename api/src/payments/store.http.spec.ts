import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

const OFFER = {
  modules: [{ order: 1, title: 'Fundamentos do RH Estratégico', priceCents: 19700 }],
  bundle: {
    slug: 'imersao-rh-lancamento',
    title: 'Pacote de Lançamento — Imersão RH Estratégico',
    modules: [{ order: 1, title: 'Fundamentos do RH Estratégico', priceCents: 19700 }],
    modulesTotalCents: 256400,
    tier: { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20, remaining: 7 },
    nextTier: { name: '2º Lote', priceCents: 79700 },
  },
};

/**
 * Sobe so o `StoreController`. O `FirebaseAuthGuard` e trocado por um que
 * **recusa** quando o teste pede "sem token": e assim que se prova que a
 * vitrine publica nao passa por ele, e que as outras rotas continuam passando.
 */
async function buildApp(authenticated: boolean) {
  const moduleRef = await Test.createTestingModule({
    controllers: [StoreController],
    providers: [
      {
        provide: StoreService,
        useValue: {
          catalog: jest.fn().mockResolvedValue([]),
          offer: jest.fn().mockResolvedValue(OFFER),
        },
      },
      { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (!authenticated) {
          throw new UnauthorizedException();
        }

        context.switchToHttp().getRequest().user = {
          uid: 'uid-aluno',
          email: 'aluno@delcastanher.com',
          name: 'Ana',
          role: 'aluno',
        };

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return app;
}

/** Spec 019, decisoes 9 e 10. */
describe('Loja (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /store/offer', () => {
    it('responde sem token, com cache publico curto', async () => {
      app = await buildApp(false);

      const response = await request(app.getHttpServer()).get('/store/offer').expect(200);

      expect(response.headers['cache-control']).toBe('public, max-age=30');
      expect(response.body.bundle.tier.name).toBe('Lote Fundador');
      expect(response.body.modules).toHaveLength(1);
    });

    it('nao traz dado de aluno nem estado de acesso', async () => {
      app = await buildApp(false);

      const response = await request(app.getHttpServer()).get('/store/offer').expect(200);
      const body = JSON.stringify(response.body);

      for (const key of ['uid', 'email', 'access', 'unlocked', 'expiresAt', 'userId']) {
        expect(body).not.toContain(`"${key}"`);
      }
    });
  });

  it('o catalogo continua exigindo sessao', async () => {
    app = await buildApp(false);

    await request(app.getHttpServer()).get('/store/catalog').expect(401);
  });

  it('o payment-config continua exigindo sessao e anuncia 12 parcelas', async () => {
    app = await buildApp(false);
    await request(app.getHttpServer()).get('/store/payment-config').expect(401);
    await app.close();

    app = await buildApp(true);
    const response = await request(app.getHttpServer()).get('/store/payment-config').expect(200);

    expect(response.body.maxInstallments).toBe(12);
  });
});
