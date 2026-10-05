import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailError, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseEmailService } from './purchase-email.service';

const PAID_AT = new Date('2026-10-05T15:00:00.000Z');

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    status: 'PAID',
    amountCents: 19900,
    method: 'PIX',
    installments: 1,
    paidAt: PAID_AT,
    payerName: 'Ana Souza',
    bundleTitleSnapshot: null,
    tierNameSnapshot: null,
    confirmationEmailedAt: null,
    user: { email: 'ana@exemplo.com', name: 'Ana', marketingOptOutAt: null },
    items: [{ titleSnapshot: 'Módulo 1: Fundamentos do RH' }],
    accesses: [
      { expiresAt: new Date('2027-04-05T15:00:00.000Z') },
      { expiresAt: new Date('2027-05-05T15:00:00.000Z') },
    ],
    ...overrides,
  };
}

interface Options {
  order?: ReturnType<typeof orderRow> | null;
  claimed?: boolean;
  send?: jest.Mock;
}

async function build(options: Options = {}) {
  const order = options.order === undefined ? orderRow() : options.order;
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: options.claimed === false ? 0 : 1 }),
      update: jest.fn(async ({ data }: { data: { confirmationEmailedAt: Date } }) => ({
        ...order,
        ...data,
      })),
    },
  };
  const mail = { send: options.send ?? jest.fn().mockResolvedValue({ id: 're_1' }) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      PurchaseEmailService,
      { provide: PrismaService, useValue: prisma },
      { provide: MailService, useValue: mail },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => (key === 'FRONTEND_URL' ? 'https://www.delcastanher.srv.br' : undefined) },
      },
    ],
  }).compile();

  return { service: moduleRef.get(PurchaseEmailService), prisma, mail };
}

describe('PurchaseEmailService (Spec 024, decisao D6)', () => {
  describe('onOrderPaid', () => {
    it('reivindica a linha so de pedido pago e ainda sem e-mail, e envia', async () => {
      const { service, prisma, mail } = await build();

      await service.onOrderPaid('order-1');

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: 'PAID', confirmationEmailedAt: null },
        data: { confirmationEmailedAt: expect.any(Date) },
      });
      expect(mail.send).toHaveBeenCalledTimes(1);

      const message = mail.send.mock.calls[0][0];
      expect(message.to).toBe('ana@exemplo.com');
      expect(message.subject).toContain('Compra confirmada');
      expect(message.text).toContain('https://www.delcastanher.srv.br/ava');
      // Idempotencia no Resend tambem: a mesma chave para o mesmo pedido.
      expect(message.idempotencyKey).toBe('purchase-order-1');
    });

    it('webhook e polling juntos: quem nao reivindicou nao envia', async () => {
      const { service, mail } = await build({ claimed: false });

      await service.onOrderPaid('order-1');

      expect(mail.send).not.toHaveBeenCalled();
    });

    it('transacional: sem cabecalho de descadastro, e chega a quem se descadastrou', async () => {
      const { service, mail } = await build({
        order: orderRow({
          user: { email: 'ana@exemplo.com', name: 'Ana', marketingOptOutAt: new Date() },
        }),
      });

      await service.onOrderPaid('order-1');

      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0].headers).toBeUndefined();
    });

    it('a validade e a do primeiro acesso a vencer entre os do pedido', async () => {
      const { service, mail } = await build();

      await service.onOrderPaid('order-1');

      expect(mail.send.mock.calls[0][0].text).toContain('Seu acesso vale até 05/04/2027.');
    });

    it('falha do Resend: desfaz a reivindicacao e nao lanca', async () => {
      const send = jest.fn().mockRejectedValue(new MailError('Resend respondeu 500', 500));
      const { service, prisma } = await build({ send });

      await expect(service.onOrderPaid('order-1')).resolves.toBeUndefined();

      expect(prisma.order.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'order-1', confirmationEmailedAt: expect.any(Date) },
        data: { confirmationEmailedAt: null },
      });
    });

    it('chave do Resend ausente tambem nao lanca: o pagamento nunca depende do e-mail', async () => {
      const send = jest.fn().mockRejectedValue(new Error('RESEND_API_KEY nao configurada.'));
      const { service } = await build({ send });

      await expect(service.onOrderPaid('order-1')).resolves.toBeUndefined();
    });
  });

  describe('resend (painel)', () => {
    it('reenvia com chave nova e grava a data', async () => {
      const { service, prisma, mail } = await build({
        order: orderRow({ confirmationEmailedAt: new Date('2026-10-05T15:01:00.000Z') }),
      });

      const result = await service.resend('order-1');

      expect(mail.send).toHaveBeenCalledTimes(1);
      // Chave nova: a do envio automatico faria o Resend devolver o envio antigo.
      expect(mail.send.mock.calls[0][0].idempotencyKey).toMatch(/^purchase-order-1-resend-\d+$/);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { confirmationEmailedAt: expect.any(Date) },
        select: { confirmationEmailedAt: true },
      });
      expect(result.confirmationEmailedAt).toBeInstanceOf(Date);
    });

    it('pedido inexistente da 404', async () => {
      const { service } = await build({ order: null });

      await expect(service.resend('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('pedido nao pago da 409: nao se confirma compra que nao aconteceu', async () => {
      const { service, mail } = await build({ order: orderRow({ status: 'REFUNDED' }) });

      await expect(service.resend('order-1')).rejects.toBeInstanceOf(ConflictException);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('recusa do Resend chega ao painel como 502, com a mensagem', async () => {
      const send = jest.fn().mockRejectedValue(new Error('RESEND_API_KEY nao configurada.'));
      const { service, prisma } = await build({ send });

      await expect(service.resend('order-1')).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
