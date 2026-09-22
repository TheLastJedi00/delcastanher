import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Painel financeiro (Spec 016).
 *
 * **Todo valor aqui e centavo inteiro** (decisao 2). Nenhum campo deste arquivo
 * carrega `199.00`, `"R$ 199,00"` ou float: a formatacao acontece no template,
 * e o CSV — que vem pronto do servidor — e o unico lugar onde um valor sai
 * escrito.
 */

export type FinanceGranularity = 'day' | 'month';
export type FinanceMethod = 'PIX' | 'CREDIT_CARD';
export type FinanceOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED';

export interface FinancePeriod {
  from: string;
  to: string;
}

export interface FinanceTotals {
  grossCents: number;
  refundedCents: number;
  /** Nulo e **nao apurado**, e nunca zero: nao ha taxa cadastrada que cubra o
   * periodo, e um liquido inflado e crivel e a pior forma de errar dinheiro
   * (decisao 5). */
  feeCents: number | null;
  netCents: number | null;
  averageTicketCents: number;
  paidOrders: number;
  pendingOrders: number;
  rejectedOrders: number;
  refundedOrders: number;
  uncoveredOrders: number;
  uncoveredFrom: string | null;
  uncoveredTo: string | null;
  /** Estornos anteriores a coluna `refundedAt`: sem mes, em linha propria
   * (decisao 8). */
  undatedRefunds: number;
  undatedRefundsCents: number;
  /** De quem tentou comprar, quantos compraram — por pessoa (decisao 10). */
  conversionRate: number;
  buyers: number;
  attempts: number;
}

export interface FinanceMethodBreakdown {
  method: FinanceMethod;
  grossCents: number;
  paidOrders: number;
  feeCents: number | null;
}

export interface FinanceModuleBreakdown {
  moduleId: string;
  title: string;
  grossCents: number;
  quantity: number;
}

/** Acesso concedido sem compra. **Sem valor monetario, de proposito** (decisao 1). */
export interface FinanceCourtesyBreakdown {
  moduleId: string;
  title: string;
  courtesyCount: number;
  legacyCount: number;
}

export interface FinanceSeriesPoint {
  bucket: string;
  grossCents: number;
  refundedCents: number;
  paidOrders: number;
}

export interface FinanceComparison {
  period: FinancePeriod;
  grossCents: number;
  paidOrders: number;
  /** Nulo sem base de comparacao: a seta some, em vez de mostrar "+100%". */
  changePercent: number | null;
}

export interface FinanceEngagement {
  buyers: number;
  studied: number;
  neverOpened: number;
  rate: number;
}

export interface FinanceSummary {
  period: FinancePeriod;
  granularity: FinanceGranularity;
  totals: FinanceTotals;
  previous: FinanceComparison | null;
  byMethod: FinanceMethodBreakdown[];
  byModule: FinanceModuleBreakdown[];
  courtesy: FinanceCourtesyBreakdown[];
  series: FinanceSeriesPoint[];
  engagement: FinanceEngagement;
  /** Verdadeiro sem pedido nenhum: "ainda nao vendemos" nao e zero (decisao 15). */
  empty: boolean;
}

export interface FinanceOrderItem {
  id: string;
  status: FinanceOrderStatus;
  amountCents: number;
  method: FinanceMethod;
  installments: number;
  buyerName: string | null;
  buyerEmail: string;
  modules: string[];
  mpOrderId: string | null;
  mpPaymentId: string | null;
  mpStatusDetail: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

export interface FinanceOrderListResult {
  items: FinanceOrderItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Uma vigencia de taxa, com o autor que a cadastrou (decisao 7). */
export interface GatewayFeeRate {
  id: string;
  method: FinanceMethod;
  percentBasisPoints: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
  createdById: string;
  createdByEmail: string;
  note: string | null;
  createdAt: string;
}

export interface GatewayFeesResult {
  current: Record<FinanceMethod, GatewayFeeRate | null>;
  history: GatewayFeeRate[];
}

/** O cadastro de uma vigencia. Autoria **nao** vai no corpo (decisao 7). */
export interface CreateGatewayFeeInput {
  method: FinanceMethod;
  percentBasisPoints: number;
  fixedCents: number;
  validFrom: string;
  note?: string;
}

/** Filtro do resumo. E ele que vira query string e URL compartilhavel. */
export interface FinanceQuery {
  from: string;
  to: string;
  granularity: FinanceGranularity;
}

/** Filtro da lista de pedidos. */
export interface FinanceOrdersQuery {
  page: number;
  pageSize: number;
  search: string;
  status: FinanceOrderStatus | null;
  method: FinanceMethod | null;
}

/** Um dia em milissegundos. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Janela default: os ultimos 30 dias, a mesma do `ACTIVITY_WINDOW_DAYS` da
 * Spec 013 — as duas abas do painel nao podem ter dois "recente" diferentes.
 */
export const FINANCE_WINDOW_DAYS = 30;

/** O recorte em que a aba abre. */
export function defaultFinanceQuery(now = new Date()): FinanceQuery {
  return {
    from: new Date(now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS).toISOString(),
    to: now.toISOString(),
    granularity: 'day',
  };
}

export const DEFAULT_FINANCE_ORDERS_QUERY: FinanceOrdersQuery = {
  page: 1,
  pageSize: 20,
  search: '',
  status: null,
  method: null,
};

/**
 * Leitura do painel financeiro, no padrao do `AdminUsersService`.
 *
 * Todo filtro vai ao servidor: a aba nao guarda o historico financeiro inteiro
 * para filtrar em memoria (Spec 013, decisao 7). A unica escrita e o cadastro
 * de vigencia de taxa — nao ha estornar, cancelar nem conceder desconto por
 * aqui (decisao 20).
 */
@Injectable({ providedIn: 'root' })
export class AdminFinanceService {
  private readonly http = inject(HttpClient);

  private readonly summaryState = signal<FinanceSummary | null>(null);
  private readonly ordersState = signal<FinanceOrderListResult | null>(null);
  private readonly feesState = signal<GatewayFeesResult | null>(null);

  private readonly queryState = signal<FinanceQuery>(defaultFinanceQuery());
  private readonly ordersQueryState = signal<FinanceOrdersQuery>({
    ...DEFAULT_FINANCE_ORDERS_QUERY,
  });

  private readonly loadingState = signal(false);
  private readonly ordersLoadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly ordersErrorState = signal<string | null>(null);

  readonly query = this.queryState.asReadonly();
  readonly ordersQuery = this.ordersQueryState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly ordersLoading = this.ordersLoadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly ordersError = this.ordersErrorState.asReadonly();

  readonly summary = this.summaryState.asReadonly();
  readonly fees = this.feesState.asReadonly();

  readonly totals = computed(() => this.summaryState()?.totals ?? null);
  readonly series = computed(() => this.summaryState()?.series ?? []);
  readonly orders = computed(() => this.ordersState()?.items ?? []);
  readonly ordersTotal = computed(() => this.ordersState()?.total ?? 0);

  readonly ordersTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.ordersTotal() / this.ordersQueryState().pageSize)),
  );

  /**
   * Verdadeiro so quando a consulta terminou e o periodo nao teve pedido
   * nenhum. Nao e "os numeros deram zero": e "nao houve pedido" (decisao 15).
   */
  readonly empty = computed(() => !this.loadingState() && this.summaryState()?.empty === true);

  /**
   * Verdadeiro quando o liquido nao pode ser apurado. A tela mostra um estado
   * proprio, e **nunca** um numero (decisao 5).
   */
  readonly unassessedNet = computed(() => {
    const totals = this.totals();

    return totals !== null && totals.feeCents === null;
  });

  /** Carrega o resumo do recorte corrente. */
  load(): Observable<FinanceSummary> {
    this.loadingState.set(true);
    this.errorState.set(null);

    return this.http
      .get<FinanceSummary>(`${environment.apiUrl}/admin/finance/summary`, {
        params: this.toParams(this.queryState()),
      })
      .pipe(
        tap(result => this.summaryState.set(result)),
        catchError((error: HttpErrorResponse) => {
          const message = this.toMessage(error);
          this.errorState.set(message);

          return throwError(() => message);
        }),
        finalize(() => this.loadingState.set(false)),
      );
  }

  /** Muda o recorte e recarrega o resumo. */
  setQuery(patch: Partial<FinanceQuery>): Observable<FinanceSummary> {
    this.queryState.update(current => ({ ...current, ...patch }));

    return this.load();
  }

  /** Uma pagina da lista de pedidos, com o recorte de periodo corrente. */
  loadOrders(): Observable<FinanceOrderListResult> {
    this.ordersLoadingState.set(true);
    this.ordersErrorState.set(null);

    return this.http
      .get<FinanceOrderListResult>(`${environment.apiUrl}/admin/finance/orders`, {
        params: this.toOrderParams(),
      })
      .pipe(
        tap(result => this.ordersState.set(result)),
        catchError((error: HttpErrorResponse) => {
          const message = this.toMessage(error);
          this.ordersErrorState.set(message);

          return throwError(() => message);
        }),
        finalize(() => this.ordersLoadingState.set(false)),
      );
  }

  /**
   * Muda o filtro da lista e recarrega. Qualquer mudanca que nao seja de
   * pagina volta para a primeira: com um filtro novo, continuar na pagina 4
   * costuma cair em uma lista vazia que parece um erro.
   */
  setOrdersQuery(patch: Partial<FinanceOrdersQuery>): Observable<FinanceOrderListResult> {
    this.ordersQueryState.update(current => ({ ...current, ...patch, page: patch.page ?? 1 }));

    return this.loadOrders();
  }

  /** Historico de vigencias de taxa, com autor e data. */
  loadFees(): Observable<GatewayFeesResult> {
    return this.http
      .get<GatewayFeesResult>(`${environment.apiUrl}/admin/finance/fees`)
      .pipe(
        tap(result => this.feesState.set(result)),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  /**
   * Cadastra uma vigencia. A anterior do mesmo metodo e encerrada no servidor:
   * nada e editado no lugar e nada e apagado (decisao 7).
   */
  createFee(input: CreateGatewayFeeInput): Observable<GatewayFeeRate> {
    return this.http
      .post<GatewayFeeRate>(`${environment.apiUrl}/admin/finance/fees`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /**
   * Baixa a lista inteira do filtro corrente. O arquivo vem pronto do
   * servidor: monta-lo aqui exigiria varrer todas as paginas.
   */
  exportCsv(): Observable<Blob> {
    return this.http
      .get(`${environment.apiUrl}/admin/finance/orders/export`, {
        params: this.toOrderParams(),
        responseType: 'blob',
      })
      .pipe(
        catchError(() =>
          throwError(() => 'Não foi possível gerar a planilha. Tente novamente.'),
        ),
      );
  }

  /** Descarta o estado; chamado ao encerrar a sessao. */
  clear(): void {
    this.summaryState.set(null);
    this.ordersState.set(null);
    this.feesState.set(null);
    this.queryState.set(defaultFinanceQuery());
    this.ordersQueryState.set({ ...DEFAULT_FINANCE_ORDERS_QUERY });
    this.errorState.set(null);
    this.ordersErrorState.set(null);
  }

  /** O recorte em query string. */
  private toParams(query: FinanceQuery): HttpParams {
    return new HttpParams()
      .set('from', query.from)
      .set('to', query.to)
      .set('granularity', query.granularity);
  }

  /**
   * O filtro da lista herda o periodo do resumo: a tabela de pedidos e a
   * mesma tela, e um CSV de outro intervalo nao seria a lista exibida.
   *
   * Campo vazio nao vira parametro: a API recusa valor fora do conjunto, e
   * mandar `status=` seria exatamente isso.
   */
  private toOrderParams(): HttpParams {
    const period = this.queryState();
    const query = this.ordersQueryState();

    let params = new HttpParams()
      .set('from', period.from)
      .set('to', period.to)
      .set('page', query.page)
      .set('pageSize', query.pageSize);

    const search = query.search.trim();

    if (search) {
      params = params.set('search', search);
    }

    if (query.status) {
      params = params.set('status', query.status);
    }

    if (query.method) {
      params = params.set('method', query.method);
    }

    return params;
  }

  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.';
    }

    if (error.status === 403) {
      return 'Esta área é restrita a administradores.';
    }

    const detail: unknown = error.error?.message;

    if (Array.isArray(detail)) {
      return detail.join(' ');
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Não foi possível concluir a operação. Tente novamente.';
  }
}
