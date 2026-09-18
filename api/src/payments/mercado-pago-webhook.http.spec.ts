import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MercadoPagoService } from './mercado-pago.service';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';
import { OrdersService } from './orders.service';

/** Notificacao do topico `order`, como o Mercado Pago a envia. */
const NOTIFICATION = {
  id: 12345,
  live_mode: false,
  type: 'order',
  action: 'order.updated',
  date_created: '2026-09-17T10:04:58.396-04:00',
  data: { id: 'ORD-1' },
};

async function buildApp(verified: boolean) {
  const gateway = { verifyWebhookSignature: jest.fn().mockReturnValue(verified) };
  const orders = { applyFromGateway: jest.fn().mockResolvedValue(undefined) };

  const moduleRef = await Test.createTestingModule({
    controllers: [MercadoPagoWebhookController],
    providers: [
      { provide: MercadoPagoService, useValue: gateway },
      { provide: OrdersService, useValue: orders },
    ],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();

  await app.init();

  return { app, gateway, orders };
}

/**
 * Webhook do Mercado Pago (Spec 014, decisao 12).
 *
 * Rota **publica** por necessidade — o Mercado Pago nao tem sessao nesta
 * plataforma —, exatamente como `POST /webhooks/mux` (Spec 010, decisao 5). O
 * que separa uma notificacao legitima de um POST qualquer da internet e a
 * assinatura do header `x-signature`.
 */
describe('POST /webhooks/mercadopago', () => {
  it('aplica o desfecho quando a assinatura confere', async () => {
    const { app, orders } = await buildApp(true);

    await request(app.getHttpServer())
      .post('/webhooks/mercadopago?data.id=ORD-1')
      .set('x-signature', 'ts=1,v1=assinatura')
      .set('x-request-id', 'req-1')
      .send(NOTIFICATION)
      .expect(200);

    expect(orders.applyFromGateway).toHaveBeenCalledWith('ORD-1');

    await app.close();
  });

  it('recusa com 401 e nao toca em pedido nenhum quando a assinatura nao confere', async () => {
    const { app, orders } = await buildApp(false);

    await request(app.getHttpServer())
      .post('/webhooks/mercadopago?data.id=ORD-1')
      .set('x-signature', 'ts=1,v1=forjada')
      .set('x-request-id', 'req-1')
      .send(NOTIFICATION)
      .expect(401);

    expect(orders.applyFromGateway).not.toHaveBeenCalled();

    await app.close();
  });

  // 200 para o que nao interessa: recusar faria o Mercado Pago reentregar para
  // sempre um evento que nunca vai ser tratado.
  it('responde 200 sem efeito para topico que nao e order', async () => {
    const { app, orders } = await buildApp(true);

    await request(app.getHttpServer())
      .post('/webhooks/mercadopago?data.id=123')
      .set('x-signature', 'ts=1,v1=assinatura')
      .set('x-request-id', 'req-1')
      .send({ ...NOTIFICATION, type: 'point_integration_wh' })
      .expect(200);

    expect(orders.applyFromGateway).not.toHaveBeenCalled();

    await app.close();
  });

  it('responde 200 sem efeito quando a notificacao vem sem data.id', async () => {
    const { app, orders } = await buildApp(true);

    await request(app.getHttpServer())
      .post('/webhooks/mercadopago')
      .set('x-signature', 'ts=1,v1=assinatura')
      .set('x-request-id', 'req-1')
      .send({ ...NOTIFICATION, data: {} })
      .expect(200);

    expect(orders.applyFromGateway).not.toHaveBeenCalled();

    await app.close();
  });

  /**
   * Decisao 12: o corpo do POST so diz **qual** id consultar. O estado vem de
   * `GET /v1/orders/:id`, com o nosso access token — acreditar no corpo seria
   * aceitar que um terceiro declarasse um pedido como pago.
   */
  it('nao le status do corpo: passa adiante apenas o id da order', async () => {
    const { app, orders } = await buildApp(true);

    await request(app.getHttpServer())
      .post('/webhooks/mercadopago?data.id=ORD-1')
      .set('x-signature', 'ts=1,v1=assinatura')
      .set('x-request-id', 'req-1')
      .send({ ...NOTIFICATION, status: 'processed', status_detail: 'accredited' })
      .expect(200);

    expect(orders.applyFromGateway).toHaveBeenCalledWith('ORD-1');
    expect(orders.applyFromGateway).toHaveBeenCalledTimes(1);

    await app.close();
  });

  // Decisao 13: reentrega e regra, nao excecao. A idempotencia mora no
  // `OrdersService`, e aqui o que se garante e que a rota nao faz nada alem de
  // encaminhar.
  it('encaminha a notificacao repetida do mesmo jeito, sem tratamento especial', async () => {
    const { app, orders } = await buildApp(true);
    const send = () =>
      request(app.getHttpServer())
        .post('/webhooks/mercadopago?data.id=ORD-1')
        .set('x-signature', 'ts=1,v1=assinatura')
        .set('x-request-id', 'req-1')
        .send(NOTIFICATION)
        .expect(200);

    await send();
    await send();

    expect(orders.applyFromGateway).toHaveBeenCalledTimes(2);
    expect(orders.applyFromGateway).toHaveBeenNthCalledWith(2, 'ORD-1');

    await app.close();
  });
});
