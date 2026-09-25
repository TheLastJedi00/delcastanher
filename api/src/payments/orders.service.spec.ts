import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { BundlesService } from './bundles.service';
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

/** Pedido de pacote como o `BundlesService.placeOrder` o grava (Spec 019). */
const BUNDLE_ITEMS = Array.from({ length: 12 }, (_, index) => ({
  moduleId: `mod-${index + 1}`,
  priceCents: index === 11 ? 59000 - 11 * 4916 : 4916,
  titleSnapshot: `Módulo ${index + 1}`,
}));

const PLACED = {
  order: {
    id: 'ord-b',
    userId: 'uid-aluno',
    status: 'PENDING',
    amountCents: 59000,
    method: 'PIX',
    installments: 1,
    mpOrderId: null,
    mpPaymentId: null,
    mpStatus: null,
    mpStatusDetail: null,
    paidAt: null,
    refundedAt: null,
    expiresAt: null,
    bundleId: 'b1',
    bundleTierId: 't1',
    bundleTitleSnapshot: 'Pacote de Lançamento — Imersão RH Estratégico',
    tierNameSnapshot: 'Lote Fundador',
    items: BUNDLE_ITEMS,
  },
};

interface BuildOptions {
  modules?: typeof MODULES;
  activeMap?: Map<string, Date>;
  gatewayOrder?: unknown;
  storedOrder?: unknown;
  transitionCount?: number;
  placed?: unknown;
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
    module: {
      // O double respeita o `where: { id: { in } }` de proposito: sem isso,
      // pedir um modulo devolveria dois e a suite testaria outra coisa.
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (options.modules ?? MODULES).filter((module) => where.id.in.includes(module.id)),
      ),
    },
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

  const bundles = {
    placeOrder: jest.fn().mockResolvedValue(options.placed ?? PLACED),
  };

  return Test.createTestingModule({
    providers: [
      OrdersService,
      { provide: PrismaService, useValue: prisma },
      { provide: AccessService, useValue: access },
      { provide: MercadoPagoService, useValue: gateway },
      { provide: BundlesService, useValue: bundles },
    ],
  })
    .compile()
    .then((moduleRef) => ({
      service: moduleRef.get(OrdersService),
      prisma,
      access,
      gateway,
      bundles,
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

    // Decisao 9: teto de UI que o servidor nao valida nao e teto. A Spec 019
    // (decisao 9) subiu o teto para 12.
    it('recusa parcelamento acima de 12', async () => {
      const { service } = await build();

      await expect(
        service.create(ALUNO, {
          moduleIds: ['mod-1'],
          method: 'CREDIT_CARD',
          payer: PAYER,
          installments: 13,
          card: { token: 'tok', paymentMethodId: 'master', installments: 13 },
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

    // Decisao 8: sem data propria, um estorno so poderia ser lancado no mes da
    // venda — reabrindo um mes ja fechado — ou ficar invisivel na serie.
    it('carimba `refundedAt` na transicao para REFUNDED', async () => {
      const { service, prisma } = await build({
        storedOrder: {
          id: 'ord-1',
          userId: ALUNO.uid,
          status: 'PAID',
          mpOrderId: 'ORD-1',
          paidAt: new Date('2026-09-10T12:00:00Z'),
          items: [],
        },
        gatewayOrder: { ...APPROVED_ORDER, status: 'refunded', statusDetail: 'refunded' },
      });

      await service.applyFromGateway('ORD-1');

      const { data } = prisma.order.updateMany.mock.calls[0][0];

      expect(data.refundedAt).toBeInstanceOf(Date);
    });

    // O estorno nao apaga a venda: o mes em que o dinheiro entrou continua
    // sendo o mes em que o dinheiro entrou.
    it('nao reescreve `paidAt` ao estornar', async () => {
      const { service, prisma } = await build({
        storedOrder: {
          id: 'ord-1',
          userId: ALUNO.uid,
          status: 'PAID',
          mpOrderId: 'ORD-1',
          paidAt: new Date('2026-09-10T12:00:00Z'),
          items: [],
        },
        gatewayOrder: { ...APPROVED_ORDER, status: 'refunded', statusDetail: 'refunded' },
      });

      await service.applyFromGateway('ORD-1');

      expect(prisma.order.updateMany.mock.calls[0][0].data).not.toHaveProperty('paidAt');
    });

    // A gravacao e condicionada ao estado anterior, e REFUNDED nao esta entre os
    // estados de partida: reprocessar o webhook nao reescreve a data do estorno.
    it('nao reescreve a data de um pedido ja estornado', async () => {
      const { service, prisma } = await build({
        storedOrder: {
          id: 'ord-1',
          userId: ALUNO.uid,
          status: 'REFUNDED',
          mpOrderId: 'ORD-1',
          items: [],
        },
        gatewayOrder: { ...APPROVED_ORDER, status: 'refunded', statusDetail: 'refunded' },
        transitionCount: 0,
      });

      await service.applyFromGateway('ORD-1');

      expect(prisma.order.updateMany.mock.calls[0][0].where.status.in).not.toContain('REFUNDED');
    });

    it('ignora notificacao de order que nao e desta plataforma', async () => {
      const { service, access, gateway } = await build({ storedOrder: null });

      await expect(service.applyFromGateway('ORD-de-outra-loja')).resolves.toBeUndefined();

      expect(gateway.getOrder).not.toHaveBeenCalled();
      expect(access.grant).not.toHaveBeenCalled();
    });
  });
});

/** Spec 019, decisoes 5, 6 e 7. */
describe('OrdersService — pedido de pacote', () => {
  function bundleOrder(extra: Record<string, unknown> = {}) {
    return { bundleSlug: 'imersao-rh-lancamento', method: 'PIX' as const, payer: PAYER, ...extra };
  }

  it('entrega a escolha do lote ao BundlesService, sem preco nem lote do corpo', async () => {
    const { service, bundles, prisma } = await build();

    await service.create(ALUNO, bundleOrder({ priceCents: 1, bundleTierId: 't4' }) as never);

    expect(bundles.placeOrder).toHaveBeenCalledWith({
      slug: 'imersao-rh-lancamento',
      userId: ALUNO.uid,
      method: 'PIX',
      installments: 1,
    });
    // O caminho de modulos avulsos nao participa: nem cria pedido nem cancela.
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.module.findMany).not.toHaveBeenCalled();
  });

  it('manda ao Mercado Pago o valor do lote e os 12 itens rateados', async () => {
    const { service, gateway } = await build();

    await service.create(ALUNO, bundleOrder());

    const payload = gateway.createOrder.mock.calls[0][0];

    expect(payload.orderId).toBe('ord-b');
    expect(payload.amountCents).toBe(59000);
    expect(payload.items).toHaveLength(12);
    expect(payload.items.reduce((sum: number, item: { priceCents: number }) => sum + item.priceCents, 0)).toBe(59000);
  });

  it('devolve o pacote e o lote no pedido', async () => {
    const { service } = await build();

    const view = await service.create(ALUNO, bundleOrder());

    expect(view.amountCents).toBe(59000);
    expect(view.bundle).toEqual({
      title: 'Pacote de Lançamento — Imersão RH Estratégico',
      tierName: 'Lote Fundador',
    });
  });

  it('o cartao respeita o teto de parcelas tambem no pacote', async () => {
    const { service, bundles } = await build();

    await expect(
      service.create(
        ALUNO,
        bundleOrder({
          method: 'CREDIT_CARD',
          card: { token: 'tok', paymentMethodId: 'master', installments: 13 },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(bundles.placeOrder).not.toHaveBeenCalled();
  });

  it('pedido de modulos avulsos devolve o pacote nulo', async () => {
    const { service } = await build();

    const view = await service.create(ALUNO, pixOrder());

    expect(view.bundle).toBeNull();
  });
});

/**
 * Spec 019, decisao 7: aprovado, o pacote libera os 12 modulos; estornado,
 * revoga os 12. A extensao de quem ja tinha o modulo ativo e do `grant`, e a
 * suite do `AccessService` ja a cobre ("soma seis meses ao que resta").
 */
describe('OrdersService — aprovacao e estorno do pacote', () => {
  const REFUNDED_ORDER = { ...APPROVED_ORDER, status: 'refunded', statusDetail: 'refunded' };

  it('aprovado, concede acesso de compra nos 12 modulos do pacote', async () => {
    const { service, access } = await build({ storedOrder: PLACED.order, gatewayOrder: APPROVED_ORDER });

    await service.applyFromGateway('ORD-2');

    expect(access.grant).toHaveBeenCalledTimes(12);
    expect(access.grant.mock.calls.map(([input]) => input.moduleId)).toEqual(
      BUNDLE_ITEMS.map((item) => item.moduleId),
    );
    expect(access.grant).toHaveBeenCalledWith({
      userId: 'uid-aluno',
      moduleId: 'mod-1',
      source: 'PURCHASE',
      orderId: 'ord-b',
    });
  });

  it('reprocessar a mesma order aprovada nao concede de novo', async () => {
    const { service, access } = await build({
      storedOrder: PLACED.order,
      gatewayOrder: APPROVED_ORDER,
      transitionCount: 0,
    });

    await service.applyFromGateway('ORD-2');

    expect(access.grant).not.toHaveBeenCalled();
  });

  it('estornado, revoga tudo o que o pedido liberou', async () => {
    const { service, access } = await build({
      storedOrder: { ...PLACED.order, status: 'PAID' },
      gatewayOrder: REFUNDED_ORDER,
    });

    await service.applyFromGateway('ORD-2');

    expect(access.revokeByOrder).toHaveBeenCalledWith('ord-b');
  });
});
