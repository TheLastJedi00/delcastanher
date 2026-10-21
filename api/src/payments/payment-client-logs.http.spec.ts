import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { PaymentClientLogsController } from './payment-client-logs.controller';
import { PaymentLogService } from './payment-log.service';

const ATTEMPT = '7d5e3f0a-1b2c-4d5e-8f90-123456789abc';

async function buildApp(signedIn = true, recent = 0) {
  const paymentLog = {
    record: jest.fn().mockResolvedValue(undefined),
    countFrontSince: jest.fn().mockResolvedValue(recent),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [PaymentClientLogsController],
    providers: [{ provide: PaymentLogService, useValue: paymentLog }],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (!signedIn) {
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

  const app: INestApplication = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  await app.init();

  return { app, paymentLog };
}

const ROUTE = '/payments/client-logs';
const BODY = {
  attemptId: ATTEMPT,
  stage: 'sdk_load',
  level: 'ERROR',
  message: 'Falha ao carregar o SDK de pagamento.',
  detail: { userAgent: 'Chrome' },
};

/** Spec 028, decisao 9: os erros do navegador sobem para os logs. */
describe('POST /payments/client-logs', () => {
  it('grava com a origem do navegador e o aluno do token', async () => {
    const { app, paymentLog } = await buildApp();

    await request(app.getHttpServer()).post(ROUTE).send(BODY).expect(204);

    expect(paymentLog.record).toHaveBeenCalledWith({
      attemptId: ATTEMPT,
      userId: 'uid-aluno',
      source: 'FRONT',
      stage: 'sdk_load',
      level: 'ERROR',
      message: 'Falha ao carregar o SDK de pagamento.',
      detail: { userAgent: 'Chrome' },
    });

    await app.close();
  });

  it('aceita aviso e evento sem tentativa', async () => {
    const { app, paymentLog } = await buildApp();

    await request(app.getHttpServer())
      .post(ROUTE)
      .send({ stage: 'payment_method', level: 'WARNING', message: 'Bandeira nao reconhecida.' })
      .expect(204);

    expect(paymentLog.record.mock.calls[0][0]).toMatchObject({ level: 'WARNING', attemptId: null });

    await app.close();
  });

  it('recusa quem nao tem sessao com 401', async () => {
    const { app, paymentLog } = await buildApp(false);

    await request(app.getHttpServer()).post(ROUTE).send(BODY).expect(401);
    expect(paymentLog.record).not.toHaveBeenCalled();

    await app.close();
  });

  it.each([
    ['campo fora da lista', { ...BODY, orderId: 'ord-1' }],
    ['etapa desconhecida', { ...BODY, stage: 'qualquer' }],
    ['nivel INFO', { ...BODY, level: 'INFO' }],
    ['mensagem longa demais', { ...BODY, message: 'x'.repeat(301) }],
    ['tentativa que nao e UUID', { ...BODY, attemptId: 'abc' }],
  ])('recusa %s com 400', async (_case, body) => {
    const { app, paymentLog } = await buildApp();

    await request(app.getHttpServer()).post(ROUTE).send(body).expect(400);
    expect(paymentLog.record).not.toHaveBeenCalled();

    await app.close();
  });

  it('recusa com 429 o 21o evento em 10 minutos', async () => {
    const { app, paymentLog } = await buildApp(true, 20);

    await request(app.getHttpServer()).post(ROUTE).send(BODY).expect(429);

    const since = paymentLog.countFrontSince.mock.calls[0][1] as Date;

    expect(paymentLog.countFrontSince.mock.calls[0][0]).toBe('uid-aluno');
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
    expect(paymentLog.record).not.toHaveBeenCalled();

    await app.close();
  });
});
