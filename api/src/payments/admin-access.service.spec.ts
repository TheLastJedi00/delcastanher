import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { AdminAccessService } from './admin-access.service';

const ALUNO_ID = 'uid-aluno';
const EXPIRES = new Date('2027-03-17T12:00:00.000Z');

const MODULES = [
  { id: 'mod-1', order: 1, title: 'Fundamentos' },
  { id: 'mod-2', order: 2, title: 'Pratica' },
];

function build(accesses: unknown[] = [], orders: unknown[] = []) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: ALUNO_ID }) },
    module: { findUnique: jest.fn().mockResolvedValue(MODULES[0]), findMany: jest.fn().mockResolvedValue(MODULES) },
    moduleAccess: { findMany: jest.fn().mockResolvedValue(accesses) },
    order: { findMany: jest.fn().mockResolvedValue(orders) },
  };

  const access = {
    grant: jest.fn().mockResolvedValue({}),
    revoke: jest.fn().mockResolvedValue(undefined),
  };

  return Test.createTestingModule({
    providers: [
      AdminAccessService,
      { provide: PrismaService, useValue: prisma },
      { provide: AccessService, useValue: access },
    ],
  })
    .compile()
    .then((moduleRef) => ({
      service: moduleRef.get(AdminAccessService),
      prisma,
      access,
    }));
}

/**
 * Cortesia administrativa (Spec 014, decisao 20).
 *
 * E a unica escrita do detalhe do aluno, e nao contradiz a decisao 11 da Spec
 * 013: conceder acesso e ato administrativo sobre a relacao comercial, e nao
 * edicao de dado pessoal de terceiro.
 */
describe('AdminAccessService', () => {
  describe('grant', () => {
    it('concede o acesso com origem de cortesia, e nao de compra', async () => {
      const { service, access } = await build();

      await service.grant(ALUNO_ID, 'mod-1');

      expect(access.grant).toHaveBeenCalledWith({
        userId: ALUNO_ID,
        moduleId: 'mod-1',
        source: 'COURTESY',
      });
    });

    it('recusa aluno inexistente', async () => {
      const { service, prisma } = await build();

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.grant('uid-fantasma', 'mod-1')).rejects.toMatchObject({ status: 404 });
    });

    it('recusa modulo inexistente', async () => {
      const { service, prisma } = await build();

      prisma.module.findUnique.mockResolvedValue(null);

      await expect(service.grant(ALUNO_ID, 'mod-fantasma')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('revoke', () => {
    // Decisao 20 e Spec 013, decisao 9: revogar acesso nao e apagar aluno.
    it('remove o acesso sem tocar em progresso nem em certificado', async () => {
      const { service, access, prisma } = await build();

      await service.revoke(ALUNO_ID, 'mod-1');

      expect(access.revoke).toHaveBeenCalledWith(ALUNO_ID, 'mod-1');
      expect(prisma).not.toHaveProperty('lessonProgress');
      expect(prisma).not.toHaveProperty('certificate');
    });
  });

  describe('listFor', () => {
    it('lista os acessos com modulo, origem e validade', async () => {
      const { service } = await build([
        {
          moduleId: 'mod-1',
          expiresAt: EXPIRES,
          grantedAt: new Date('2026-09-17T12:00:00.000Z'),
          source: 'COURTESY',
          orderId: null,
          module: MODULES[0],
        },
      ]);

      const list = await service.listFor(ALUNO_ID);

      expect(list).toEqual([
        {
          moduleId: 'mod-1',
          moduleOrder: 1,
          moduleTitle: 'Fundamentos',
          source: 'COURTESY',
          grantedAt: '2026-09-17T12:00:00.000Z',
          expiresAt: EXPIRES.toISOString(),
          active: true,
          orderId: null,
        },
      ]);
    });

    // Acesso vencido continua na lista: e informacao de suporte — "esta pessoa
    // teve acesso e ele expirou" e diferente de "nunca teve".
    it('mantem o acesso vencido na lista, marcado como inativo', async () => {
      const { service } = await build([
        {
          moduleId: 'mod-1',
          expiresAt: new Date('2020-01-01T00:00:00.000Z'),
          grantedAt: new Date('2019-07-01T00:00:00.000Z'),
          source: 'PURCHASE',
          orderId: 'ord-1',
          module: MODULES[0],
        },
      ]);

      const list = await service.listFor(ALUNO_ID);

      expect(list[0].active).toBe(false);
    });
  });

  /**
   * Decisao 23: o painel ganha apenas o que o suporte precisa para responder um
   * aluno. Relatorio de vendas e conciliacao sao spec propria.
   */
  describe('ordersFor', () => {
    it('lista os pedidos com status, valor, meio e os ids do Mercado Pago', async () => {
      const { service } = await build([], [
        {
          id: 'ord-1',
          status: 'PAID',
          amountCents: 39800,
          method: 'PIX',
          installments: 1,
          mpOrderId: 'ORD-1',
          mpPaymentId: 'PAY-1',
          createdAt: new Date('2026-09-17T12:00:00.000Z'),
          paidAt: new Date('2026-09-17T12:01:00.000Z'),
          items: [{ moduleId: 'mod-1', titleSnapshot: 'Fundamentos', priceCents: 19900 }],
        },
      ]);

      const orders = await service.ordersFor(ALUNO_ID);

      expect(orders[0]).toMatchObject({
        id: 'ord-1',
        status: 'PAID',
        amountCents: 39800,
        method: 'PIX',
        mpOrderId: 'ORD-1',
        mpPaymentId: 'PAY-1',
      });
      expect(orders[0].items).toHaveLength(1);
    });
  });
});
