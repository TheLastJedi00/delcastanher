import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentLogService } from './payment-log.service';

async function build(sandbox = 'true') {
  const prisma = {
    paymentLog: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      PaymentLogService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: { get: (key: string) => (key === 'MP_SANDBOX' ? sandbox : undefined) } },
    ],
  }).compile();

  return { service: moduleRef.get(PaymentLogService), prisma };
}

/** Spec 028, decisao 7. */
describe('PaymentLogService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('grava a linha com os campos e o ambiente do MP_SANDBOX', async () => {
    const sandbox = await build('true');
    const production = await build('false');

    const entry = {
      orderId: 'ord-1',
      attemptId: 'att-1',
      userId: 'uid-1',
      source: 'API' as const,
      stage: 'create_order',
      level: 'ERROR' as const,
      httpStatus: 500,
      message: 'Mercado Pago respondeu 500',
    };

    await sandbox.service.record(entry);
    await production.service.record(entry);

    expect(sandbox.prisma.paymentLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ...entry, environment: 'sandbox' }),
    });
    expect(production.prisma.paymentLog.create.mock.calls[0][0].data.environment).toBe('production');
  });

  it('tira token e dados do pagador do detail antes de gravar', async () => {
    const { service, prisma } = await build();

    await service.record({
      source: 'API',
      stage: 'create_order',
      level: 'WARNING',
      message: 'Recusado',
      detail: { payer: { email: 'a@b.com', identification: { number: '19119119100' } }, token: 'tok' },
    });

    const json = JSON.stringify(prisma.paymentLog.create.mock.calls[0][0].data.detail);

    expect(json).not.toContain('a@b.com');
    expect(json).not.toContain('19119119100');
    expect(json).not.toContain('tok');
  });

  it('corta mensagem longa', async () => {
    const { service, prisma } = await build();

    await service.record({ source: 'FRONT', stage: 'tokenize', level: 'ERROR', message: 'x'.repeat(5000) });

    expect(prisma.paymentLog.create.mock.calls[0][0].data.message.length).toBeLessThanOrEqual(1000);
  });

  it('nunca lanca: uma falha do banco vira log de erro', async () => {
    const { service, prisma } = await build();
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    prisma.paymentLog.create.mockRejectedValue(new Error('banco fora'));

    await expect(
      service.record({ source: 'API', stage: 'webhook', level: 'ERROR', message: 'x' }),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
  });

  it('conta os eventos recentes do navegador por usuario', async () => {
    const { service, prisma } = await build();
    const since = new Date('2026-10-21T10:00:00Z');

    await expect(service.countFrontSince('uid-1', since)).resolves.toBe(3);
    expect(prisma.paymentLog.count).toHaveBeenCalledWith({
      where: { userId: 'uid-1', source: 'FRONT', createdAt: { gte: since } },
    });
  });

  it('lista os logs do pedido e os do navegador da mesma tentativa, do mais antigo', async () => {
    const { service, prisma } = await build();

    await service.forOrder({ id: 'ord-1', attemptId: 'att-1' });

    expect(prisma.paymentLog.findMany).toHaveBeenCalledWith({
      where: { OR: [{ orderId: 'ord-1' }, { attemptId: 'att-1' }] },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('sem tentativa, lista so os logs do pedido', async () => {
    const { service, prisma } = await build();

    await service.forOrder({ id: 'ord-1', attemptId: null });

    expect(prisma.paymentLog.findMany).toHaveBeenCalledWith({
      where: { OR: [{ orderId: 'ord-1' }] },
      orderBy: { createdAt: 'asc' },
    });
  });
});
