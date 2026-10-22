import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminTestPaymentController } from './admin-test-payment.controller';
import { PaymentTestService } from './payment-test.service';

const LIGADO = {
  enabled: true,
  priceCents: 100,
  accessKey: 'k'.repeat(43),
  enabledAt: new Date('2026-10-22T12:00:00Z'),
};

async function buildApp(role: Role | null = 'admin') {
  const tests = {
    status: jest.fn().mockResolvedValue({ enabled: false, priceCents: 100, accessKey: null, enabledAt: null }),
    setEnabled: jest.fn().mockResolvedValue(LIGADO),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminTestPaymentController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: PaymentTestService, useValue: tests },
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

  return { app, tests };
}

const ROUTE = '/admin/finance/test-payment';

/** Spec 030, decisao 4: o toggle do modulo de teste no financeiro. */
describe('Admin — modulo de teste de pagamento (HTTP)', () => {
  it('le o estado', async () => {
    const { app } = await buildApp();

    const response = await request(app.getHttpServer()).get(ROUTE).expect(200);

    expect(response.body).toEqual({ enabled: false, priceCents: 100, accessKey: null, enabledAt: null });

    await app.close();
  });

  it('liga com o admin da sessao e devolve a chave', async () => {
    const { app, tests } = await buildApp();

    const response = await request(app.getHttpServer()).put(ROUTE).send({ enabled: true }).expect(200);

    expect(tests.setEnabled).toHaveBeenCalledWith(true, 'uid-admin');
    expect(response.body.accessKey).toBe('k'.repeat(43));

    await app.close();
  });

  it('recusa aluno com 403 e quem nao tem sessao com 401', async () => {
    for (const [role, status] of [['aluno', 403], [null, 401]] as const) {
      const { app, tests } = await buildApp(role);

      await request(app.getHttpServer()).put(ROUTE).send({ enabled: true }).expect(status);
      expect(tests.setEnabled).not.toHaveBeenCalled();

      await app.close();
    }
  });

  it.each([
    ['campo fora da lista', { enabled: true, priceCents: 1 }],
    ['enabled que nao e booleano', { enabled: 'sim' }],
    ['sem enabled', {}],
  ])('recusa %s com 400', async (_case, body) => {
    const { app, tests } = await buildApp();

    await request(app.getHttpServer()).put(ROUTE).send(body).expect(400);
    expect(tests.setEnabled).not.toHaveBeenCalled();

    await app.close();
  });
});
