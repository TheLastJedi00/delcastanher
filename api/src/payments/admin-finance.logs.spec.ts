import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFinanceService } from './admin-finance.service';
import { GatewayFeesService } from './gateway-fees.service';
import { PaymentLogService } from './payment-log.service';

const LOG = {
  id: 'log-1',
  orderId: 'ord-1',
  attemptId: 'att-1',
  userId: 'uid-1',
  source: 'API',
  stage: 'create_order',
  level: 'ERROR',
  httpStatus: 500,
  mpOrderId: null,
  mpStatus: null,
  mpStatusDetail: null,
  message: 'Mercado Pago respondeu 500 em create_order.',
  detail: { errors: [{ code: 'internal_error' }] },
  environment: 'production',
  createdAt: new Date('2026-10-21T22:00:00Z'),
};

async function build(order: unknown) {
  const prisma = { order: { findUnique: jest.fn().mockResolvedValue(order) } };
  const paymentLog = { forOrder: jest.fn().mockResolvedValue([LOG]) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminFinanceService,
      { provide: PrismaService, useValue: prisma },
      { provide: GatewayFeesService, useValue: {} },
      { provide: PaymentLogService, useValue: paymentLog },
    ],
  }).compile();

  return { service: moduleRef.get(AdminFinanceService), prisma, paymentLog };
}

/** Spec 028, decisao 8: a linha do tempo do modal "Logs do pagamento". */
describe('AdminFinanceService.orderLogs', () => {
  it('le os logs pelo pedido e pela tentativa dele', async () => {
    const { service, paymentLog } = await build({ id: 'ord-1', attemptId: 'att-1' });

    const lines = await service.orderLogs('ord-1');

    expect(paymentLog.forOrder).toHaveBeenCalledWith({ id: 'ord-1', attemptId: 'att-1' });
    expect(lines).toEqual([
      {
        id: 'log-1',
        createdAt: '2026-10-21T22:00:00.000Z',
        source: 'API',
        stage: 'create_order',
        level: 'ERROR',
        httpStatus: 500,
        mpOrderId: null,
        mpStatus: null,
        mpStatusDetail: null,
        message: 'Mercado Pago respondeu 500 em create_order.',
        detail: { errors: [{ code: 'internal_error' }] },
        environment: 'production',
      },
    ]);
  });

  it('responde 404 para pedido que nao existe', async () => {
    const { service } = await build(null);

    await expect(service.orderLogs('ord-x')).rejects.toMatchObject({ status: 404 });
  });
});
