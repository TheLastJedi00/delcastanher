import { Injectable } from '@nestjs/common';
import { PaymentMethodKind } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { percentageOf } from '../progress/completion';
import {
  FinanceComparison,
  FinanceCourtesyBreakdown,
  FinanceEngagement,
  FinanceGranularity,
  FinanceMethodBreakdown,
  FinanceModuleBreakdown,
  FinanceSeriesPoint,
  FinanceOrderItem,
  FinanceOrderListResult,
  FinanceSummary,
  FinanceTotals,
} from './admin-finance.types';
import { FinanceSummaryDto, ListFinanceOrdersDto } from './dto/finance-query.dto';
import {
  REPORT_TIME_ZONE,
  ResolvedPeriod,
  bucketsOf,
  previousPeriod,
  resolvePeriod,
} from './finance-period';
import { GatewayFeeRateView, GatewayFeesService, feeOf } from './gateway-fees.service';

/** Os dois metodos, na ordem em que a tela os lista. */
const METHODS: PaymentMethodKind[] = ['PIX', 'CREDIT_CARD'];

/**
 * Ponto e virgula, e nao virgula: o Excel em pt-BR usa o separador de lista do
 * sistema, e com virgula a planilha inteira cai em uma coluna so. O arquivo e
 * para ser aberto, nao para satisfazer o RFC.
 */
const CSV_SEPARATOR = ';';

/**
 * Colunas da planilha. Sao exatamente as da listagem: a exportacao nao e uma
 * porta para dado que a tela nao mostra, e nao existe coluna de cartao nem de
 * CPF porque eles nao existem no banco (decisao 17).
 */
const CSV_HEADER = [
  'Pedido',
  'Data',
  'Situacao',
  'Metodo',
  'Parcelas',
  'Valor (R$)',
  'Comprador',
  'E-mail',
  'Modulos',
  // Spec 019, decisao 14: vazias no pedido de modulos avulsos.
  'Pacote',
  'Lote',
  'Order Mercado Pago',
  'Pagamento Mercado Pago',
  'Pago em',
  'Estornado em',
];

/**
 * Um campo de CSV. Separador, aspas e quebra de linha obrigam a citar: um
 * titulo de modulo com ponto e virgula partiria a linha em duas colunas.
 */
function csvField(value: string): string {
  if (!/[;"\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

/** Data no formato da tela; vazio para o nulo, que e ausencia do fato. */
function csvDate(value: Date | null): string {
  if (!value) {
    return '';
  }

  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');

  return `${day}/${month}/${value.getUTCFullYear()}`;
}

/**
 * O **unico** lugar desta spec onde um valor sai escrito, porque planilha e
 * para ser lida (decisao 2). A API continua devolvendo centavos inteiros.
 */
function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Linha da listagem, como a consulta a devolve. */
interface OrderRow {
  id: string;
  status: FinanceOrderItem['status'];
  amountCents: number;
  method: FinanceOrderItem['method'];
  installments: number;
  mpOrderId: string | null;
  mpPaymentId: string | null;
  mpStatusDetail: string | null;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
  user: { name: string | null; email: string };
  items: { titleSnapshot: string }[];
  bundleTitleSnapshot?: string | null;
  tierNameSnapshot?: string | null;
}

/** Linha da serie, como o Postgres a devolve. */
interface SeriesRow {
  bucket: string;
  cents: number;
  orders: number;
}

/** O recorte de engajamento, como o Postgres o devolve. */
interface EngagementRow {
  buyers: number;
  studied: number;
}

/** A menor das duas datas; a que existir, quando so uma existe. */
function earliest(current: Date | null, candidate: Date): Date {
  return current === null || candidate.getTime() < current.getTime() ? candidate : current;
}

/** A maior das duas datas; a que existir, quando so uma existe. */
function latest(current: Date | null, candidate: Date): Date {
  return current === null || candidate.getTime() > current.getTime() ? candidate : current;
}

/** Taxa apurada de um periodo, com o que ficou fora de vigencia. */
interface FeeResult {
  /** Nulo quando algum pagamento caiu fora de qualquer vigencia (decisao 5). */
  totalCents: number | null;
  byMethod: Map<PaymentMethodKind, number | null>;
  uncoveredOrders: number;
  uncoveredFrom: Date | null;
  uncoveredTo: Date | null;
}

/**
 * Resumo financeiro (Spec 016).
 *
 * Tres regras organizam tudo o que esta aqui:
 *
 * 1. **Receita sai de `Order`, e nunca de `ModuleAccess`** (decisao 1).
 *    `ModuleAccess` responde "quem pode assistir", e e indiferente a origem:
 *    compra, cortesia e o backfill `LEGACY` produzem a mesma linha. Contar
 *    acesso como venda somaria as cortesias do suporte ao faturamento, e o
 *    numero cresceria toda vez que um administrador resolvesse um chamado. A
 *    cortesia aparece aqui como contador **nao monetario**, exatamente para que
 *    o ranking de modulos nao seja lido como demanda quando parte dele foi
 *    concessao.
 * 2. **A agregacao e do banco** (decisao 12). Os indicadores saem de `groupBy`
 *    e `aggregate`, e a serie sai de `$queryRaw` — `groupBy` nao trunca data, e
 *    truncar e exatamente a operacao que precisa acontecer no Postgres. Trazer
 *    pedidos linha a linha para somar no Node funcionaria com cem vendas e
 *    viraria um problema silencioso com dez mil.
 * 3. **Ausencia de dado nao vira zero** (decisoes 5, 8 e 15). Liquido sem taxa
 *    cadastrada e nulo, estorno sem data tem contador proprio, e periodo sem
 *    pedido e `empty` — e nao uma tela de zeros.
 */
@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: GatewayFeesService,
  ) {}

  /** O painel inteiro de um periodo, em uma resposta. */
  async summary(query: FinanceSummaryDto): Promise<FinanceSummary> {
    const period = resolvePeriod(query.from, query.to);
    const granularity: FinanceGranularity = query.granularity;

    // A taxa e apurada uma vez e atravessa o resumo: ela entra no liquido do
    // topo e na quebra por metodo, e apura-la duas vezes dobraria as consultas
    // de recorte de vigencia sem mudar uma virgula do resultado.
    const fee = await this.feesOf(period);

    const [totals, byMethod, byModule, courtesy, series, engagement, previous] = await Promise.all([
      this.totalsOf(period, fee),
      this.methodsOf(period, fee),
      this.modulesOf(period),
      this.courtesyOf(period),
      this.seriesOf(period, granularity),
      this.engagementOf(period),
      this.comparisonOf(period),
    ]);

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      granularity,
      totals,
      previous,
      byMethod,
      byModule,
      courtesy,
      series,
      engagement,
      // Zero e diferente de "ainda nao vendemos" (decisao 15): um zero afirma
      // que houve zero venda num periodo em que se vendeu, e a ausencia de
      // pedido afirma outra coisa.
      empty:
        totals.paidOrders === 0 &&
        totals.pendingOrders === 0 &&
        totals.rejectedOrders === 0 &&
        totals.refundedOrders === 0 &&
        totals.attempts === 0,
    };
  }

  /**
   * Uma pagina da lista de pedidos.
   *
   * Busca, filtro, ordenacao e paginacao sao do **servidor** (Spec 013,
   * decisao 7): a tela nao guarda o historico financeiro inteiro para filtrar
   * em memoria.
   */
  async listOrders(query: ListFinanceOrdersDto): Promise<FinanceOrderListResult> {
    const where = this.ordersWhere(query);

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: this.ordersOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: { select: { name: true, email: true } },
          items: { select: { titleSnapshot: true } },
        },
      }) as unknown as Promise<OrderRow[]>,
    ]);

    return {
      items: rows.map((row) => this.toOrderItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * A lista inteira do filtro corrente, em CSV. Sem paginacao: montar o
   * arquivo no cliente exigiria varrer todas as paginas com N requisicoes
   * (Spec 013, decisao 13).
   */
  async exportOrdersCsv(query: ListFinanceOrdersDto): Promise<string> {
    const rows = (await this.prisma.order.findMany({
      where: this.ordersWhere(query),
      orderBy: this.ordersOrderBy(query),
      include: {
        user: { select: { name: true, email: true } },
        items: { select: { titleSnapshot: true } },
      },
    })) as unknown as OrderRow[];

    const lines = rows.map((row) => {
      const item = this.toOrderItem(row);

      return [
        item.id,
        csvDate(item.createdAt),
        item.status,
        item.method,
        String(item.installments),
        csvMoney(item.amountCents),
        // Sem nome — conta que parou antes do onboarding — o e-mail e o que a
        // tela mostra na coluna, e a planilha nao pode abrir com uma coluna
        // vazia.
        item.buyerName ?? item.buyerEmail,
        item.buyerEmail,
        item.modules.join(', '),
        item.bundle?.title ?? '',
        item.bundle?.tierName ?? '',
        item.mpOrderId ?? '',
        item.mpPaymentId ?? '',
        csvDate(item.paidAt),
        csvDate(item.refundedAt),
      ]
        .map(csvField)
        .join(CSV_SEPARATOR);
    });

    // BOM de UTF-8: sem ele o Excel em pt-BR abre "Joao" no lugar de "João".
    return `\ufeff${[CSV_HEADER.join(CSV_SEPARATOR), ...lines].join('\n')}\n`;
  }

  /**
   * Clausula do filtro. A mesma vai para a contagem, para a pagina e para a
   * exportacao: um total que nao corresponde as linhas exibidas quebra a
   * paginacao, e um CSV com outro filtro nao e a lista que esta na tela.
   */
  private ordersWhere(query: ListFinanceOrdersDto): Record<string, unknown> {
    const period = resolvePeriod(query.from, query.to);
    const where: Record<string, unknown> = {
      createdAt: { gte: period.from, lt: period.to },
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.method) {
      where.method = query.method;
    }

    const search = query.search?.trim();

    if (search) {
      // Os tres campos que o suporte tem em maos quando alguem liga: o e-mail
      // de quem comprou e os dois numeros que aparecem no painel do Mercado
      // Pago e no extrato do comprador.
      where.OR = [
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { mpOrderId: { contains: search, mode: 'insensitive' } },
        { mpPaymentId: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Ordenacao, sempre do banco. */
  private ordersOrderBy(query: ListFinanceOrdersDto): Record<string, unknown> {
    switch (query.sort) {
      case 'valor':
        return { amountCents: query.direction };
      case 'situacao':
        return { status: query.direction };
      default:
        return { createdAt: query.direction };
    }
  }

  /**
   * Linha da tabela. Nenhum dado de cartao e nenhum CPF (decisao 17): a API
   * nunca recebeu numero, validade ou CVV, e o CPF do pagador trafega para o
   * gateway sem ser persistido — o painel nao abre excecao, e nem teria de
   * onde tirar o dado.
   */
  private toOrderItem(row: OrderRow): FinanceOrderItem {
    return {
      id: row.id,
      status: row.status,
      amountCents: row.amountCents,
      method: row.method,
      installments: row.installments,
      buyerName: row.user?.name ?? null,
      buyerEmail: row.user?.email ?? '',
      modules: (row.items ?? []).map((item) => item.titleSnapshot),
      bundle:
        row.bundleTitleSnapshot && row.tierNameSnapshot
          ? { title: row.bundleTitleSnapshot, tierName: row.tierNameSnapshot }
          : null,
      mpOrderId: row.mpOrderId,
      mpPaymentId: row.mpPaymentId,
      mpStatusDetail: row.mpStatusDetail,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
      refundedAt: row.refundedAt,
    };
  }

  /** Os indicadores do topo. */
  private async totalsOf(period: ResolvedPeriod, fee: FeeResult): Promise<FinanceTotals> {
    const [paid, refunded, undated, pendingOrders, rejectedOrders, attempts, buyers] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { status: 'PAID', paidAt: { gte: period.from, lt: period.to } },
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: { status: 'REFUNDED', refundedAt: { gte: period.from, lt: period.to } },
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
        // Decisao 8: estorno anterior a coluna nao tem mes. Ele tem contador
        // proprio e nao e distribuido em periodo nenhum.
        this.prisma.order.aggregate({
          where: { status: 'REFUNDED', refundedAt: null },
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
        this.prisma.order.count({
          where: { status: 'PENDING', createdAt: { gte: period.from, lt: period.to } },
        }),
        this.prisma.order.count({
          where: { status: 'REJECTED', createdAt: { gte: period.from, lt: period.to } },
        }),
        // Decisao 10: conversao por **pessoa**. Quem abre o PIX, desiste e
        // volta no cartao gera um CANCELLED e um PAID — e "pagos / criados"
        // leria essa pessoa como meia venda perdida.
        this.prisma.order.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: period.from, lt: period.to } },
        }),
        this.prisma.order.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: period.from, lt: period.to }, status: 'PAID' },
        }),
      ]);

    const grossCents = paid._sum.amountCents ?? 0;
    const refundedCents = refunded._sum.amountCents ?? 0;
    const paidOrders = paid._count._all;

    return {
      grossCents,
      refundedCents,
      feeCents: fee.totalCents,
      // Liquido e bruto menos estornos menos taxa (decisao 3). Sem taxa
      // apurada ele nao existe — e nao vale o bruto.
      netCents: fee.totalCents === null ? null : grossCents - refundedCents - fee.totalCents,
      averageTicketCents: paidOrders === 0 ? 0 : Math.round(grossCents / paidOrders),
      paidOrders,
      pendingOrders,
      rejectedOrders,
      refundedOrders: refunded._count._all,
      uncoveredOrders: fee.uncoveredOrders,
      uncoveredFrom: fee.uncoveredFrom?.toISOString() ?? null,
      uncoveredTo: fee.uncoveredTo?.toISOString() ?? null,
      undatedRefunds: undated._count._all,
      undatedRefundsCents: undated._sum.amountCents ?? 0,
      conversionRate: percentageOf(buyers.length, attempts.length),
      buyers: buyers.length,
      attempts: attempts.length,
    };
  }

  /**
   * A taxa do periodo, somada **por pedido** (decisao 4).
   *
   * O periodo e recortado nas bordas das vigencias, e cada recorte agrupa os
   * pedidos por valor: o arredondamento continua acontecendo por pedido — que e
   * o que faz a soma bater com a conferencia manual — sem trazer uma linha por
   * venda para o Node. Recorte descoberto **nao** vira zero: ele torna o
   * liquido nulo e diz quantos pedidos ficaram de fora (decisao 5).
   */
  private async feesOf(period: ResolvedPeriod): Promise<FeeResult> {
    const rates = await this.fees.ratesUntil(period.to);

    const byMethod = new Map<PaymentMethodKind, number | null>();
    let covered = 0;
    let uncoveredOrders = 0;
    let uncoveredFrom: Date | null = null;
    let uncoveredTo: Date | null = null;

    for (const method of METHODS) {
      let methodFee: number | null = 0;

      for (const segment of this.segmentsOf(period, rates, method)) {
        if (segment.rate) {
          const groups = await this.prisma.order.groupBy({
            by: ['amountCents'],
            where: {
              status: 'PAID',
              method,
              paidAt: { gte: segment.from, lt: segment.to },
            },
            _count: { _all: true },
          });

          const segmentFee = groups.reduce(
            (sum, group) => sum + feeOf(group.amountCents, segment.rate as GatewayFeeRateView) * group._count._all,
            0,
          );

          methodFee = methodFee === null ? null : methodFee + segmentFee;

          continue;
        }

        const count = await this.prisma.order.count({
          where: { status: 'PAID', method, paidAt: { gte: segment.from, lt: segment.to } },
        });

        if (count === 0) {
          continue;
        }

        uncoveredOrders += count;
        uncoveredFrom = earliest(uncoveredFrom, segment.from);
        uncoveredTo = latest(uncoveredTo, segment.to);
        methodFee = null;
      }

      covered += methodFee ?? 0;
      byMethod.set(method, methodFee);
    }

    return {
      // Um unico recorte descoberto basta para o total nao existir: o liquido
      // do periodo ou esta apurado inteiro, ou nao esta (decisao 5).
      totalCents: uncoveredOrders > 0 ? null : covered,
      byMethod,
      uncoveredOrders,
      uncoveredFrom,
      uncoveredTo,
    };
  }

  /**
   * O periodo recortado nas bordas das vigencias de um metodo.
   *
   * Cada recorte sai com a vigencia que valia nele, ou com `null` onde nao
   * havia nenhuma. E por isto que um reajuste no meio do mes nao reescreve os
   * pagamentos anteriores a ele (decisao 4).
   */
  private segmentsOf(
    period: ResolvedPeriod,
    rates: GatewayFeeRateView[],
    method: PaymentMethodKind,
  ): { from: Date; to: Date; rate: GatewayFeeRateView | null }[] {
    const applicable = rates
      .filter((rate) => rate.method === method)
      .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());

    const segments: { from: Date; to: Date; rate: GatewayFeeRateView | null }[] = [];
    let cursor = period.from;

    for (const rate of applicable) {
      const end = rate.validTo ?? period.to;

      if (end <= cursor || rate.validFrom >= period.to) {
        continue;
      }

      const start = rate.validFrom > cursor ? rate.validFrom : cursor;

      if (start > cursor) {
        segments.push({ from: cursor, to: start, rate: null });
      }

      const stop = end < period.to ? end : period.to;

      if (stop > start) {
        segments.push({ from: start, to: stop, rate });
        cursor = stop;
      }
    }

    if (cursor < period.to) {
      segments.push({ from: cursor, to: period.to, rate: null });
    }

    return segments;
  }

  /** Quebra por meio de pagamento, com a taxa de cada um. */
  private async methodsOf(
    period: ResolvedPeriod,
    fee: FeeResult,
  ): Promise<FinanceMethodBreakdown[]> {
    const groups = await this.prisma.order.groupBy({
      by: ['method'],
      where: { status: 'PAID', paidAt: { gte: period.from, lt: period.to } },
      _sum: { amountCents: true },
      _count: { _all: true },
    });

    return METHODS.map((method) => {
      const group = groups.find((row) => row.method === method);

      return {
        method,
        grossCents: group?._sum.amountCents ?? 0,
        paidOrders: group?._count._all ?? 0,
        feeCents: fee.byMethod.get(method) ?? null,
      };
    });
  }

  /**
   * Ranking de receita por modulo, pelo **snapshot** do pedido (decisao 13).
   *
   * O agrupamento e por `moduleId` e o titulo exibido e o atual: renomear um
   * modulo nao pode partir a linha em duas, e reajustar o preco nao pode mudar
   * o faturamento de um periodo ja fechado.
   */
  private async modulesOf(period: ResolvedPeriod): Promise<FinanceModuleBreakdown[]> {
    const groups = await this.prisma.orderItem.groupBy({
      by: ['moduleId'],
      where: { order: { status: 'PAID', paidAt: { gte: period.from, lt: period.to } } },
      _sum: { priceCents: true },
      _count: { _all: true },
    });

    const titles = await this.titlesOf(groups.map((group) => group.moduleId));

    return groups
      .map((group) => ({
        moduleId: group.moduleId,
        title: titles.get(group.moduleId) ?? 'Modulo removido',
        grossCents: group._sum.priceCents ?? 0,
        quantity: group._count._all,
      }))
      .sort((a, b) => b.grossCents - a.grossCents);
  }

  /**
   * Acessos concedidos sem compra no periodo — **sem valor monetario**
   * (decisao 1). O contador existe para que o ranking de modulos nao seja lido
   * como demanda quando parte dele foi concessao.
   */
  private async courtesyOf(period: ResolvedPeriod): Promise<FinanceCourtesyBreakdown[]> {
    const groups = await this.prisma.moduleAccess.groupBy({
      by: ['moduleId', 'source'],
      where: {
        source: { in: ['COURTESY', 'LEGACY'] },
        grantedAt: { gte: period.from, lt: period.to },
      },
      _count: { _all: true },
    });

    const titles = await this.titlesOf(groups.map((group) => group.moduleId));
    const byModule = new Map<string, FinanceCourtesyBreakdown>();

    for (const group of groups) {
      const row = byModule.get(group.moduleId) ?? {
        moduleId: group.moduleId,
        title: titles.get(group.moduleId) ?? 'Modulo removido',
        courtesyCount: 0,
        legacyCount: 0,
      };

      if (group.source === 'COURTESY') {
        row.courtesyCount += group._count._all;
      } else {
        row.legacyCount += group._count._all;
      }

      byModule.set(group.moduleId, row);
    }

    return [...byModule.values()].sort(
      (a, b) => b.courtesyCount + b.legacyCount - (a.courtesyCount + a.legacyCount),
    );
  }

  /**
   * A serie temporal, truncada no fuso de Sao Paulo (decisao 11).
   *
   * O corte sai do banco porque `groupBy` do Prisma nao trunca data, e truncar
   * e a operacao. Uma venda as 21h de terca em Brasilia e quarta em UTC:
   * agrupar pelo fuso do banco jogaria tres horas de vendas de todo dia para o
   * dia seguinte.
   *
   * **Sao duas conversoes, e nao uma.** `paidAt` e `timestamp` sem fuso
   * guardando UTC, e `AT TIME ZONE` sobre uma coluna assim **interpreta** o
   * valor como sendo daquele fuso — o oposto do que se quer. O primeiro
   * `AT TIME ZONE 'UTC'` diz de onde o instante vem, e so entao o segundo o
   * escreve no fuso do relatorio. Com uma conversao so, a venda das 21h de
   * 17/09 caia no dia 18.
   */
  private async seriesOf(
    period: ResolvedPeriod,
    granularity: FinanceGranularity,
  ): Promise<FinanceSeriesPoint[]> {
    const unit = granularity === 'month' ? 'month' : 'day';
    const format = granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

    const [paid, refunded] = await Promise.all([
      this.prisma.$queryRaw<SeriesRow[]>`
        SELECT to_char(
                 date_trunc(
                   ${unit}::text,
                   ("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIME_ZONE}
                 ),
                 ${format}::text
               ) AS bucket,
               COALESCE(SUM("amountCents"), 0)::int AS cents,
               COUNT(*)::int AS orders
        FROM "orders"
        WHERE "status" = 'PAID' AND "paidAt" >= ${period.from} AND "paidAt" < ${period.to}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<SeriesRow[]>`
        SELECT to_char(
                 date_trunc(
                   ${unit}::text,
                   ("refundedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIME_ZONE}
                 ),
                 ${format}::text
               ) AS bucket,
               COALESCE(SUM("amountCents"), 0)::int AS cents,
               COUNT(*)::int AS orders
        FROM "orders"
        WHERE "status" = 'REFUNDED'
          AND "refundedAt" >= ${period.from} AND "refundedAt" < ${period.to}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const gross = new Map(paid.map((row) => [row.bucket, row]));
    const refunds = new Map(refunded.map((row) => [row.bucket, row]));

    // Dia sem venda entra como ponto zero **dentro** do intervalo: sem isso o
    // grafico ligaria duas datas distantes com uma reta que nao aconteceu.
    return bucketsOf(period, granularity).map((bucket) => ({
      bucket,
      grossCents: Number(gross.get(bucket)?.cents ?? 0),
      refundedCents: Number(refunds.get(bucket)?.cents ?? 0),
      paidOrders: Number(gross.get(bucket)?.orders ?? 0),
    }));
  }

  /**
   * O uso do que foi pago (decisao 14).
   *
   * Recorta acessos com `source = PURCHASE` concedidos no periodo: cortesia e
   * `LEGACY` ficam fora de proposito, porque quem ganhou nao tem a mesma
   * expectativa de quem pagou. E o indicador que antecipa estorno e
   * reclamacao — modulo que vende bem e ninguem assiste e um problema
   * diferente de modulo que ninguem compra.
   */
  private async engagementOf(period: ResolvedPeriod): Promise<FinanceEngagement> {
    const [row] = await this.prisma.$queryRaw<EngagementRow[]>`
      SELECT COUNT(DISTINCT ma."userId")::int AS buyers,
             COUNT(DISTINCT ma."userId") FILTER (
               WHERE EXISTS (
                 SELECT 1
                 FROM "lesson_progress" lp
                 JOIN "lessons" l ON l."id" = lp."lessonId"
                 WHERE lp."userId" = ma."userId" AND l."moduleId" = ma."moduleId"
               )
             )::int AS studied
      FROM "module_access" ma
      WHERE ma."source" = 'PURCHASE'
        AND ma."grantedAt" >= ${period.from} AND ma."grantedAt" < ${period.to}
    `;

    const buyers = Number(row?.buyers ?? 0);
    const studied = Number(row?.studied ?? 0);

    return { buyers, studied, neverOpened: buyers - studied, rate: percentageOf(studied, buyers) };
  }

  /**
   * A comparacao com o periodo anterior, de igual duracao (decisao 19).
   *
   * Sem pedido no periodo anterior a comparacao e **nula**, e nao uma alta de
   * 100%: a seta de tendencia some, em vez de afirmar um crescimento que nao
   * tem base.
   */
  private async comparisonOf(period: ResolvedPeriod): Promise<FinanceComparison | null> {
    const previous = previousPeriod(period);

    const [paid, anyOrder, current] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: 'PAID', paidAt: { gte: previous.from, lt: previous.to } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: previous.from, lt: previous.to } },
      }),
      this.prisma.order.aggregate({
        where: { status: 'PAID', paidAt: { gte: period.from, lt: period.to } },
        _sum: { amountCents: true },
      }),
    ]);

    if (anyOrder === 0) {
      return null;
    }

    const before = paid._sum.amountCents ?? 0;
    const now = current._sum.amountCents ?? 0;

    return {
      period: { from: previous.from.toISOString(), to: previous.to.toISOString() },
      grossCents: before,
      paidOrders: paid._count._all,
      // Faturamento anterior zerado nao produz percentual: dividir por zero
      // daria "+Infinity%", que nao e uma tendencia.
      changePercent: before === 0 ? null : Math.round(((now - before) / before) * 100),
    };
  }

  /** Titulos **atuais** dos modulos, em uma consulta. */
  private async titlesOf(moduleIds: string[]): Promise<Map<string, string>> {
    if (moduleIds.length === 0) {
      return new Map();
    }

    const modules = await this.prisma.module.findMany({
      where: { id: { in: [...new Set(moduleIds)] } },
      select: { id: true, title: true },
    });

    return new Map(modules.map((module) => [module.id, module.title]));
  }
}
