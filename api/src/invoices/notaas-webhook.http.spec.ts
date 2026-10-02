import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { InvoicesService } from './invoices.service';
import { NotaasWebhookController } from './notaas-webhook.controller';

const SECRET = 'segredo-do-webhook-notaas';

const EVENT = {
  event: 'nfe.issued',
  deliveryId: 'dlv-1',
  timestamp: '2026-10-02T19:30:00Z',
  data: {
    invoiceId: 'nts-1',
    chaveAcesso: '35261012345678000195550010000000421234567890',
    cStat: 100,
    xMotivo: 'Autorizado o uso da NF-e',
  },
};

function sign(raw: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
}

async function buildApp() {
  const invoices = { syncByProviderId: jest.fn().mockResolvedValue(undefined) };

  const moduleRef = await Test.createTestingModule({
    controllers: [NotaasWebhookController],
    providers: [
      { provide: InvoicesService, useValue: invoices },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => ({ NOTAAS_WEBHOOK_SECRET: SECRET })[key] },
      },
    ],
  }).compile();

  // O mesmo `rawBody: true` do main.ts: a assinatura e do corpo cru.
  const app: INestApplication = moduleRef.createNestApplication({ rawBody: true });

  await app.init();

  return { app, invoices };
}

function post(app: INestApplication, raw: string, signature?: string) {
  const call = request(app.getHttpServer())
    .post('/webhooks/notaas')
    .set('Content-Type', 'application/json')
    .set('X-Notaas-Event', 'nfe.issued')
    .set('X-Notaas-Delivery', 'dlv-1');

  return (signature === undefined ? call : call.set('X-Notaas-Signature', signature)).send(raw);
}

/**
 * Webhook da Notaas (Spec 023, decisao A5). Rota **publica**: a Notaas nao tem
 * sessao aqui. O que separa um aviso legitimo de um POST qualquer e o
 * HMAC-SHA256 do corpo **bruto** com o secret do endpoint.
 */
describe('POST /webhooks/notaas', () => {
  it('com assinatura valida, manda reconsultar a nota do aviso', async () => {
    const { app, invoices } = await buildApp();
    const raw = JSON.stringify(EVENT);

    await post(app, raw, sign(raw)).expect(200).expect({ received: true });

    expect(invoices.syncByProviderId).toHaveBeenCalledWith('nts-1');

    await app.close();
  });

  it('aceita a assinatura com o prefixo sha256=', async () => {
    const { app, invoices } = await buildApp();
    const raw = JSON.stringify(EVENT);

    await post(app, raw, `sha256=${sign(raw)}`).expect(200);

    expect(invoices.syncByProviderId).toHaveBeenCalledWith('nts-1');

    await app.close();
  });

  it('recusa com 401 sem assinatura', async () => {
    const { app, invoices } = await buildApp();

    await post(app, JSON.stringify(EVENT)).expect(401);

    expect(invoices.syncByProviderId).not.toHaveBeenCalled();

    await app.close();
  });

  it('recusa com 401 a assinatura de outro secret', async () => {
    const { app, invoices } = await buildApp();
    const raw = JSON.stringify(EVENT);

    await post(app, raw, sign(raw, 'outro-secret')).expect(401);

    expect(invoices.syncByProviderId).not.toHaveBeenCalled();

    await app.close();
  });

  // O HMAC e do corpo cru: um JSON reserializado com outro espacamento nao
  // confere, e por isso o main.ts sobe com `rawBody: true`.
  it('recusa com 401 o corpo alterado depois de assinado', async () => {
    const { app } = await buildApp();
    const raw = JSON.stringify(EVENT);
    const tampered = JSON.stringify({ ...EVENT, data: { ...EVENT.data, invoiceId: 'nts-2' } });

    await post(app, tampered, sign(raw)).expect(401);

    await app.close();
  });

  it('confere o corpo byte a byte, inclusive o espacamento', async () => {
    const { app, invoices } = await buildApp();
    const raw = JSON.stringify(EVENT, null, 2);

    await post(app, raw, sign(raw)).expect(200);

    expect(invoices.syncByProviderId).toHaveBeenCalledWith('nts-1');

    await app.close();
  });

  // Decisao A5: o corpo so diz qual nota reconsultar; o status vem da consulta.
  it('nao repassa status do corpo: so o invoiceId', async () => {
    const { app, invoices } = await buildApp();
    const raw = JSON.stringify({ ...EVENT, data: { ...EVENT.data, status: 'issued', numero: 1 } });

    await post(app, raw, sign(raw)).expect(200);

    expect(invoices.syncByProviderId).toHaveBeenCalledTimes(1);
    expect(invoices.syncByProviderId.mock.calls[0]).toEqual(['nts-1']);

    await app.close();
  });

  it('aviso sem invoiceId responde 200 sem efeito', async () => {
    const { app, invoices } = await buildApp();
    const raw = JSON.stringify({ event: 'ping' });

    await post(app, raw, sign(raw)).expect(200);

    expect(invoices.syncByProviderId).not.toHaveBeenCalled();

    await app.close();
  });

  // Reconsulta que falha devolve erro: a Notaas reentrega (5 tentativas).
  it('reconsulta que falha responde 5xx, para a Notaas tentar de novo', async () => {
    const { app, invoices } = await buildApp();
    const raw = JSON.stringify(EVENT);

    invoices.syncByProviderId.mockRejectedValue(new Error('Notaas respondeu 503'));

    const response = await post(app, raw, sign(raw));

    expect(response.status).toBeGreaterThanOrEqual(500);

    await app.close();
  });
});
