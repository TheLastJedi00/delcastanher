import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InvoicesService } from '../invoices/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { BundlesService } from './bundles.service';
import { MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoService } from './mercado-pago.service';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';
import { OrdersService } from './orders.service';

/**
 * Spec 023, decisao A4: com o `OrdersService` de verdade por tras, uma Notaas
 * fora do ar nao muda a resposta do webhook do Mercado Pago — o 200 continua
 * saindo, e o gateway nao reentrega a aprovacao por causa da nota.
 */
describe('POST /webhooks/mercadopago — com a nota fiscal falhando', () => {
  it('responde 200 e concede o acesso mesmo com a emissao explodindo', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const stored = {
      id: 'ord-1',
      userId: 'uid-aluno',
      status: 'PENDING',
      amountCents: 19900,
      method: 'PIX',
      installments: 1,
      mpOrderId: 'ORD-1',
      mpConnectionId: null,
      expiresAt: null,
      items: [{ moduleId: 'mod-1', priceCents: 19900, titleSnapshot: 'Fundamentos' }],
    };
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(stored),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const access = { grant: jest.fn().mockResolvedValue({}), revokeByOrder: jest.fn() };
    const invoices = {
      onOrderPaid: jest.fn().mockRejectedValue(new Error('Notaas fora do ar')),
      onOrderRefunded: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MercadoPagoWebhookController],
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        {
          provide: MercadoPagoService,
          useValue: {
            verifyWebhookSignature: () => true,
            getOrder: jest.fn().mockResolvedValue({
              id: 'ORD-1',
              status: 'processed',
              statusDetail: 'accredited',
              paymentId: 'PAY-1',
              pix: null,
            }),
          },
        },
        { provide: BundlesService, useValue: {} },
        { provide: MercadoPagoConnectionService, useValue: { accessTokenFor: async () => 'token' } },
        { provide: InvoicesService, useValue: invoices },
      ],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();

    await app.init();

    await request(app.getHttpServer())
      .post('/webhooks/mercadopago?data.id=ORD-1')
      .set('x-signature', 'ts=1,v1=assinatura')
      .set('x-request-id', 'req-1')
      .send({ type: 'order', data: { id: 'ORD-1' } })
      .expect(200);

    expect(access.grant).toHaveBeenCalled();
    expect(invoices.onOrderPaid).toHaveBeenCalledWith('ord-1');

    await app.close();
    jest.restoreAllMocks();
  });
});
