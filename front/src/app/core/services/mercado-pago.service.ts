import { Injectable, inject, signal } from '@angular/core';
import { StoreService } from './store.service';

/** URL do SDK oficial. Ele tambem captura o device id (checklist, item 10). */
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

/** Opcao de parcelamento devolvida pelo Mercado Pago, ja formatada por ele. */
export interface InstallmentOption {
  installments: number;
  /** "3x de R$ 70,12 (R$ 210,36)", no texto do proprio gateway. */
  recommendedMessage: string;
  installmentAmount: number;
  totalAmount: number;
}

/** Token do cartao e o que o SDK resolveu junto com ele. */
export interface CardToken {
  token: string;
  paymentMethodId: string;
}

/** Superficie do SDK que este servico usa. */
interface MercadoPagoSdk {
  fields: {
    create(type: string, options: Record<string, unknown>): { mount(id: string): void };
    createCardToken(data: Record<string, unknown>): Promise<{ id: string }>;
  };
  getPaymentMethods(options: { bin: string }): Promise<{ results: { id: string }[] }>;
  getInstallments(options: {
    amount: string;
    bin: string;
    paymentTypeId: string;
  }): Promise<{ payer_costs: PayerCost[] }[]>;
}

interface PayerCost {
  installments: number;
  recommended_message: string;
  installment_amount: number;
  total_amount: number;
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale: string }) => MercadoPagoSdk;
    MP_DEVICE_SESSION_ID?: string;
  }
}

/**
 * MercadoPago.js v2 (Spec 014, decisoes 8 e 16).
 *
 * O script e carregado **sob demanda**, so na etapa de pagamento: script de
 * terceiro nao entra em toda visita, criterio que a Spec 009 (decisao 5) ja
 * firmou para o GTM. A chave publica vem de `GET /store/payment-config`, e nao
 * de variavel de build — assim sandbox e producao trocam com um deploy so.
 *
 * Os dados do cartao vivem dentro dos **Secure Fields**, iframes do proprio
 * Mercado Pago: numero, validade e CVV nunca existem como valor neste
 * aplicativo, nunca entram em signal e nunca sobem para a nossa API. O que sai
 * daqui e o token.
 */
@Injectable({ providedIn: 'root' })
export class MercadoPagoLoader {
  private readonly store = inject(StoreService);

  private sdk: MercadoPagoSdk | null = null;
  private loading: Promise<MercadoPagoSdk> | null = null;

  private readonly readyState = signal(false);

  readonly ready = this.readyState.asReadonly();

  /** Carrega o script e instancia o SDK. Idempotente por sessao. */
  load(): Promise<MercadoPagoSdk> {
    if (this.sdk) {
      return Promise.resolve(this.sdk);
    }

    this.loading ??= this.doLoad();

    return this.loading;
  }

  /**
   * Device id capturado pelo SDK (checklist, item 10).
   *
   * Pode vir vazio com bloqueador de script ativo, e isso e aceito: um
   * pagamento sem device id ainda e melhor do que um checkout que nao envia.
   */
  deviceId(): string | undefined {
    return window.MP_DEVICE_SESSION_ID;
  }

  /**
   * Opcoes de parcelamento **do Mercado Pago**, com o texto dele.
   *
   * A tela nao calcula juros por conta propria: o valor da parcela e o total
   * exibidos sao os que o gateway vai cobrar (decisao 9). O teto de 6 e da
   * plataforma, e o servidor recusa acima disso.
   */
  async installments(amountCents: number, bin: string, max: number): Promise<InstallmentOption[]> {
    const sdk = await this.load();

    const response = await sdk.getInstallments({
      amount: (amountCents / 100).toFixed(2),
      bin,
      paymentTypeId: 'credit_card',
    });

    const costs = response?.[0]?.payer_costs ?? [];

    return costs
      .filter(cost => cost.installments <= max)
      .map(cost => ({
        installments: cost.installments,
        recommendedMessage: cost.recommended_message,
        installmentAmount: cost.installment_amount,
        totalAmount: cost.total_amount,
      }));
  }

  private async doLoad(): Promise<MercadoPagoSdk> {
    const config = await new Promise<{ publicKey: string | null }>((resolve, reject) => {
      this.store.loadPaymentConfig().subscribe({ next: resolve, error: reject });
    });

    if (!config.publicKey) {
      throw new Error('Pagamento indisponível no momento.');
    }

    await this.injectScript();

    const factory = window.MercadoPago;

    if (!factory) {
      throw new Error('Não foi possível carregar o provedor de pagamento.');
    }

    this.sdk = new factory(config.publicKey, { locale: 'pt-BR' });
    this.readyState.set(true);

    return this.sdk;
  }

  private injectScript(): Promise<void> {
    if (window.MercadoPago) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);

      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar o SDK.')));

        return;
      }

      const script = document.createElement('script');

      script.src = SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar o SDK de pagamento.'));

      document.head.appendChild(script);
    });
  }
}
