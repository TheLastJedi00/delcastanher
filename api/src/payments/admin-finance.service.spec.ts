import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFinanceService } from './admin-finance.service';
import { bucketKey } from './finance-period';
import { GatewayFeesService } from './gateway-fees.service';

/** Pedido do cenario, no formato em que a tabela `orders` o guarda. */
interface FakeOrder {
  id: string;
  userId: string;
  status: string;
  amountCents: number;
  method: string;
  createdAt: Date;
  paidAt?: Date | null;
  refundedAt?: Date | null;
  items?: { moduleId: string; priceCents: number }[];
}

/** Acesso do cenario, no formato em que `module_access` o guarda. */
interface FakeAccess {
  userId: string;
  moduleId: string;
  source: string;
  grantedAt: Date;
}

interface Scenario {
  orders?: FakeOrder[];
  accesses?: FakeAccess[];
  modules?: { id: string; title: string }[];
  /** Conclusoes, como `userId:moduleId` — "concluiu ao menos uma aula dele". */
  completions?: string[];
  rates?: {
    method: string;
    percentBasisPoints: number;
    fixedCents: number;
    validFrom: Date;
    validTo: Date | null;
  }[];
}

/** Compara um valor com uma clausula do Prisma: igualdade, faixa, `in` ou nulo. */
function matches(value: unknown, condition: unknown): boolean {
  if (condition === null) {
    return value === null || value === undefined;
  }

  if (condition instanceof Date) {
    return value instanceof Date && value.getTime() === condition.getTime();
  }

  if (typeof condition === 'object' && condition !== null) {
    const clause = condition as Record<string, unknown>;

    if (Array.isArray(clause.in)) {
      return clause.in.includes(value);
    }

    const time = value instanceof Date ? value.getTime() : null;

    if (time === null) {
      return false;
    }

    if (clause.gte instanceof Date && time < clause.gte.getTime()) {
      return false;
    }

    if (clause.lt instanceof Date && time >= clause.lt.getTime()) {
      return false;
    }

    return true;
  }

  return value === condition;
}

function orderMatches(order: FakeOrder, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([field, condition]) =>
    matches((order as unknown as Record<string, unknown>)[field] ?? null, condition),
  );
}

/**
 * Um Postgres de mentira, pequeno o bastante para caber aqui e fiel o bastante
 * para que a suite teste a **agregacao**, e nao o double: `aggregate`, `count`
 * e `groupBy` percorrem de verdade o cenario, e o `$queryRaw` da serie usa o
 * mesmo `bucketKey` do fuso de Sao Paulo que a consulta real delega ao
 * `AT TIME ZONE`.
 */
function fakePrisma(scenario: Scenario) {
  const orders = scenario.orders ?? [];
  const accesses = scenario.accesses ?? [];
  const modules = scenario.modules ?? [];
  const completions = new Set(scenario.completions ?? []);
  const rawCalls: { sql: string; values: unknown[] }[] = [];

  const selected = (where?: Record<string, unknown>) =>
    orders.filter((order) => orderMatches(order, where));

  return {
    rawCalls,
    order: {
      aggregate: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = selected(where);

        return {
          _sum: {
            amountCents: rows.length
              ? rows.reduce((total, order) => total + order.amountCents, 0)
              : null,
          },
          _count: { _all: rows.length },
        };
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => selected(where).length),
      groupBy: jest.fn(
        async ({ by, where }: { by: string[]; where: Record<string, unknown> }) => {
          const buckets = new Map<string, { key: Record<string, unknown>; rows: FakeOrder[] }>();

          for (const order of selected(where)) {
            const key: Record<string, unknown> = {};

            for (const field of by) {
              key[field] = (order as unknown as Record<string, unknown>)[field];
            }

            const id = JSON.stringify(key);
            const bucket = buckets.get(id) ?? { key, rows: [] };
            bucket.rows.push(order);
            buckets.set(id, bucket);
          }

          return [...buckets.values()].map((bucket) => ({
            ...bucket.key,
            _sum: {
              amountCents: bucket.rows.reduce((total, order) => total + order.amountCents, 0),
            },
            _count: { _all: bucket.rows.length },
          }));
        },
      ),
    },
    orderItem: {
      groupBy: jest.fn(async ({ where }: { where: { order: Record<string, unknown> } }) => {
        const byModule = new Map<string, { cents: number; count: number }>();

        for (const order of selected(where.order)) {
          for (const item of order.items ?? []) {
            const row = byModule.get(item.moduleId) ?? { cents: 0, count: 0 };
            row.cents += item.priceCents;
            row.count += 1;
            byModule.set(item.moduleId, row);
          }
        }

        return [...byModule.entries()].map(([moduleId, row]) => ({
          moduleId,
          _sum: { priceCents: row.cents },
          _count: { _all: row.count },
        }));
      }),
    },
    moduleAccess: {
      groupBy: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = accesses.filter((access) =>
          Object.entries(where).every(([field, condition]) =>
            matches((access as unknown as Record<string, unknown>)[field] ?? null, condition),
          ),
        );

        const buckets = new Map<string, { moduleId: string; source: string; count: number }>();

        for (const access of rows) {
          const id = `${access.moduleId}:${access.source}`;
          const bucket = buckets.get(id) ?? {
            moduleId: access.moduleId,
            source: access.source,
            count: 0,
          };
          bucket.count += 1;
          buckets.set(id, bucket);
        }

        return [...buckets.values()].map((bucket) => ({
          moduleId: bucket.moduleId,
          source: bucket.source,
          _count: { _all: bucket.count },
        }));
      }),
    },
    module: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        modules.filter((module) => where.id.in.includes(module.id)),
      ),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      rawCalls.push({ sql, values });

      if (sql.includes('module_access')) {
        const [from, to] = values as Date[];
        const buyers = new Set<string>();
        const studied = new Set<string>();

        for (const access of accesses) {
          if (
            access.source !== 'PURCHASE' ||
            access.grantedAt < from ||
            access.grantedAt >= to
          ) {
            continue;
          }

          buyers.add(access.userId);

          if (completions.has(`${access.userId}:${access.moduleId}`)) {
            studied.add(access.userId);
          }
        }

        return [{ buyers: buyers.size, studied: studied.size }];
      }

      // A ordem e a dos `${}` da consulta: unidade, fuso, formato e o par de
      // datas. O fuso entra como parametro, e nao como literal, e por isso
      // conta uma posicao.
      const [, , format, from, to] = values as [string, string, string, Date, Date];
      const field = sql.includes('"refundedAt" AT TIME ZONE') ? 'refundedAt' : 'paidAt';
      const status = field === 'refundedAt' ? 'REFUNDED' : 'PAID';
      const granularity = format === 'YYYY-MM' ? 'month' : 'day';
      const buckets = new Map<string, { cents: number; orders: number }>();

      for (const order of orders) {
        const at = order[field];

        if (order.status !== status || !at || at < from || at >= to) {
          continue;
        }

        const key = bucketKey(at, granularity);
        const bucket = buckets.get(key) ?? { cents: 0, orders: 0 };
        bucket.cents += order.amountCents;
        bucket.orders += 1;
        buckets.set(key, bucket);
      }

      return [...buckets.entries()].map(([bucket, row]) => ({
        bucket,
        cents: row.cents,
        orders: row.orders,
      }));
    }),
  };
}

function build(scenario: Scenario = {}) {
  const prisma = fakePrisma(scenario);
  const fees = {
    ratesUntil: jest.fn().mockResolvedValue(scenario.rates ?? []),
  };

  return Test.createTestingModule({
    providers: [
      AdminFinanceService,
      { provide: PrismaService, useValue: prisma },
      { provide: GatewayFeesService, useValue: fees },
    ],
  })
    .compile()
    .then((moduleRef) => ({ service: moduleRef.get(AdminFinanceService), prisma, fees }));
}

const SETEMBRO = { from: '2026-09-01T03:00:00.000Z', to: '2026-10-01T03:00:00.000Z' };

/** Vigencia do PIX que cobre setembro inteiro: 0,99%, sem parcela fixa. */
const PIX_RATE = {
  method: 'PIX',
  percentBasisPoints: 99,
  fixedCents: 0,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: null,
};

/** Vigencia do cartao que cobre setembro inteiro: 4,99% mais R$ 0,40. */
const CARD_RATE = {
  method: 'CREDIT_CARD',
  percentBasisPoints: 499,
  fixedCents: 40,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: null,
};

function pago(id: string, overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id,
    userId: `user-${id}`,
    status: 'PAID',
    amountCents: 19900,
    method: 'PIX',
    createdAt: new Date('2026-09-10T12:00:00Z'),
    paidAt: new Date('2026-09-10T12:00:00Z'),
    refundedAt: null,
    items: [{ moduleId: 'mod-1', priceCents: 19900 }],
    ...overrides,
  };
}

describe('AdminFinanceService — resumo', () => {
  describe('indicadores do periodo (Task 3.1)', () => {
    it('soma o bruto dos pedidos pagos no periodo, por paidAt', async () => {
      const { service } = await build({
        orders: [pago('a'), pago('b'), pago('c', { paidAt: new Date('2026-08-10T12:00:00Z') })],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.grossCents).toBe(39800);
      expect(summary.totals.paidOrders).toBe(2);
    });

    it('soma os estornos por refundedAt, e nao por paidAt', async () => {
      const { service } = await build({
        orders: [
          pago('a'),
          pago('b', {
            status: 'REFUNDED',
            paidAt: new Date('2026-07-10T12:00:00Z'),
            refundedAt: new Date('2026-09-12T12:00:00Z'),
          }),
        ],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.refundedCents).toBe(19900);
      expect(summary.totals.refundedOrders).toBe(1);
    });

    it('conta pendentes e recusados do periodo', async () => {
      const { service } = await build({
        orders: [
          pago('a', { status: 'PENDING', paidAt: null }),
          pago('b', { status: 'REJECTED', paidAt: null }),
          pago('c', { status: 'REJECTED', paidAt: null }),
        ],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.pendingOrders).toBe(1);
      expect(summary.totals.rejectedOrders).toBe(2);
    });

    it('calcula a taxa, o liquido e o ticket medio', async () => {
      const { service } = await build({
        orders: [pago('a'), pago('b')],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      // 19900 x 0,99% = 197,01 -> 197 por pedido.
      expect(summary.totals.feeCents).toBe(394);
      expect(summary.totals.netCents).toBe(39800 - 394);
      expect(summary.totals.averageTicketCents).toBe(19900);
    });

    /**
     * Decisao 1: receita sai de `Order`, e nunca de `ModuleAccess`. Contar
     * acesso como venda somaria as cortesias do suporte e as contas que ja
     * existiam antes do paywall ao faturamento.
     */
    it('nao soma cortesia nem LEGACY a nenhum numero monetario', async () => {
      const { service } = await build({
        orders: [pago('a')],
        accesses: [
          { userId: 'u-1', moduleId: 'mod-1', source: 'COURTESY', grantedAt: new Date('2026-09-05T12:00:00Z') },
          { userId: 'u-2', moduleId: 'mod-1', source: 'LEGACY', grantedAt: new Date('2026-09-06T12:00:00Z') },
        ],
        modules: [{ id: 'mod-1', title: 'Fundamentos' }],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.grossCents).toBe(19900);
      expect(summary.byModule).toEqual([
        { moduleId: 'mod-1', title: 'Fundamentos', grossCents: 19900, quantity: 1 },
      ]);
      expect(summary.courtesy).toEqual([
        { moduleId: 'mod-1', title: 'Fundamentos', courtesyCount: 1, legacyCount: 1 },
      ]);
      // O contador de cortesia nao carrega valor: ele existe para que o ranking
      // de modulos nao seja lido como demanda quando parte dele foi concessao.
      expect(Object.keys(summary.courtesy[0])).not.toContain('grossCents');
    });
  });

  describe('liquido nao apurado (Task 3.2)', () => {
    it('devolve o liquido como nulo quando um pagamento cai fora de vigencia', async () => {
      const { service } = await build({
        orders: [pago('a')],
        rates: [],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.feeCents).toBeNull();
      expect(summary.totals.netCents).toBeNull();
    });

    it('continua exibindo bruto e estornos, e diz quantos pedidos ficaram descobertos', async () => {
      const { service } = await build({
        orders: [
          pago('a'),
          pago('b', {
            status: 'REFUNDED',
            refundedAt: new Date('2026-09-12T12:00:00Z'),
          }),
        ],
        rates: [],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.grossCents).toBe(19900);
      expect(summary.totals.refundedCents).toBe(19900);
      expect(summary.totals.uncoveredOrders).toBe(1);
      expect(summary.totals.uncoveredFrom).toBe(SETEMBRO.from);
      expect(summary.totals.uncoveredTo).toBe(SETEMBRO.to);
    });

    // A pior forma de errar um numero de dinheiro e um liquido inflado e
    // crivel. Taxa ausente nunca e zero.
    it('nunca devolve um liquido igual ao bruto por falta de taxa', async () => {
      const { service } = await build({ orders: [pago('a')], rates: [] });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.netCents).not.toBe(summary.totals.grossCents);
    });

    it('apura o metodo que tem vigencia e deixa nulo o que nao tem', async () => {
      const { service } = await build({
        orders: [pago('a'), pago('b', { method: 'CREDIT_CARD' })],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      const pix = summary.byMethod.find((row) => row.method === 'PIX');
      const cartao = summary.byMethod.find((row) => row.method === 'CREDIT_CARD');

      expect(pix?.feeCents).toBe(197);
      expect(cartao?.feeCents).toBeNull();
    });

    /**
     * Decisao 4: os meses ja fechados continuam calculados com a taxa que valia
     * neles. Um reajuste no meio do periodo nao reescreve o que veio antes.
     */
    it('aplica a taxa vigente na data de cada pagamento', async () => {
      const { service } = await build({
        orders: [
          pago('a', { paidAt: new Date('2026-09-05T12:00:00Z') }),
          pago('b', { paidAt: new Date('2026-09-20T12:00:00Z') }),
        ],
        rates: [
          { ...PIX_RATE, validTo: new Date('2026-09-15T00:00:00Z') },
          {
            method: 'PIX',
            percentBasisPoints: 199,
            fixedCents: 0,
            validFrom: new Date('2026-09-15T00:00:00Z'),
            validTo: null,
          },
        ],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      // 197 na taxa antiga (0,99%) e 396 na nova (1,99%).
      expect(summary.totals.feeCents).toBe(197 + 396);
    });
  });

  describe('estornos sem data (Task 3.3)', () => {
    const cenario = {
      orders: [
        pago('a'),
        pago('b', {
          status: 'REFUNDED',
          paidAt: new Date('2026-05-10T12:00:00Z'),
          refundedAt: null,
        }),
      ],
      rates: [PIX_RATE],
    };

    it('conta o estorno sem data em um contador proprio', async () => {
      const { service } = await build(cenario);

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.undatedRefunds).toBe(1);
      expect(summary.totals.undatedRefundsCents).toBe(19900);
    });

    it('nao o soma aos estornos do periodo', async () => {
      const { service } = await build(cenario);

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.refundedCents).toBe(0);
    });

    // Decisao 8: sem data, o estorno nao tem mes — e atribuir um seria inventar
    // um lancamento em um periodo que ninguem fechou assim.
    it('nao o coloca em nenhum ponto da serie', async () => {
      const { service } = await build(cenario);

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.series.every((point) => point.refundedCents === 0)).toBe(true);
    });
  });

  /**
   * Decisao 10: quem abre o PIX, desiste e volta para pagar no cartao gera um
   * CANCELLED e um PAID. "Pagos / criados" leria essa pessoa como meia venda
   * perdida — e o numero ficaria pior quanto melhor a loja fosse em deixar o
   * comprador trocar de metodo.
   */
  describe('conversao por pessoa (Task 3.4)', () => {
    it('conta como uma pessoa convertida quem cancelou o PIX e pagou no cartao', async () => {
      const { service } = await build({
        orders: [
          pago('pix', { userId: 'u-1', status: 'CANCELLED', paidAt: null }),
          pago('card', { userId: 'u-1', method: 'CREDIT_CARD' }),
        ],
        rates: [PIX_RATE, CARD_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.attempts).toBe(1);
      expect(summary.totals.buyers).toBe(1);
      expect(summary.totals.conversionRate).toBe(100);
    });

    it('conta quem tentou e nao comprou no denominador', async () => {
      const { service } = await build({
        orders: [
          pago('a', { userId: 'u-1' }),
          pago('b', { userId: 'u-2', status: 'REJECTED', paidAt: null }),
        ],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.totals.attempts).toBe(2);
      expect(summary.totals.buyers).toBe(1);
      expect(summary.totals.conversionRate).toBe(50);
    });
  });

  describe('quebra por metodo e por modulo (Task 3.5)', () => {
    it('separa PIX de cartao com receita e quantidade', async () => {
      const { service } = await build({
        orders: [pago('a'), pago('b', { method: 'CREDIT_CARD', amountCents: 39800 })],
        rates: [PIX_RATE, CARD_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.byMethod).toEqual([
        { method: 'PIX', grossCents: 19900, paidOrders: 1, feeCents: 197 },
        { method: 'CREDIT_CARD', grossCents: 39800, paidOrders: 1, feeCents: 2026 },
      ]);
    });

    /**
     * Decisao 13: o valor por modulo sai de `OrderItem.priceCents`. Ler o preco
     * de hoje reescreveria o faturamento do passado a cada reajuste.
     */
    it('usa o snapshot do pedido, e nao o preco vigente do modulo', async () => {
      const { service } = await build({
        orders: [pago('a', { items: [{ moduleId: 'mod-1', priceCents: 14900 }] })],
        // O modulo ja foi reajustado para 29900 desde a compra.
        modules: [{ id: 'mod-1', title: 'Fundamentos' }],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.byModule[0].grossCents).toBe(14900);
    });

    it('agrupa por moduleId e exibe o titulo atual', async () => {
      const { service } = await build({
        orders: [
          pago('a', { items: [{ moduleId: 'mod-1', priceCents: 19900 }] }),
          pago('b', { items: [{ moduleId: 'mod-1', priceCents: 19900 }] }),
        ],
        modules: [{ id: 'mod-1', title: 'Fundamentos (revisado)' }],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.byModule).toHaveLength(1);
      expect(summary.byModule[0]).toMatchObject({
        title: 'Fundamentos (revisado)',
        quantity: 2,
        grossCents: 39800,
      });
    });
  });

  describe('serie temporal (Task 3.6)', () => {
    it('trunca a data no fuso de Sao Paulo, e nao no do banco', async () => {
      const { service, prisma } = await build({ orders: [pago('a')], rates: [PIX_RATE] });

      await service.summary({ ...SETEMBRO, granularity: 'day' });

      const series = prisma.rawCalls.find((call) => call.sql.includes('"paidAt" AT TIME ZONE'));

      expect(series).toBeDefined();
      expect(series?.values).toContain('America/Sao_Paulo');
    });

    it('poe a venda das 21h de 30/09 em Sao Paulo no ultimo ponto de setembro', async () => {
      const { service } = await build({
        // 01/10 00:00 UTC = 30/09 21:00 em Sao Paulo.
        orders: [pago('a', { paidAt: new Date('2026-10-01T00:00:00Z') })],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      const ultimo = summary.series[summary.series.length - 1];

      expect(ultimo.bucket).toBe('2026-09-30');
      expect(ultimo.grossCents).toBe(19900);
    });

    it('agrupa por mes quando a granularidade pede', async () => {
      const { service } = await build({ orders: [pago('a')], rates: [PIX_RATE] });

      const summary = await service.summary({
        from: '2026-08-01T03:00:00.000Z',
        to: '2026-10-01T03:00:00.000Z',
        granularity: 'month',
      });

      expect(summary.series.map((point) => point.bucket)).toEqual(['2026-08', '2026-09']);
    });

    it('devolve dia sem venda como ponto zero dentro do intervalo', async () => {
      const { service } = await build({ orders: [pago('a')], rates: [PIX_RATE] });

      const summary = await service.summary({
        from: '2026-09-09T03:00:00.000Z',
        to: '2026-09-12T03:00:00.000Z',
        granularity: 'day',
      });

      expect(summary.series).toEqual([
        { bucket: '2026-09-09', grossCents: 0, refundedCents: 0, paidOrders: 0 },
        { bucket: '2026-09-10', grossCents: 19900, refundedCents: 0, paidOrders: 1 },
        { bucket: '2026-09-11', grossCents: 0, refundedCents: 0, paidOrders: 0 },
      ]);
    });
  });

  describe('periodo anterior (Task 3.7)', () => {
    it('compara com a janela imediatamente anterior e de igual duracao', async () => {
      const { service } = await build({
        orders: [
          pago('a'),
          pago('antes', {
            createdAt: new Date('2026-08-15T12:00:00Z'),
            paidAt: new Date('2026-08-15T12:00:00Z'),
          }),
        ],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.previous?.period.to).toBe(SETEMBRO.from);
      expect(summary.previous?.grossCents).toBe(19900);
      expect(summary.previous?.changePercent).toBe(0);
    });

    // Decisao 19: sem base de comparacao a seta fica de fora, em vez de mostrar
    // "+100%".
    it('devolve a comparacao como nula quando o periodo anterior nao teve pedido', async () => {
      const { service } = await build({ orders: [pago('a')], rates: [PIX_RATE] });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.previous).toBeNull();
    });
  });

  /**
   * Decisao 14: o painel financeiro nao repete o `engagementRate` da Visao
   * Geral. Ele recorta quem **comprou** — cortesia e LEGACY ficam fora, porque
   * quem ganhou nao tem a mesma expectativa de quem pagou.
   */
  describe('engajamento do que foi vendido (Task 3.8)', () => {
    it('separa quem comprou e estudou de quem comprou e nao abriu', async () => {
      const { service } = await build({
        orders: [pago('a')],
        accesses: [
          { userId: 'u-1', moduleId: 'mod-1', source: 'PURCHASE', grantedAt: new Date('2026-09-05T12:00:00Z') },
          { userId: 'u-2', moduleId: 'mod-1', source: 'PURCHASE', grantedAt: new Date('2026-09-06T12:00:00Z') },
        ],
        completions: ['u-1:mod-1'],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.engagement).toEqual({
        buyers: 2,
        studied: 1,
        neverOpened: 1,
        rate: 50,
      });
    });

    it('deixa cortesia e LEGACY fora do recorte', async () => {
      const { service } = await build({
        orders: [pago('a')],
        accesses: [
          { userId: 'u-1', moduleId: 'mod-1', source: 'PURCHASE', grantedAt: new Date('2026-09-05T12:00:00Z') },
          { userId: 'u-3', moduleId: 'mod-1', source: 'COURTESY', grantedAt: new Date('2026-09-05T12:00:00Z') },
          { userId: 'u-4', moduleId: 'mod-1', source: 'LEGACY', grantedAt: new Date('2026-09-05T12:00:00Z') },
        ],
        completions: ['u-1:mod-1'],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.engagement.buyers).toBe(1);
    });
  });

  /**
   * Decisao 15: um zero afirma que houve zero venda em um periodo em que se
   * vendeu; a ausencia de pedido afirma outra coisa.
   */
  describe('base vazia (decisao 15)', () => {
    it('marca o periodo como vazio quando nao ha pedido nenhum', async () => {
      const { service } = await build({ rates: [PIX_RATE] });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.empty).toBe(true);
    });

    it('nao marca como vazio o periodo que teve pedido sem venda', async () => {
      const { service } = await build({
        orders: [pago('a', { status: 'REJECTED', paidAt: null })],
        rates: [PIX_RATE],
      });

      const summary = await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect(summary.empty).toBe(false);
      expect(summary.totals.grossCents).toBe(0);
    });
  });

  describe('validacao do recorte (Task 3.9)', () => {
    it('recusa from posterior a to', async () => {
      const { service } = await build();

      await expect(
        service.summary({
          from: '2026-09-30T00:00:00Z',
          to: '2026-09-01T00:00:00Z',
          granularity: 'day',
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('cai nos ultimos 30 dias quando o periodo nao e informado', async () => {
      const { service } = await build({ rates: [PIX_RATE] });

      const summary = await service.summary({ granularity: 'day' });

      const dias =
        (new Date(summary.period.to).getTime() - new Date(summary.period.from).getTime()) /
        (24 * 60 * 60 * 1000);

      expect(dias).toBe(30);
    });
  });

  /**
   * Decisao 12: nenhuma soma percorre pedidos em memoria. A suite guarda a
   * propriedade que importa — a listagem de pedidos nao e usada para somar
   * dinheiro.
   */
  describe('agregacao do banco (decisao 12)', () => {
    it('nao busca pedidos linha a linha para calcular o resumo', async () => {
      const { service, prisma } = await build({
        orders: [pago('a'), pago('b')],
        rates: [PIX_RATE],
      });

      await service.summary({ ...SETEMBRO, granularity: 'day' });

      expect((prisma.order as unknown as Record<string, unknown>).findMany).toBeUndefined();
    });
  });
});
