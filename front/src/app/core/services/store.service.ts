import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Modulo na vitrine, como `GET /store/catalog` o devolve. */
export interface StoreModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  lessonCount: number;
  /** Nulo = "a definir": o modulo aparece como "em breve" (Spec 014, decisao 1). */
  priceCents: number | null;
  purchasable: boolean;
  access: { unlocked: boolean; expiresAt: string | null };
}

/** Modulo na vitrine publica: so o que a pagina exibe (Spec 019). */
export interface OfferModule {
  order: number;
  title: string;
  priceCents: number | null;
}

/** Lote vigente, com as vagas que sobram. `remaining` nulo = sem limite. */
export interface OfferTier {
  id: string;
  order: number;
  name: string;
  priceCents: number;
  capacity: number | null;
  remaining: number | null;
}

/** Pacote ativo com o lote vigente, como `GET /store/offer` o devolve. */
export interface BundleOffer {
  slug: string;
  title: string;
  modules: OfferModule[];
  /** Soma dos precos avulsos — a ancora riscada. Nula se algum esta sem preco. */
  modulesTotalCents: number | null;
  tier: OfferTier | null;
  nextTier: { name: string; priceCents: number } | null;
}

/** Vitrine publica: modulos avulsos e o pacote ativo (Spec 019, decisao 10). */
export interface StoreOffer {
  modules: OfferModule[];
  bundle: BundleOffer | null;
}

/**
 * O que o aluno escolheu comprar: **ou** o pacote **ou** modulos avulsos, e
 * nunca os dois — o pedido e um ou outro (Spec 019, decisoes 5 e 12).
 */
export type StoreSelection =
  | { kind: 'modules'; ids: string[] }
  | { kind: 'bundle'; slug: string };

/** Chave publica e ambiente, vindos da API e nao do build (decisao 16). */
export interface PaymentConfig {
  publicKey: string | null;
  sandbox: boolean;
  enabled: boolean;
  maxInstallments: number;
}

export type OrderStatus = 'PENDING' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
export type PaymentMethodKind = 'PIX' | 'CREDIT_CARD';

export interface OrderItemView {
  moduleId: string;
  title: string;
  priceCents: number;
}

/** Dados do PIX para a tela cobrar. */
export interface PixDetails {
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string | null;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  amountCents: number;
  method: PaymentMethodKind;
  installments: number;
  items: OrderItemView[];
  pix: PixDetails | null;
  expiresAt: string | null;
  paidAt: string | null;
  /** Preenchido na recusa: o que aconteceu e o que fazer a seguir. */
  message: string | null;
  mpOrderId: string | null;
  mpPaymentId: string | null;
  /** Pacote e lote do pedido de pacote (Spec 019); nulo no avulso. */
  bundle: { title: string; tierName: string } | null;
}

/** Dados do comprador. Nenhum campo de cartao aqui (decisao 8). */
export interface OrderPayer {
  firstName: string;
  lastName: string;
  email: string;
  /** CPF so com digitos. */
  document: string;
}

export interface CreateOrderPayload {
  /** Modulos avulsos, ou... */
  moduleIds?: string[];
  /** ...o pacote. Nunca os dois, e nunca preco nem lote (Spec 019, decisao 5). */
  bundleSlug?: string;
  method: PaymentMethodKind;
  payer: OrderPayer;
  installments?: number;
  /** Token do SDK — nunca numero, validade ou CVV. */
  card?: { token: string; paymentMethodId: string; installments: number };
  deviceId?: string;
}

/** Estados em que nao ha mais o que esperar do gateway. */
const TERMINAL: OrderStatus[] = ['PAID', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.includes(status);
}

/** Centavos para "R$ 199,00". A tela nunca monta preco por conta propria. */
export function formatPrice(cents: number | null): string {
  if (cents === null) {
    return 'A definir';
  }

  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Loja de modulos e checkout (Spec 014).
 *
 * O carrinho vive aqui como signal porque a compra atravessa rotas irmas —
 * catalogo, pagamento e acompanhamento —, o mesmo motivo que levou a Spec 007 a
 * criar um servico de jornada. A diferenca e que agora existe pedido de verdade
 * do outro lado: recarregar a pagina no meio do pagamento nao perde a compra,
 * porque ela tem id no servidor.
 *
 * **Nenhum preco sai daqui para a API**: o pedido leva ids de modulo ou o slug
 * do pacote, e o valor e somado — ou o lote, escolhido — no servidor (Spec 014,
 * decisao 2; Spec 019, decisao 5).
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly http = inject(HttpClient);

  private readonly catalogState = signal<StoreModuleItem[]>([]);
  private readonly selectedState = signal<Set<string>>(new Set());
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly configState = signal<PaymentConfig | null>(null);
  private readonly orderState = signal<OrderView | null>(null);
  private readonly offerState = signal<StoreOffer | null>(null);
  /** Slug do pacote escolhido. Exclusivo com `selectedState` (Spec 019). */
  private readonly bundleState = signal<string | null>(null);

  readonly catalog = this.catalogState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly config = this.configState.asReadonly();
  readonly order = this.orderState.asReadonly();
  readonly offer = this.offerState.asReadonly();

  /** Pacote ativo da vitrine, ou nulo se nao ha (ou se a oferta nao carregou). */
  readonly bundleOffer = computed(() => this.offerState()?.bundle ?? null);

  /** O pacote escolhido, quando a escolha e o pacote. */
  readonly selectedBundle = computed(() => {
    const slug = this.bundleState();
    const bundle = this.bundleOffer();

    return slug && bundle?.slug === slug ? bundle : null;
  });

  /** A escolha como o pedido a envia: pacote ou modulos (decisao 12). */
  readonly selection = computed<StoreSelection>(() => {
    const slug = this.bundleState();

    return slug ? { kind: 'bundle', slug } : { kind: 'modules', ids: this.selectedIds() };
  });

  /** Ids escolhidos, na ordem da trilha — e a ordem em que o resumo lista. */
  readonly selectedIds = computed(() =>
    this.catalogState()
      .filter(module => this.selectedState().has(module.id))
      .map(module => module.id),
  );

  readonly selectedModules = computed(() =>
    this.catalogState().filter(module => this.selectedState().has(module.id)),
  );

  /**
   * Total do carrinho. E conferencia visual: quem soma — e quem escolhe o lote
   * do pacote — de verdade e o servidor.
   */
  readonly totalCents = computed(() => {
    if (this.bundleState()) {
      return this.selectedBundle()?.tier?.priceCents ?? 0;
    }

    return this.selectedModules().reduce((total, module) => total + (module.priceCents ?? 0), 0);
  });

  readonly hasSelection = computed(() => this.bundleState() !== null || this.selectedState().size > 0);

  /** O que o aluno ja tem, para o AVA e a loja concordarem. */
  readonly unlockedIds = computed(() =>
    this.catalogState()
      .filter(module => module.access.unlocked)
      .map(module => module.id),
  );

  loadCatalog(): Observable<StoreModuleItem[]> {
    this.loadingState.set(true);
    this.errorState.set(null);

    return this.http.get<StoreModuleItem[]>(`${environment.apiUrl}/store/catalog`).pipe(
      tap(catalog => {
        this.catalogState.set(catalog);
        // Selecao de modulo que deixou de ser vendavel (comprado em outra aba,
        // preco retirado) nao pode sobreviver a um recarregamento do catalogo.
        this.selectedState.update(
          current =>
            new Set(
              [...current].filter(id =>
                catalog.some(module => module.id === id && module.purchasable),
              ),
            ),
        );
      }),
      catchError((error: HttpErrorResponse) => {
        const message = this.toMessage(error);
        this.errorState.set(message);

        return throwError(() => message);
      }),
      finalize(() => this.loadingState.set(false)),
    );
  }

  /**
   * Vitrine publica: modulos avulsos e pacote com o lote vigente (Spec 019,
   * decisao 10). Sem sessao — o `/planos` usa a mesma chamada que a loja.
   */
  loadOffer(): Observable<StoreOffer> {
    return this.http.get<StoreOffer>(`${environment.apiUrl}/store/offer`).pipe(
      tap(offer => this.offerState.set(offer)),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /** Chave publica e ambiente. Carregado uma vez por sessao. */
  loadPaymentConfig(): Observable<PaymentConfig> {
    const current = this.configState();

    if (current) {
      return new Observable<PaymentConfig>(subscriber => {
        subscriber.next(current);
        subscriber.complete();
      });
    }

    return this.http.get<PaymentConfig>(`${environment.apiUrl}/store/payment-config`).pipe(
      tap(config => this.configState.set(config)),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /** Marca ou desmarca um modulo avulso. Marcar desfaz a escolha do pacote. */
  toggle(moduleId: string): void {
    this.bundleState.set(null);
    this.selectedState.update(current => {
      const next = new Set(current);

      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);

      return next;
    });
  }

  isSelected(moduleId: string): boolean {
    return this.selectedState().has(moduleId);
  }

  /** Pre-seleciona um modulo — o caminho de "comprar" vindo da trilha trancada. */
  select(moduleId: string): void {
    this.bundleState.set(null);
    this.selectedState.update(current => new Set(current).add(moduleId));
  }

  /** Escolhe o pacote e desmarca os avulsos: o pedido e um ou outro. */
  selectBundle(slug: string): void {
    this.selectedState.set(new Set());
    this.bundleState.set(slug);
  }

  /** Marca ou desmarca o pacote. */
  toggleBundle(slug: string): void {
    if (this.bundleState() === slug) {
      this.bundleState.set(null);
    } else {
      this.selectBundle(slug);
    }
  }

  isBundleSelected(slug: string): boolean {
    return this.bundleState() === slug;
  }

  clearSelection(): void {
    this.selectedState.set(new Set());
    this.bundleState.set(null);
  }

  /** Cria o pedido e cobra. O valor nao vai no corpo (decisao 2). */
  createOrder(payload: CreateOrderPayload): Observable<OrderView> {
    return this.http.post<OrderView>(`${environment.apiUrl}/orders`, payload).pipe(
      tap(order => this.orderState.set(order)),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /**
   * Estado do pedido. E esta chamada que fecha o PIX: o servidor reconsulta o
   * gateway enquanto o pedido estiver pendente (decisao 14).
   */
  loadOrder(orderId: string): Observable<OrderView> {
    return this.http.get<OrderView>(`${environment.apiUrl}/orders/${orderId}`).pipe(
      tap(order => this.orderState.set(order)),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /** Historico de compras do aluno. */
  listOrders(): Observable<OrderView[]> {
    return this.http
      .get<OrderView[]>(`${environment.apiUrl}/orders/me`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Traduz a falha HTTP em algo que o comprador possa ler e agir. */
  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
    }

    const detail = (error.error as { message?: string | string[] })?.message;

    if (Array.isArray(detail) && detail.length) {
      return detail[0];
    }

    if (typeof detail === 'string' && detail) {
      return detail;
    }

    return 'Não foi possível concluir a operação. Tente de novo em instantes.';
  }
}
