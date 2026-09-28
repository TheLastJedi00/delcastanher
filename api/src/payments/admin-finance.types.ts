import { OrderStatus, PaymentMethodKind } from '../generated/prisma/client';

/**
 * Tipos do painel financeiro (Spec 016).
 *
 * **Todo valor daqui e centavo inteiro** (decisao 2). Nenhuma resposta devolve
 * `199.00`, `"R$ 199,00"` ou float: devolve `19900`. A formatacao acontece no
 * template, e o CSV e o unico lugar onde um valor sai escrito, porque planilha
 * e para ser lida. Percentuais seguem a regra da Spec 013: inteiro de 0 a 100,
 * com a definicao escrita ao lado do numero.
 */

/** Recorte de tempo, em ISO. `to` e exclusivo. */
export interface FinancePeriod {
  from: string;
  to: string;
}

/** Granularidade da serie temporal. */
export type FinanceGranularity = 'day' | 'month';

/** Os indicadores do periodo. */
export interface FinanceTotals {
  /** Soma dos pedidos `PAID` pagos no periodo. */
  grossCents: number;
  /** Soma dos pedidos `REFUNDED` estornados no periodo, por `refundedAt`. */
  refundedCents: number;
  /**
   * Taxa do gateway somada **por pedido** (decisao 4). Nulo quando algum
   * pagamento do periodo cai fora de qualquer vigencia: taxa ausente tratada
   * como zero produziria um liquido inflado e crivel (decisao 5).
   */
  feeCents: number | null;
  /** Bruto menos estornos menos taxa. Nulo pelo mesmo motivo que a taxa. */
  netCents: number | null;
  /** Bruto dividido pelos pedidos pagos. Zero pedido pago e ticket zero. */
  averageTicketCents: number;
  paidOrders: number;
  pendingOrders: number;
  rejectedOrders: number;
  refundedOrders: number;
  /** Pedidos pagos sem vigencia de taxa que os cubra (decisao 5). */
  uncoveredOrders: number;
  /** O intervalo descoberto, para a tela dizer qual taxa falta cadastrar. */
  uncoveredFrom: string | null;
  uncoveredTo: string | null;
  /**
   * Estornos anteriores a coluna `refundedAt` (decisao 8). Contador proprio:
   * eles **nao** entram em `refundedCents` nem em nenhum ponto da serie, porque
   * nao tem mes — e atribuir um seria inventar um lancamento.
   */
  undatedRefunds: number;
  undatedRefundsCents: number;
  /**
   * De quem tentou comprar, quantos compraram — por **pessoa**, e nao por
   * pedido (decisao 10).
   */
  conversionRate: number;
  buyers: number;
  attempts: number;
}

/** Quebra por meio de pagamento. */
export interface FinanceMethodBreakdown {
  method: PaymentMethodKind;
  grossCents: number;
  paidOrders: number;
  /** Nulo quando algum pagamento deste metodo ficou fora de vigencia. */
  feeCents: number | null;
}

/**
 * Quebra por modulo. O valor sai do **snapshot** de `OrderItem.priceCents`, e
 * nao do preco vigente: ler o preco de hoje reescreveria o faturamento do
 * passado a cada reajuste (decisao 13). O titulo exibido e o atual, e o
 * agrupamento e por `moduleId`, para que renomear um modulo nao parta a linha
 * em duas.
 */
export interface FinanceModuleBreakdown {
  moduleId: string;
  title: string;
  grossCents: number;
  quantity: number;
}

/**
 * Acesso concedido sem compra, no periodo. **Sem valor monetario, de
 * proposito** (decisao 1): contar cortesia como venda somaria os chamados do
 * suporte ao faturamento, e o numero cresceria toda vez que um administrador
 * resolvesse um problema.
 */
export interface FinanceCourtesyBreakdown {
  moduleId: string;
  title: string;
  courtesyCount: number;
  legacyCount: number;
}

/** Um ponto da serie. `bucket` e a chave no fuso de Sao Paulo. */
export interface FinanceSeriesPoint {
  bucket: string;
  grossCents: number;
  refundedCents: number;
  paidOrders: number;
}

/**
 * O periodo imediatamente anterior, de **igual duracao** (decisao 19). "Mes
 * anterior" no dia 5 nao e o mes inteiro contra cinco dias: essa conta mostra
 * queda todo mes ate o dia 30.
 */
export interface FinanceComparison {
  period: FinancePeriod;
  grossCents: number;
  paidOrders: number;
  /**
   * Variacao do bruto, em percentual inteiro. **Nulo** quando o periodo
   * anterior nao teve pedido: sem base de comparacao a seta nao aparece, em vez
   * de mostrar "+100%".
   */
  changePercent: number | null;
}

/**
 * O uso do que foi pago (decisao 14). Recorta **quem comprou**: acessos com
 * `source = PURCHASE`. Cortesia e `LEGACY` ficam fora de proposito — quem
 * ganhou nao tem a mesma expectativa de quem pagou.
 */
export interface FinanceEngagement {
  buyers: number;
  /** Compradores que concluiram ao menos uma aula de um modulo comprado. */
  studied: number;
  /** Compradores que nao abriram nada do que compraram. */
  neverOpened: number;
  rate: number;
}

/** A resposta de `GET /admin/finance/summary`. */
export interface FinanceSummary {
  period: FinancePeriod;
  granularity: FinanceGranularity;
  totals: FinanceTotals;
  /** Nulo quando o periodo anterior nao teve pedido (decisao 19). */
  previous: FinanceComparison | null;
  byMethod: FinanceMethodBreakdown[];
  byModule: FinanceModuleBreakdown[];
  courtesy: FinanceCourtesyBreakdown[];
  series: FinanceSeriesPoint[];
  engagement: FinanceEngagement;
  /**
   * Verdadeiro quando nao houve **nenhum** pedido no periodo. Zero e uma
   * afirmacao diferente de "ainda nao vendemos" (decisao 15), e a tela precisa
   * poder dizer a segunda coisa sem desenhar um grafico reto no zero.
   */
  empty: boolean;
}

/** Linha da lista de pedidos. Sem dado de cartao e sem CPF (decisao 17). */
export interface FinanceOrderItem {
  id: string;
  status: OrderStatus;
  amountCents: number;
  method: PaymentMethodKind;
  installments: number;
  buyerName: string | null;
  buyerEmail: string;
  modules: string[];
  /**
   * Pacote e lote do pedido de pacote (Spec 019, decisao 14); nulo no avulso.
   * A tela mostra isto no lugar dos 12 titulos. Valores, taxas e liquido nao
   * mudam: continuam saindo de `amountCents`.
   */
  bundle: { title: string; tierName: string } | null;
  mpOrderId: string | null;
  mpPaymentId: string | null;
  mpStatusDetail: string | null;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
}

export interface FinanceOrderListResult {
  items: FinanceOrderItem[];
  total: number;
  page: number;
  pageSize: number;
}
