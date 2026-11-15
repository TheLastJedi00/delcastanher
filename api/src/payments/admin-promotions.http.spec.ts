import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminPromotionsController } from './admin-promotions.controller';
import { PromotionsService } from './promotions.service';
import { StoreService } from './store.service';

const VIEW = {
  id: 'promo-1',
  name: 'Black Friday',
  percentOff: 30,
  startsAt: '2026-11-27T03:00:00.000Z',
  endsAt: '2026-12-01T03:00:00.000Z',
  endedEarlyAt: null,
  status: 'SCHEDULED',
};

async function buildApp(role: Role | null = 'admin') {
  const promotions = {
    list: jest.fn().mockResolvedValue([{ ...VIEW, totals: { paidOrders: 0, revenueCents: 0, discountCents: 0 } }]),
    create: jest.fn().mockResolvedValue(VIEW),
    update: jest.fn().mockResolvedValue(VIEW),
    remove: jest.fn().mockResolvedValue(undefined),
    endNow: jest.fn().mockResolvedValue({ ...VIEW, status: 'ENDED' }),
  };
  const store = {
    prices: jest.fn().mockResolvedValue({ modules: [], bundle: null }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminPromotionsController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: PromotionsService, useValue: promotions },
      { provide: StoreService, useValue: store },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (role) {
          context.switchToHttp().getRequest().user = {
            uid: 'uid-admin',
            email: 'admin@delcastanher.com',
            name: 'Admin',
            role,
          };
        }

        return true;
      },
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  await app.init();

  return { app, promotions, store };
}

const ROUTE = '/admin/promotions';
const BODY = {
  name: 'Black Friday',
  percentOff: 30,
  startsAt: '2026-11-27T03:00:00.000Z',
  endsAt: '2026-12-01T03:00:00.000Z',
};

/** Spec 032, decisoes 2 e 10: a campanha de desconto no financeiro. */
describe('Admin — campanhas de desconto (HTTP)', () => {
  it('lista as campanhas com os totais', async () => {
    const { app } = await buildApp();

    const response = await request(app.getHttpServer()).get(ROUTE).expect(200);

    expect(response.body[0]).toMatchObject({ id: 'promo-1', totals: { paidOrders: 0 } });

    await app.close();
  });

  it('cria com as datas convertidas e o admin da sessao', async () => {
    const { app, promotions } = await buildApp();

    await request(app.getHttpServer()).post(ROUTE).send(BODY).expect(201);

    expect(promotions.create).toHaveBeenCalledWith(
      {
        name: 'Black Friday',
        percentOff: 30,
        startsAt: new Date('2026-11-27T03:00:00.000Z'),
        endsAt: new Date('2026-12-01T03:00:00.000Z'),
      },
      'uid-admin',
    );

    await app.close();
  });

  it('recusa corpo invalido com 400, sem chegar ao servico', async () => {
    const { app, promotions } = await buildApp();
    const invalid = [
      { ...BODY, percentOff: 0 },
      { ...BODY, percentOff: 91 },
      { ...BODY, percentOff: 12.5 },
      { ...BODY, name: '' },
      { ...BODY, name: 'x'.repeat(61) },
      { ...BODY, startsAt: 'amanha' },
      { ...BODY, endsAt: undefined },
      { ...BODY, preco: 100 },
    ];

    for (const body of invalid) {
      await request(app.getHttpServer()).post(ROUTE).send(body).expect(400);
    }

    expect(promotions.create).not.toHaveBeenCalled();

    await app.close();
  });

  it('edita so o que veio no corpo', async () => {
    const { app, promotions } = await buildApp();

    await request(app.getHttpServer())
      .patch(`${ROUTE}/promo-1`)
      .send({ endsAt: '2026-12-02T03:00:00.000Z' })
      .expect(200);

    expect(promotions.update).toHaveBeenCalledWith('promo-1', { endsAt: new Date('2026-12-02T03:00:00.000Z') });

    await app.close();
  });

  it('apaga com 204 e encerra agora', async () => {
    const { app, promotions } = await buildApp();

    await request(app.getHttpServer()).delete(`${ROUTE}/promo-1`).expect(204);
    const ended = await request(app.getHttpServer()).post(`${ROUTE}/promo-1/end`).expect(200);

    expect(promotions.remove).toHaveBeenCalledWith('promo-1');
    expect(promotions.endNow).toHaveBeenCalledWith('promo-1');
    expect(ended.body.status).toBe('ENDED');

    await app.close();
  });

  it('a previa calcula os precos pela mesma conta da loja', async () => {
    const { app, store } = await buildApp();

    const response = await request(app.getHttpServer()).get(`${ROUTE}/preview?percentOff=30`).expect(200);

    expect(store.prices).toHaveBeenCalledWith(30);
    expect(response.body).toEqual({ modules: [], bundle: null });

    await request(app.getHttpServer()).get(`${ROUTE}/preview?percentOff=95`).expect(400);

    await app.close();
  });

  it('recusa aluno com 403 e quem nao tem sessao com 401', async () => {
    for (const [role, status] of [['aluno', 403], [null, 401]] as const) {
      const { app, promotions } = await buildApp(role);

      await request(app.getHttpServer()).post(ROUTE).send(BODY).expect(status);
      await request(app.getHttpServer()).get(ROUTE).expect(status);

      expect(promotions.create).not.toHaveBeenCalled();

      await app.close();
    }
  });
});
