import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Modulo na vitrine, como `GET /store/catalog` o devolve. */
export interface StoreModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  lessonCount: number;
  /**
   * Nulo = "a definir": o modulo aparece como "em breve" (Spec 014, decisao 1).
   * Em campanha, ja com o desconto (Spec 032, decisao 4).
   */
  priceCents: number | null;
  /** Preco cheio, o riscado em campanha; igual a `priceCents` fora dela. */
  listPriceCents: number | null;
  purchasable: boolean;
  access: { unlocked: boolean; expiresAt: string | null };
}

/** Modulo na vitrine publica: so o que a pagina exibe (Spec 019). */
export interface OfferModule {
  order: number;
  title: string;
  /** Com o desconto da campanha, quando houver (Spec 032, decisao 4). */
  priceCents: number | null;
  /** Preco cheio; igual a `priceCents` fora de campanha. */
  listPriceCents: number | null;
}

/** Lote vigente, com as vagas que sobram. `remaining` nulo = sem limite. */
export interface OfferTier {
  id: string;
  order: number;
  name: string;
  /** Com o desconto da campanha, quando houver (Spec 032, decisao 4). */
  priceCents: number;
  /** Preco cheio do lote; igual a `priceCents` fora de campanha. */
  listPriceCents: number;
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
  /** Campanha no ar, ou nula (Spec 032). */
  promotion: PublicPromotion | null;
}

/**
 * Campanha como a vitrine a anuncia (Spec 032, decisao 7). `serverNow` e o
 * relogio do servidor no instante da resposta: a contagem regressiva usa a
 * diferenca entre os dois, e nao o relogio do aparelho, que pode estar errado.
 */
export interface PublicPromotion {
  name: string;
  percentOff: number;
  endsAt: string;
  serverNow: string;
}

/** Campanha de um pedido, para o valor cheio riscado (Spec 032, decisao 12). */
export interface OrderPromotion {
  name: string;
  percentOff: number;
  listAmountCents: number;
}

/**
 * O que o aluno escolheu comprar: **ou** o pacote **ou** modulos avulsos, e
 * nunca os dois — o pedido e um ou outro (Spec 019, decisoes 5 e 12).
 */
export type StoreSelection =
  | { kind: 'modules'; ids: string[] }
  | { kind: 'bundle'; slug: string }
  /** Modulo de teste pelo link secreto (Spec 030). */
  | { kind: 'test'; key: string };

/** O modulo de teste, como a pagina do link secreto o recebe (Spec 030). */
export interface TestProduct {
  title: string;
  summary: string;
  priceCents: number;
}

/** Chave publica e ambiente, vindos da API e nao do build (decisao 16). */
export interface PaymentConfig {
  publicKey: string | null;
  sandbox: boolean;
  enabled: boolean;
  /**
   * Por que a loja esta fechada (Spec 020, decisao 7): sem credencial da
   * aplicacao, ou sem conta recebedora conectada. Nulo com a loja aberta.
   */
  reason: 'not_configured' | 'seller_not_connected' | null;
  maxInstallments: number;
}

/** `FAILED`: a cobranca nao chegou a desfecho por erro (Spec 028, decisao 5). */
export type OrderStatus = 'PENDING' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED' | 'FAILED';
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
  /** Pedido do modulo de teste (Spec 030): nenhum modulo liberado. */
  testPayment?: boolean;
  /** Campanha do pedido (Spec 032, decisao 12); nula fora dela. */
  promotion?: OrderPromotion | null;
}

/** Dados do comprador. Nenhum campo de cartao aqui (decisao 8). */
export interface OrderPayer {
  firstName: string;
  lastName: string;
  email: string;
  /** CPF so com digitos. */
  document: string;
  /** Destinatario da NF-e (Spec 023, decisao A3). */
  address: OrderAddress;
}

/** Endereco do comprador, com o que o ViaCEP preencheu. */
export interface OrderAddress {
  /** So digitos. */
  zip: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  cityIbge: string;
  state: string;
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
  /** Clique em pagar; liga o pedido aos logs do navegador (Spec 028, decisao 9). */
  attemptId?: string;
  /** Chave do link secreto do modulo de teste (Spec 030). */
  testKey?: string;
  /** Falha do navegador no lugar do `card`: o pedido nasce `FAILED`. */
  clientError?: { stage: ClientErrorStage; message: string };
  /**
   * Total que a tela mostrou (Spec 032, decisao 6). So serve para a API
   * recusar com 409 se o preco mudou; quem define o valor e o servidor.
   */
  expectedAmountCents?: number;
}

/**
 * O preco mudou entre a tela e o clique (Spec 032, decisao 6): a campanha
 * acabou ou comecou. Nada foi cobrado, e `amountCents` e o valor novo.
 */
export class PriceChangedError {
  constructor(
    readonly message: string,
    readonly amountCents: number,
  ) {}
}

/** Etapas do navegador no caminho do cartao, como os logs as nomeiam. */
export type ClientLogStage = 'sdk_load' | 'secure_fields' | 'payment_method' | 'installments' | 'tokenize';

/** As que impedem a cobranca e viram pedido `FAILED`. */
export type ClientErrorStage = 'sdk_load' | 'secure_fields' | 'tokenize';

/** Evento do navegador para os logs de pagamento (Spec 028, decisao 9). */
export interface ClientLogEntry {
  attemptId?: string;
  stage: ClientLogStage;
  level: 'ERROR' | 'WARNING';
  message: string;
  detail?: Record<string, unknown>;
}

/** Folga depois do fim da campanha antes de reler a oferta (decisao 7). */
export const PROMOTION_REFRESH_SLACK_MS = 1000;

/** Teto do `setTimeout` (~24,8 dias): campanha mais longa nao agenda a releitura. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Estados em que nao ha mais o que esperar do gateway. */
const TERMINAL: OrderStatus[] = ['PAID', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'FAILED'];

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
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Releitura agendada para o fim da campanha (Spec 032, decisao 7). */
  private promotionTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Relogio do servidor menos o do aparelho, da ultima oferta lida (Spec 032,
   * decisao 7). A contagem regressiva soma isto ao `Date.now()`: o relogio do
   * aparelho pode estar errado, o do servidor e o que decide o preco.
   */
  private readonly clockOffsetState = signal(0);
  readonly clockOffsetMs = this.clockOffsetState.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearPromotionTimer());
  }

  private readonly catalogState = signal<StoreModuleItem[]>([]);
  private readonly selectedState = signal<Set<string>>(new Set());
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly configState = signal<PaymentConfig | null>(null);
  private readonly orderState = signal<OrderView | null>(null);
  private readonly offerState = signal<StoreOffer | null>(null);
  /** Slug do pacote escolhido. Exclusivo com `selectedState` (Spec 019). */
  private readonly bundleState = signal<string | null>(null);
  /** Modulo de teste escolhido pelo link secreto (Spec 030). Exclusivo com os outros. */
  private readonly testState = signal<{ key: string; product: TestProduct } | null>(null);

  /** O modulo de teste escolhido, com a chave do link. */
  readonly selectedTest = this.testState.asReadonly();

  readonly catalog = this.catalogState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly config = this.configState.asReadonly();
  readonly order = this.orderState.asReadonly();
  readonly offer = this.offerState.asReadonly();

  /** Campanha no ar segundo a ultima oferta lida (Spec 032), ou nula. */
  readonly promotion = computed(() => this.offerState()?.promotion ?? null);

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
    const test = this.testState();

    if (test) {
      return { kind: 'test', key: test.key };
    }

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
    const test = this.testState();

    if (test) {
      return test.product.priceCents;
    }

    if (this.bundleState()) {
      return this.selectedBundle()?.tier?.priceCents ?? 0;
    }

    return this.selectedModules().reduce((total, module) => total + (module.priceCents ?? 0), 0);
  });

  /**
   * Total cheio do carrinho, o riscado do resumo em campanha (Spec 032,
   * decisao 8). Igual ao `totalCents` fora dela.
   */
  readonly listTotalCents = computed(() => {
    const test = this.testState();

    if (test) {
      return test.product.priceCents;
    }

    if (this.bundleState()) {
      return this.selectedBundle()?.tier?.listPriceCents ?? 0;
    }

    return this.selectedModules().reduce((total, module) => total + (module.listPriceCents ?? 0), 0);
  });

  readonly hasSelection = computed(
    () => this.testState() !== null || this.bundleState() !== null || this.selectedState().size > 0,
  );

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
  loadOffer(options: { fresh?: boolean } = {}): Observable<StoreOffer> {
    // `fresh` passa pelo cache de 30 s da oferta (navegador e CDN): no fim da
    // campanha e depois de um 409 de preco, a tela precisa do preco de agora.
    const params = options.fresh ? { params: { t: Date.now() } } : {};

    return this.http.get<StoreOffer>(`${environment.apiUrl}/store/offer`, params).pipe(
      tap(offer => {
        this.offerState.set(offer);
        this.schedulePromotionEnd(offer.promotion);
      }),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /**
   * No fim da campanha, rele a oferta sem cache — e o catalogo, se a loja o
   * carregou —, para o preco voltar ao normal sem recarregar a pagina (Spec
   * 032, decisao 7). Quem decide que acabou e o servidor: a releitura traz a
   * oferta de agora, com ou sem campanha.
   *
   * O prazo e `endsAt - serverNow`, os dois do servidor: nao depende do relogio
   * do aparelho. So no navegador; no SSR nao ha o que agendar.
   */
  private schedulePromotionEnd(promotion: PublicPromotion | null): void {
    this.clearPromotionTimer();

    if (!promotion) {
      return;
    }

    const serverNow = Date.parse(promotion.serverNow);

    this.clockOffsetState.set(serverNow - Date.now());

    const delay = Date.parse(promotion.endsAt) - serverNow + PROMOTION_REFRESH_SLACK_MS;

    if (!this.browser || delay > MAX_TIMEOUT_MS) {
      return;
    }

    this.promotionTimer = setTimeout(
      () => {
        this.promotionTimer = null;
        this.loadOffer({ fresh: true }).subscribe({ error: () => undefined });

        if (this.catalogState().length > 0) {
          this.loadCatalog().subscribe({ error: () => undefined });
        }
      },
      Math.max(delay, 0),
    );
  }

  private clearPromotionTimer(): void {
    if (this.promotionTimer !== null) {
      clearTimeout(this.promotionTimer);
      this.promotionTimer = null;
    }
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
    this.testState.set(null);
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
    this.testState.set(null);
    this.bundleState.set(null);
    this.selectedState.update(current => new Set(current).add(moduleId));
  }

  /** Escolhe o pacote e desmarca os avulsos: o pedido e um ou outro. */
  selectBundle(slug: string): void {
    this.testState.set(null);
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

  /**
   * Escolhe o modulo de teste pelo link secreto (Spec 030) e desfaz o resto:
   * o pedido de teste e comprado sozinho.
   */
  selectTest(key: string, product: TestProduct): void {
    this.selectedState.set(new Set());
    this.bundleState.set(null);
    this.testState.set({ key, product });
  }

  /** O modulo de teste pela chave do link. So admin; o resto responde 404. */
  loadTestProduct(key: string): Observable<TestProduct> {
    return this.http
      .get<TestProduct>(`${environment.apiUrl}/store/test-product/${encodeURIComponent(key)}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => error.status)));
  }

  /** Alvo do pedido como a API o recebe: o pacote, os ids dos modulos ou a chave do teste. */
  orderTarget(): Pick<CreateOrderPayload, 'moduleIds' | 'bundleSlug' | 'testKey'> {
    const selection = this.selection();

    if (selection.kind === 'test') {
      return { testKey: selection.key };
    }

    return selection.kind === 'bundle' ? { bundleSlug: selection.slug } : { moduleIds: selection.ids };
  }

  isBundleSelected(slug: string): boolean {
    return this.bundleState() === slug;
  }

  clearSelection(): void {
    this.selectedState.set(new Set());
    this.bundleState.set(null);
    this.testState.set(null);
  }

  /** Cria o pedido e cobra. O valor nao vai no corpo (decisao 2). */
  createOrder(payload: CreateOrderPayload): Observable<OrderView> {
    return this.http.post<OrderView>(`${environment.apiUrl}/orders`, payload).pipe(
      tap(order => this.orderState.set(order)),
      catchError((error: HttpErrorResponse) => {
        const body = error.error as { code?: string; amountCents?: number } | null;

        // Spec 032, decisao 6: o preco mudou; a tela recarrega e mostra o novo.
        if (error.status === 409 && body?.code === 'PRICE_CHANGED' && typeof body.amountCents === 'number') {
          return throwError(() => new PriceChangedError(this.toMessage(error), body.amountCents as number));
        }

        return throwError(() => this.toMessage(error));
      }),
    );
  }

  /**
   * Manda um erro do navegador para os logs de pagamento (Spec 028, decisao
   * 9). Nunca falha para quem chama: o log nao pode atrapalhar o pagamento,
   * e o comprador nao precisa saber dele.
   */
  clientLog(entry: ClientLogEntry): void {
    this.http
      .post<void>(`${environment.apiUrl}/payments/client-logs`, entry)
      .subscribe({ error: () => undefined });
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
