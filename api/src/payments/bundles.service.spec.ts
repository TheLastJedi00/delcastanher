import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  BundlesService,
  TierRow,
  allocateByWeight,
  occupiesSeat,
  occupiedWhere,
  pickTier,
} from './bundles.service';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const LATER = new Date(NOW.getTime() + 10 * 60 * 1000);
const EARLIER = new Date(NOW.getTime() - 10 * 60 * 1000);
/** Criado ha mais de 30 minutos: a reserva sem prazo ja venceu. */
const STALE = new Date(NOW.getTime() - 31 * 60 * 1000);

/** Os quatro lotes da Spec 019, fora de ordem de proposito. */
const TIERS: TierRow[] = [
  { id: 't3', order: 3, name: '3º Lote', priceCents: 99700, capacity: 50 },
  { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20 },
  { id: 't4', order: 4, name: 'Preço oficial', priceCents: 149700, capacity: null },
  { id: 't2', order: 2, name: '2º Lote', priceCents: 79700, capacity: 30 },
];

describe('Lote vigente (Spec 019, decisao 3)', () => {
  describe('occupiesSeat — o que ocupa uma vaga', () => {
    it('pago e estornado ocupam: o lote que virou nao volta', () => {
      expect(occupiesSeat({ status: 'PAID', expiresAt: null, createdAt: STALE }, NOW)).toBe(true);
      expect(occupiesSeat({ status: 'REFUNDED', expiresAt: null, createdAt: STALE }, NOW)).toBe(true);
    });

    it('pendente no prazo reserva a vaga; vencido nao', () => {
      expect(occupiesSeat({ status: 'PENDING', expiresAt: LATER, createdAt: EARLIER }, NOW)).toBe(true);
      expect(occupiesSeat({ status: 'PENDING', expiresAt: EARLIER, createdAt: STALE }, NOW)).toBe(false);
    });

    it('pendente ainda sem prazo (cartao em processamento) reserva a vaga por 30 minutos', () => {
      expect(occupiesSeat({ status: 'PENDING', expiresAt: null, createdAt: EARLIER }, NOW)).toBe(true);
    });

    // Pedido gravado cuja chamada ao gateway falhou fica pendente e sem prazo:
    // sem este teto, ele seguraria a vaga do lote para sempre.
    it('pendente sem prazo criado ha mais de 30 minutos nao segura a vaga', () => {
      expect(occupiesSeat({ status: 'PENDING', expiresAt: null, createdAt: STALE }, NOW)).toBe(false);
    });

    it('cancelado, expirado e recusado liberam a vaga', () => {
      for (const status of ['CANCELLED', 'EXPIRED', 'REJECTED'] as const) {
        expect(occupiesSeat({ status, expiresAt: LATER, createdAt: EARLIER }, NOW)).toBe(false);
      }
    });
  });

  describe('pickTier', () => {
    it('sem vendas, e o Fundador', () => {
      expect(pickTier(TIERS, new Map())?.id).toBe('t1');
    });

    it('com as 20 vagas do Fundador ocupadas, e o 2º Lote', () => {
      expect(pickTier(TIERS, new Map([['t1', 20]]))?.id).toBe('t2');
    });

    it('com 19 ocupadas, ainda e o Fundador', () => {
      expect(pickTier(TIERS, new Map([['t1', 19]]))?.id).toBe('t1');
    });

    it('pula os lotes esgotados, na ordem', () => {
      expect(pickTier(TIERS, new Map([['t1', 20], ['t2', 30], ['t3', 50]]))?.id).toBe('t4');
    });

    it('o ultimo lote sem capacidade nunca esgota', () => {
      const occupied = new Map([['t1', 20], ['t2', 30], ['t3', 50], ['t4', 100_000]]);

      expect(pickTier(TIERS, occupied)?.id).toBe('t4');
    });

    it('sem lote com vaga, nao ha vigente', () => {
      const closed = TIERS.map((tier) => ({ ...tier, capacity: tier.capacity ?? 10 }));

      expect(pickTier(closed, new Map([['t1', 20], ['t2', 30], ['t3', 50], ['t4', 10]]))).toBeNull();
    });
  });

  describe('occupiedWhere — a mesma regra, como consulta', () => {
    it('filtra os lotes pedidos e os estados que ocupam vaga', () => {
      expect(occupiedWhere(['t1', 't2'], NOW)).toEqual({
        bundleTierId: { in: ['t1', 't2'] },
        OR: [
          { status: { in: ['PAID', 'REFUNDED'] } },
          {
            status: 'PENDING',
            OR: [
              { expiresAt: { gt: NOW } },
              { expiresAt: null, createdAt: { gt: new Date(NOW.getTime() - 30 * 60 * 1000) } },
            ],
          },
        ],
      });
    });
  });

  describe('BundlesService.occupied', () => {
    it('conta as vagas de todos os lotes em uma consulta agregada', async () => {
      const groupBy = jest.fn().mockResolvedValue([
        { bundleTierId: 't1', _count: { _all: 20 } },
        { bundleTierId: 't2', _count: { _all: 3 } },
      ]);
      const moduleRef = await Test.createTestingModule({
        providers: [BundlesService, { provide: PrismaService, useValue: { order: { groupBy } } }],
      }).compile();

      const occupied = await moduleRef.get(BundlesService).occupied(['t1', 't2', 't3'], NOW);

      expect(groupBy).toHaveBeenCalledTimes(1);
      expect(groupBy).toHaveBeenCalledWith({
        by: ['bundleTierId'],
        where: occupiedWhere(['t1', 't2', 't3'], NOW),
        _count: { _all: true },
      });
      expect(occupied.get('t1')).toBe(20);
      expect(occupied.get('t2')).toBe(3);
      expect(occupied.get('t3') ?? 0).toBe(0);
    });
  });
});

/** Os 12 modulos com os precos da tabela comercial (soma 256400). */
const PRICES = [19700, 19700, 29700, 19700, 19700, 19700, 19700, 19700, 19700, 19700, 24700, 24700];

function bundleRow(overrides: { active?: boolean; prices?: (number | null)[] } = {}) {
  const prices = overrides.prices ?? PRICES;

  return {
    id: 'b1',
    slug: 'imersao-rh-lancamento',
    title: 'Pacote de Lançamento — Imersão RH Estratégico',
    active: overrides.active ?? true,
    // Fora de ordem de proposito: a oferta ordena pela ordem da trilha.
    modules: prices
      .map((priceCents, index) => ({
        module: { id: `m${index + 1}`, order: index + 1, title: `Módulo ${index + 1}`, priceCents },
      }))
      .reverse(),
    tiers: TIERS,
  };
}

async function buildOffer(bundle: unknown, groups: { bundleTierId: string; _count: { _all: number } }[] = []) {
  const prisma = {
    bundle: { findFirst: jest.fn().mockResolvedValue(bundle) },
    order: { groupBy: jest.fn().mockResolvedValue(groups) },
  };
  const moduleRef = await Test.createTestingModule({
    providers: [BundlesService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: moduleRef.get(BundlesService), prisma };
}

describe('BundlesService.offer (Spec 019, decisoes 4 e 10)', () => {
  it('procura so pacote ativo', async () => {
    const { service, prisma } = await buildOffer(null);

    expect(await service.offer(NOW)).toBeNull();
    expect(prisma.bundle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('traz o lote vigente com as vagas restantes e o proximo lote', async () => {
    const { service } = await buildOffer(bundleRow(), [{ bundleTierId: 't1', _count: { _all: 13 } }]);

    const offer = await service.offer(NOW);

    expect(offer?.tier).toEqual({
      id: 't1',
      order: 1,
      name: 'Lote Fundador',
      priceCents: 59000,
      capacity: 20,
      remaining: 7,
    });
    expect(offer?.nextTier).toEqual({ name: '2º Lote', priceCents: 79700 });
  });

  it('no ultimo lote, sem vagas contadas e sem proximo', async () => {
    const { service } = await buildOffer(bundleRow(), [
      { bundleTierId: 't1', _count: { _all: 20 } },
      { bundleTierId: 't2', _count: { _all: 30 } },
      { bundleTierId: 't3', _count: { _all: 50 } },
    ]);

    const offer = await service.offer(NOW);

    expect(offer?.tier?.name).toBe('Preço oficial');
    expect(offer?.tier?.remaining).toBeNull();
    expect(offer?.nextTier).toBeNull();
  });

  it('a ancora e a soma dos precos do banco, e os modulos vem na ordem da trilha', async () => {
    const { service } = await buildOffer(bundleRow());

    const offer = await service.offer(NOW);

    expect(offer?.modulesTotalCents).toBe(256400);
    expect(offer?.modules.map((module) => module.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('sem ancora quando algum modulo do pacote esta sem preco: nao se soma "a definir"', async () => {
    const prices = [...PRICES];
    prices[4] = null as unknown as number;
    const { service } = await buildOffer(bundleRow({ prices }));

    expect((await service.offer(NOW))?.modulesTotalCents).toBeNull();
  });

  it('nao expoe dado de aluno nem id interno de modulo', async () => {
    const { service } = await buildOffer(bundleRow());

    const offer = await service.offer(NOW);

    expect(Object.keys(offer?.modules[0] ?? {}).sort()).toEqual(['order', 'priceCents', 'title']);
  });
});

describe('allocateByWeight — rateio do lote pelos itens (Spec 019, decisao 6)', () => {
  const LOTES = [59000, 79700, 99700, 149700];

  it('a soma dos itens e sempre o valor do pedido, nos quatro lotes', () => {
    for (const total of LOTES) {
      const parts = allocateByWeight(total, PRICES);

      expect(parts).toHaveLength(12);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
    }
  });

  it('no Fundador, o modulo de R$ 297 fica com R$ 68,34 e o de R$ 197 com R$ 45,33', () => {
    const parts = allocateByWeight(59000, PRICES);

    expect(parts[2]).toBe(6834);
    expect(parts[0]).toBe(4533);
    expect(parts[2]).toBeGreaterThan(parts[0]);
  });

  it('a sobra de centavos do arredondamento vai para o ultimo item', () => {
    const parts = allocateByWeight(59000, PRICES);
    const floors = PRICES.map((price) => Math.floor((59000 * price) / 256400));
    const remainder = 59000 - floors.reduce((sum, part) => sum + part, 0);

    expect(remainder).toBeGreaterThan(0);
    expect(parts.slice(0, 11)).toEqual(floors.slice(0, 11));
    expect(parts[11]).toBe(floors[11] + remainder);
  });

  it('nenhum item fica zerado ou negativo', () => {
    for (const total of LOTES) {
      expect(allocateByWeight(total, PRICES).every((part) => part > 0)).toBe(true);
    }
  });

  it('sem peso algum (todos sem preco), divide em partes iguais', () => {
    const parts = allocateByWeight(1000, [0, 0, 0]);

    expect(parts).toEqual([333, 333, 334]);
  });
});

/**
 * Transacao do pedido de pacote (Spec 019, decisao 5). O double registra a
 * ordem das chamadas: a trava precisa vir antes da contagem, e a contagem
 * antes da gravacao — em outra ordem, a trava nao protege nada.
 */
function buildPlace(
  options: { bundle?: unknown; groups?: { bundleTierId: string; _count: { _all: number } }[] } = {},
) {
  const calls: string[] = [];
  const bundle = options.bundle === undefined ? bundleRow() : options.bundle;
  const tx = {
    $queryRaw: jest.fn(async () => {
      calls.push('lock');
      return [];
    }),
    bundle: {
      findUnique: jest.fn(async () => {
        calls.push('bundle');
        return bundle;
      }),
    },
    order: {
      updateMany: jest.fn(async () => {
        calls.push('cancel');
        return { count: 1 };
      }),
      groupBy: jest.fn(async () => {
        calls.push('count');
        return options.groups ?? [];
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push('create');
        return { id: 'ord-b', ...data, items: (data.items as { create: unknown[] }).create };
      }),
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)) };

  return Test.createTestingModule({
    providers: [BundlesService, { provide: PrismaService, useValue: prisma }],
  })
    .compile()
    .then((moduleRef) => ({ service: moduleRef.get(BundlesService), tx, prisma, calls }));
}

const PLACE = { slug: 'imersao-rh-lancamento', userId: 'uid-aluno', method: 'PIX' as const, installments: 1 };

describe('BundlesService.placeOrder (Spec 019, decisoes 5 e 6)', () => {
  it('trava o pacote, cancela o pendente, conta as vagas e so entao grava', async () => {
    const { service, calls, prisma } = await buildPlace();

    await service.placeOrder(PLACE, NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['bundle', 'lock', 'cancel', 'count', 'create']);
  });

  it('cancela o pendente anterior do aluno, liberando a vaga que ele segurava', async () => {
    const { service, tx } = await buildPlace();

    await service.placeOrder(PLACE, NOW);

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { userId: 'uid-aluno', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });

  it('grava o lote vigente, os snapshots, o valor do lote e 12 itens rateados', async () => {
    const { service, tx } = await buildPlace();

    const placed = await service.placeOrder(PLACE, NOW);
    const data = tx.order.create.mock.calls[0][0].data as Record<string, unknown>;
    const items = (data.items as { create: { moduleId: string; priceCents: number; titleSnapshot: string }[] })
      .create;

    expect(data).toMatchObject({
      userId: 'uid-aluno',
      amountCents: 59000,
      method: 'PIX',
      installments: 1,
      bundleId: 'b1',
      bundleTierId: 't1',
      bundleTitleSnapshot: 'Pacote de Lançamento — Imersão RH Estratégico',
      tierNameSnapshot: 'Lote Fundador',
    });
    expect(items).toHaveLength(12);
    expect(items.map((item) => item.moduleId)).toEqual(
      Array.from({ length: 12 }, (_, index) => `m${index + 1}`),
    );
    expect(items.reduce((sum, item) => sum + item.priceCents, 0)).toBe(59000);
    expect(placed.order.items).toHaveLength(12);
  });

  it('com o Fundador esgotado, o pedido entra no 2º Lote', async () => {
    const { service, tx } = await buildPlace({ groups: [{ bundleTierId: 't1', _count: { _all: 20 } }] });

    await service.placeOrder(PLACE, NOW);

    expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
      amountCents: 79700,
      bundleTierId: 't2',
      tierNameSnapshot: '2º Lote',
    });
  });

  it('recusa pacote inexistente ou inativo sem gravar nada', async () => {
    for (const bundle of [null, bundleRow({ active: false })]) {
      const { service, tx } = await buildPlace({ bundle });

      await expect(service.placeOrder(PLACE, NOW)).rejects.toMatchObject({ status: 404 });
      expect(tx.order.create).not.toHaveBeenCalled();
    }
  });
});
