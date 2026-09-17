import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { MercadoPagoService } from './mercado-pago.service';
import { OrdersService } from './orders.service';

const ALUNO: AuthUser = {
  uid: 'uid-aluno',
  email: 'aluno@delcastanher.com',
  name: 'Ana Souza',
  role: 'aluno',
};

const PAYER = {
  firstName: 'Ana',
  lastName: 'Souza',
  email: 'aluno@delcastanher.com',
  document: '19119119100',
};

const MODULES = [
  { id: 'mod-1', order: 1, title: 'Fundamentos', priceCents: 19900 },
  { id: 'mod-2', order: 2, title: 'Pratica', priceCents: 19900 },
];

/** Order de PIX pendente, como a Orders API a devolve. */
const PIX_ORDER = {
  id: 'ORD-1',
  status: 'action_required',
  statusDetail: 'waiting_transfer',
  paymentId: 'PAY-1',
  pix: { qrCode: 'copia-e-cola', qrCodeBase64: 'imagem', ticketUrl: null },
};

/** Order de cartao aprovada. */
const APPROVED_ORDER = {
  id: 'ORD-2',
  status: 'processed',
  statusDetail: 'accredited',
  paymentId: 'PAY-2',
  pix: null,
};

/** Order de cartao recusada pelo emissor. */
const REJECTED_ORDER = {
  id: 'ORD-3',
  status: 'failed',
  statusDetail: 'rejected_by_issuer',
  paymentId: 'PAY-3',
  pix: null,
};

interface BuildOptions {
  modules?: typeof MODULES;
  activeMap?: Map<string, Date>;
  gatewayOrder?: unknown;
  storedOrder?: unknown;
  transitionCount?: number;
}

function build(options: BuildOptions = {}) {
  const created = {
    id: 'ord-1',
    userId: ALUNO.uid,
    status: 'PENDING',
    amountCents: 39800,
    method: 'PIX',
    installments: 1,
    mpOrderId: null,
    mpPaymentId: null,
    mpStatus: null,
    mpStatusDetail: null,
    paidAt: null,
    expiresAt: null,
    createdAt: new Date(),
    items: [
      { moduleId: 'mod-1', priceCents: 19900, titleSnapshot: 'Fundamentos' },
      { moduleId: 'mod-2', priceCents: 19900, titleSnapshot: 'Pratica' },
    ],
  };

  const prisma = {
    module: { findMany: jest.fn().mockResolvedValue(options.modules ?? MODULES) },
    order: {
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(created),
      updateMany: jest.fn().mockResolvedValue({ count: options.transitionCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue(options.storedOrder ?? created),
      findFirst: jest.fn().mockResolvedValue(options.storedOrder ?? null),
      findMany: jest.fn().mockResolvedValue([created]),
    },
    // O `$transaction` real devolve o resultado do callback; aqui ele so
    // executa, porque o que a suite verifica e o efeito, nao o isolamento.
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  const access = {
    activeMap: jest.fn().mockResolvedValue(options.activeMap ?? new Map()),
    grant: jest.fn().mockResolvedValue({}),
    revokeByOrder: jest.fn().mockResolvedValue(0),
  };

  const gateway = {
    createOrder: jest.fn().mockResolvedValue(options.gatewayOrder ?? PIX_ORDER),
    getOrder: jest.fn().mockResolvedValue(options.gatewayOrder ?? PIX_ORDER),
  };

  return Test.createTestingModule({
    providers: [
      OrdersService,
      { provide: PrismaService, useValue: prisma },
      { provide: AccessService, useValue: access },
      { provide: MercadoPagoService, useValue: gateway },
    ],
  })
    .compile()
    .then((moduleRef) => ({
      service: moduleRef.get(OrdersService),
      prisma,
      access,
      gateway,
    }));
}

function pixOrder(moduleIds = ['mod-1', 'mod-2']) {
  return { moduleIds, method: 'PIX' as const, payer: PAYER };
}

describe('OrdersService', () => {
  describe('create — o valor e do servidor', () => {
    // Decisao 2: aceitar preco do navegador seria deixar o comprador escolher
    // quanto pagar. O front nao pode ser a autoridade de um numero que ele
    // recebeu da propria API.
    it('soma o valor a partir do banco, e nao de nada que o cliente mande', async () => {
      const { service, prisma } = await build();

      await service.create(ALUNO, pixOrder());

      expect(prisma.order.create.mock.calls[0][0].data.amountCents).toBe(39800);
    });

    it('grava o snapshot de preco e titulo de cada item', async () => {
      const { service, prisma } = await build();

      await service.create(ALUNO, pixOrder());

      expect(prisma.order.create.mock.calls[0][0].data.items.create).toEqual([
        { moduleId: 'mod-1', priceCents: 19900, titleSnapshot: 'Fundamentos' },
        { moduleId: 'mod-2', priceCents: 19900, titleSnapshot: 'Pratica' },
      ]);
    });
  });

  describe('create — o que o pedido recusa', () => {
    it('recusa lista vazia de modulos', async () => {
      const { service } = await build();

      await expect(service.create(ALUNO, pixOrder([]))).rejects.toMatchObject({ status: 400 });
    });

    it('recusa modulo inexistente', async () => {
      const { service } = await build({ modules: [MODULES[0]] });

      await expect(service.create(ALUNO, pixOrder(['mod-1', 'mod-fantasma']))).rejects.toMatchObject(
        { status: 400 },
      );
    });

    // Decisao 1: modulo sem preco e "a definir", e nao "de graca".
    it('recusa modulo sem preco definido, com mensagem propria', async () => {
      const { service } = await build({
        modules: [{ id: 'mod-1', order: 1, title: 'Fundamentos', priceCents: null } as never],
      });

      await expect(service.create(ALUNO, pixOrder(['mod-1']))).rejects.toMatchObject({
        status: 400,
      });
    });

    // Comprar o que ja se tem e quase sempre engano do comprador — e cobrar por
    // isso e pior do que recusar.
    it('recusa modulo que o aluno ja tem com acesso ativo', async () => {
      const { service } = await build({
        activeMap: new Map([['mod-1', new Date('2027-03-17')]]),
      });

      await expect(service.create(ALUNO, pixOrder(['mod-1']))).rejects.toMatchObject({
        status: 409,
      });
    });

    // Decisao 9: teto de UI que o servidor nao valida nao e teto.
    it('recusa parcelamento acima de 6', async () => {
      const { service } = await build();

      await expect(
        service.create(ALUNO, {
          moduleIds: ['mod-1'],
          method: 'CREDIT_CARD',
          payer: PAYER,
          installments: 12,
          card: { token: 'tok', paymentMethodId: 'master', installments: 12 },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('recusa parcelamento em PIX, que nao parcela', async () => {
      const { service } = await build();

      await expect(
        service.create(ALUNO, { ...pixOrder(['mod-1']), installments: 3 }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('recusa cartao sem token: sem ele nao ha o que cobrar', async () => {
      const { service } = await build();

      await expect(
        service.create(ALUNO, { moduleIds: ['mod-1'], method: 'CREDIT_CARD', payer: PAYER }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // Decisao 11: dois PIX abertos para os mesmos modulos sao duas cobrancas
  // possiveis da mesma coisa.
  describe('create — um pedido pendente por vez', () => {
    it('cancela o pendente anterior do mesmo aluno', async () => {
      const { service, prisma } = await build();

      await service.create(ALUNO, pixOrder());

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { userId: ALUNO.uid, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });
  });

  describe('create — desfecho', () => {
    it('deixa o PIX pendente, com o QR e a validade na resposta', async () => {
      const { service, access } = await build();

      const view = await service.create(ALUNO, pixOrder());

      expect(view.status).toBe('PENDING');
      expect(view.pix?.qrCode).toBe('copia-e-cola');
      expect(view.expiresAt).toBeTruthy();
      expect(access.grant).not.toHaveBeenCalled();
    });

    it('aprova o cartao, grava paidAt e concede acesso a cada modulo', async () => {
      const { service, access, prisma } = await build({ gatewayOrder: APPROVED_ORDER });

      const view = await service.create(ALUNO, {
        moduleIds: ['mod-1', 'mod-2'],
        method: 'CREDIT_CARD',
        payer: PAYER,
        installments: 3,
        card: { token: 'tok', paymentMethodId: 'master', installments: 3 },
      });

      expect(view.status).toBe('PAID');
      expect(access.grant).toHaveBeenCalledTimes(2);
      expect(access.grant.mock.calls[0][0]).toMatchObject({
        userId: ALUNO.uid,
        moduleId: 'mod-1',
        source: 'PURCHASE',
        orderId: 'ord-1',
      });
      expect(prisma.order.updateMany.mock.calls.at(-1)?.[0].data).toMatchObject({
        status: 'PAID',
        paidAt: expect.any(Date),
      });
    });

    it('recusa o cartao sem conceder acesso nenhum, e guarda o motivo', async () => {
      const { service, access, prisma } = await build({ gatewayOrder: REJECTED_ORDER });

      const view = await service.create(ALUNO, {
        moduleIds: ['mod-1'],
        method: 'CREDIT_CARD',
        payer: PAYER,
        installments: 1,
        card: { token: 'tok', paymentMethodId: 'master', installments: 1 },
      });

      expect(view.status).toBe('REJECTED');
      expect(access.grant).not.toHaveBeenCalled();
      expect(prisma.order.updateMany.mock.calls.at(-1)?.[0].data).toMatchObject({
        mpStatusDetail: 'rejected_by_issuer',
      });
      // A tela precisa dizer o que fazer a seguir, e nao "pagamento recusado".
      expect(view.message).toContain('banco emissor');
    });

    // Decisao 13: o Mercado Pago reentrega notificacao, e webhook e reconsulta
    // podem chegar juntos. A transicao e condicionada ao estado anterior.
    it('nao concede acesso de novo quando o pedido ja saiu de pendente', async () => {
      const { service, access } = await build({
        gatewayOrder: APPROVED_ORDER,
        transitionCount: 0,
      });

      await service.create(ALUNO, {
        moduleIds: ['mod-1'],
        method: 'CREDIT_CARD',
        payer: PAYER,
        installments: 1,
        card: { token: 'tok', paymentMethodId: 'master', installments: 1 },
      });

      expect(access.grant).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('recusa com 404 o pedido de outro aluno, sem confirmar que ele existe', async () => {
      const { service } = await build({
        storedOrder: { id: 'ord-1', userId: 'uid-de-outra-pessoa', status: 'PAID', items: [] },
      });

      await expect(service.findOne(ALUNO, 'ord-1')).rejects.toMatchObject({ status: 404 });
    });

    // Decisao 14: em localhost nenhum webhook chega, e em producao um webhook
    // perdido deixaria o aluno olhando um QR pago sem resposta.
    it('reconsulta o gateway quando o pedido ainda esta pendente', async () => {
      const { service, gateway } = await build({
        storedOrder: {
          id: 'ord-1',
          userId: ALUNO.uid,
          status: 'PENDING',
          mpOrderId: 'ORD-1',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          items: [{ moduleId: 'mod-1', priceCents: 19900, titleSnapshot: 'Fundamentos' }],
        },
        gatewayOrder: APPROVED_ORDER,
      });

      const view = await service.findOne(ALUNO, 'ord-1');

      expect(gateway.getOrder).toHaveBeenCalledWith('ORD-1');
      expect(view.status).toBe('PAID');
    });

    it('nao reconsulta pedido ja em estado terminal', async () => {
      const { service, gateway } = await build({
        storedOrder: { id: 'ord-1', userId: ALUNO.uid, status: 'PAID', mpOrderId: 'ORD-1', items: [] },
      });

      await service.findOne(ALUNO, 'ord-1');

      expect(gateway.getOrder).not.toHaveBeenCalled();
    });

    // Decisao 10: vencido e vencido. Perguntar ao gateway seria gastar uma
    // chamada para confirmar o que o relogio ja respondeu.
    it('expira o pedido vencido sem consultar o gateway', async () => {
      const { service, gateway, prisma } = await build({
        storedOrder: {
          id: 'ord-1',
          userId: ALUNO.uid,
          status: 'PENDING',
          mpOrderId: 'ORD-1',
          expiresAt: new Date(Date.now() - 1000),
          items: [],
        },
      });

      const view = await service.findOne(ALUNO, 'ord-1');

      expect(gateway.getOrder).not.toHaveBeenCalled();
      expect(view.status).toBe('EXPIRED');
      expect(prisma.order.updateMany).toHaveBeenCalled();
    });
  });

  /** Decisao 22: dinheiro devolvido nao pode deixar o conteudo liberado. */
  describe('estorno e contestacao', () => {
    it('revoga o acesso concedido pelo pedido estornado', async () => {
      const { service, access } = await build({
        storedOrder: {
          id: 'ord-1',
          userId: ALUNO.uid,
          status: 'PAID',
          mpOrderId: 'ORD-1',
          items: [],
        },
        gatewayOrder: { ...APPROVED_ORDER, status: 'refunded', statusDetail: 'refunded' },
      });

      await service.applyFromGateway('ORD-1');

      expect(access.revokeByOrder).toHaveBeenCalledWith('ord-1');
    });

    it('ignora notificacao de order que nao e desta plataforma', async () => {
      const { service, access, gateway } = await build({ storedOrder: null });

      await expect(service.applyFromGateway('ORD-de-outra-loja')).resolves.toBeUndefined();

      expect(gateway.getOrder).not.toHaveBeenCalled();
      expect(access.grant).not.toHaveBeenCalled();
    });
  });
});
