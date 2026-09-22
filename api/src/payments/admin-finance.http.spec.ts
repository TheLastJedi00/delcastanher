import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { GatewayFeesService } from './gateway-fees.service';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-admin', email: 'admin@delcastanher.com', name: 'Admin', role };
}

const VIGENCIA = {
  id: 'fee-1',
  method: 'PIX',
  percentBasisPoints: 99,
  fixedCents: 0,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: null,
  createdById: 'uid-admin',
  createdByEmail: 'admin@delcastanher.com',
  note: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

/**
 * Mesmo arranjo dos demais `*.http.spec.ts`: sobe so o controller, com o
 * ValidationPipe global do `main.ts`. O `FirebaseAuthGuard` e trocado por um
 * que injeta o usuario do papel pedido — ou por nenhum usuario, para o caso sem
 * token; o `RolesGuard` e o **real**, que e o que esta sob teste aqui.
 */
async function buildApp(
  overrides: {
    fees?: Partial<Record<keyof GatewayFeesService, jest.Mock>>;
    finance?: Partial<Record<keyof AdminFinanceService, jest.Mock>>;
  } = {},
  role: Role | null = 'admin',
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminFinanceController],
    providers: [
      Reflector,
      RolesGuard,
      {
        provide: GatewayFeesService,
        useValue: {
          history: jest.fn().mockResolvedValue([VIGENCIA]),
          current: jest.fn().mockResolvedValue({ PIX: VIGENCIA, CREDIT_CARD: null }),
          create: jest.fn().mockResolvedValue(VIGENCIA),
          ...overrides.fees,
        },
      },
      {
        provide: AdminFinanceService,
        useValue: {
          summary: jest.fn().mockResolvedValue({ totals: { grossCents: 0 } }),
          ...overrides.finance,
        },
      },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (role) {
          context.switchToHttp().getRequest().user = userWith(role);
        }

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
  await app.init();

  return app;
}

describe('Admin — financeiro: taxas (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /admin/finance/fees', () => {
    it('devolve o historico de vigencias para o administrador', async () => {
      app = await buildApp();

      const response = await request(app.getHttpServer()).get('/admin/finance/fees').expect(200);

      expect(response.body.history).toHaveLength(1);
      expect(response.body.history[0].percentBasisPoints).toBe(99);
    });

    // Decisao 7: quem digitou e quando fazem parte do dado, e nao de um log
    // que ninguem abre.
    it('devolve o autor de cada vigencia', async () => {
      app = await buildApp();

      const response = await request(app.getHttpServer()).get('/admin/finance/fees').expect(200);

      expect(response.body.history[0].createdByEmail).toBe('admin@delcastanher.com');
    });

    it('responde 401 sem token', async () => {
      app = await buildApp({}, null);

      await request(app.getHttpServer()).get('/admin/finance/fees').expect(401);
    });

    it('responde 403 para papel aluno', async () => {
      app = await buildApp({}, 'aluno');

      await request(app.getHttpServer()).get('/admin/finance/fees').expect(403);
    });
  });

  describe('POST /admin/finance/fees', () => {
    it('cadastra a vigencia e devolve a linha criada', async () => {
      const create = jest.fn().mockResolvedValue(VIGENCIA);
      app = await buildApp({ fees: { create } });

      await request(app.getHttpServer())
        .post('/admin/finance/fees')
        .send({
          method: 'PIX',
          percentBasisPoints: 99,
          fixedCents: 0,
          validFrom: '2026-09-01T00:00:00.000Z',
        })
        .expect(201);

      expect(create).toHaveBeenCalled();
    });

    // Decisao 7: a autoria sai do `@CurrentUser()`, e nunca do corpo. O que o
    // cliente declara sobre quem ele e nao e autoria.
    it('toma o autor do token, e nao do corpo da requisicao', async () => {
      const create = jest.fn().mockResolvedValue(VIGENCIA);
      app = await buildApp({ fees: { create } });

      await request(app.getHttpServer())
        .post('/admin/finance/fees')
        .send({
          method: 'PIX',
          percentBasisPoints: 99,
          fixedCents: 0,
          validFrom: '2026-09-01T00:00:00.000Z',
        })
        .expect(201);

      const [actor, dto] = create.mock.calls[0];

      expect(actor).toMatchObject({ uid: 'uid-admin', email: 'admin@delcastanher.com' });
      expect(dto).not.toHaveProperty('createdById');
      expect(dto).not.toHaveProperty('createdByEmail');
    });

    it('recusa um corpo que tente declarar o autor', async () => {
      app = await buildApp();

      await request(app.getHttpServer())
        .post('/admin/finance/fees')
        .send({
          method: 'PIX',
          percentBasisPoints: 99,
          validFrom: '2026-09-01T00:00:00.000Z',
          createdById: 'uid-de-outra-pessoa',
        })
        .expect(400);
    });

    it('recusa metodo fora do conjunto', async () => {
      app = await buildApp();

      await request(app.getHttpServer())
        .post('/admin/finance/fees')
        .send({
          method: 'BOLETO',
          percentBasisPoints: 99,
          validFrom: '2026-09-01T00:00:00.000Z',
        })
        .expect(400);
    });

    it('recusa data de inicio que nao seja ISO 8601', async () => {
      app = await buildApp();

      await request(app.getHttpServer())
        .post('/admin/finance/fees')
        .send({ method: 'PIX', percentBasisPoints: 99, validFrom: '01/09/2026' })
        .expect(400);
    });

    it('responde 401 sem token', async () => {
      app = await buildApp({}, null);

      await request(app.getHttpServer())
        .post('/admin/finance/fees')
        .send({ method: 'PIX', percentBasisPoints: 99, validFrom: '2026-09-01T00:00:00.000Z' })
        .expect(401);
    });

    it('responde 403 para papel aluno', async () => {
      app = await buildApp({}, 'aluno');

      await request(app.getHttpServer())
        .post('/admin/finance/fees')
        .send({ method: 'PIX', percentBasisPoints: 99, validFrom: '2026-09-01T00:00:00.000Z' })
        .expect(403);
    });
  });
});
