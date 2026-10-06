import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mercadoPagoWebhookSecret, statementDescriptor } from '../config/payments.config';
import { PaymentMethodKind } from '../generated/prisma/client';
import {
  CreateOrderPayload,
  DEVICE_ID_HEADER,
  IDEMPOTENCY_HEADER,
  MERCADO_PAGO_API,
  MercadoPagoOrder,
  OrderItemPayload,
  PIX_EXPIRATION,
} from './payments.types';

/** Janela aceita entre o timestamp assinado e o relogio desta API. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** Limite da Orders API: acima disso ela responde `maximum_items`. */
const MAX_ORDER_ITEMS = 10;

/** Pagador, no vocabulario desta plataforma. */
export interface OrderPayer {
  email: string;
  firstName: string;
  lastName: string;
  /** CPF, so digitos. */
  document: string;
}

/** Modulo comprado, do jeito que o pedido o conhece. */
export interface OrderModuleItem {
  moduleId: string;
  title: string;
  priceCents: number;
}

export interface CreateOrderInput {
  /** Id do **nosso** pedido: vira `external_reference` e chave de idempotencia. */
  orderId: string;
  /**
   * Token OAuth da conta vendedora (Spec 020, decisao 6): e ele que faz a order
   * nascer na conta de quem recebe. Quem escolhe e o `OrdersService`.
   */
  accessToken: string;
  amountCents: number;
  method: PaymentMethodKind;
  payer: OrderPayer;
  items: OrderModuleItem[];
  /**
   * Pacote comprado (Spec 019). Vai ao gateway como **um** item: e o que foi
   * vendido, e a Orders API recusa mais de 10 itens por order.
   */
  bundle?: { id: string; title: string };
  card?: { token: string; paymentMethodId: string; installments: number };
  /** `MP_DEVICE_SESSION_ID` capturado pelo SDK no navegador. */
  deviceId?: string | null;
}

export interface WebhookSignatureInput {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
}

/** Resposta da Orders API, no que esta API consome. */
interface OrderResponse {
  id: string;
  status: string;
  status_detail?: string;
  transactions?: {
    payments?: {
      id?: string;
      payment_method?: {
        qr_code?: string;
        qr_code_base64?: string;
        ticket_url?: string;
      };
    }[];
  };
}

/**
 * Centavos para o decimal em string que a Orders API espera. **Unico** ponto de
 * conversao da plataforma (decisao 3): dinheiro anda em inteiro em todo o resto
 * do caminho, porque ponto flutuante em valor monetario erra por centavos que
 * ninguem persegue depois.
 */
function toAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Gateway de pagamento (Spec 014, decisao 7).
 *
 * Isolar a rede aqui e o que permite `OrdersService`, `AccessService` e as
 * suites de conteudo rodarem sem tocar no Mercado Pago — mesmo papel que o
 * `MuxService` cumpre para o video (Spec 010, decisao 16). E e o que mantem a
 * migracao para uma API futura confinada a um arquivo.
 *
 * Nenhuma credencial daqui e alcancavel a partir do `front/`: elas vivem no
 * `ConfigService` do backend (decisao 16).
 *
 * Desde a Spec 020 o access token e argumento, e nao leitura do
 * `ConfigService`: a order nasce na conta do vendedor, com o token OAuth dele,
 * e a consulta usa o token da conta em que ela nasceu. Nenhuma `marketplace_fee`
 * e enviada — a plataforma nao retem comissao (decisao 2).
 */
@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Cria e processa a order em uma chamada (`processing_mode: automatic`).
   *
   * No PIX a resposta ja traz o QR; no cartao ela ja traz o desfecho. Os dois
   * casos saem daqui no mesmo formato, para o `OrdersService` nao precisar
   * saber com qual meio esta lidando.
   */
  async createOrder(input: CreateOrderInput): Promise<MercadoPagoOrder> {
    const payload = this.buildPayload(input);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
      // Obrigatorio na Orders API: e o que impede a retentativa de rede de
      // virar uma segunda cobranca (decisao 13).
      [IDEMPOTENCY_HEADER]: input.orderId,
    };

    // Ausente quando o navegador nao capturou — e inventar um valor aqui seria
    // pior do que omitir: o antifraude passaria a confiar em ruido.
    if (input.deviceId) {
      headers[DEVICE_ID_HEADER] = input.deviceId;
    }

    const response = await this.request('/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    return this.toOrder(response);
  }

  /**
   * Estado atual da order. E daqui que sai a verdade do pedido, tanto para o
   * webhook quanto para a reconsulta do polling (decisoes 12 e 14) — o corpo da
   * notificacao so diz **qual** id consultar.
   */
  async getOrder(mpOrderId: string, accessToken: string): Promise<MercadoPagoOrder> {
    const response = await this.request(`/orders/${encodeURIComponent(mpOrderId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return this.toOrder(response);
  }

  /**
   * Valida a assinatura da notificacao (decisao 12).
   *
   * O manifesto assinado amarra os tres dados — id da order, id da requisicao e
   * timestamp —, e e o que impede reaproveitar uma assinatura legitima para
   * dizer que **outra** order foi paga.
   */
  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    const parts = this.parseSignature(input.signature);

    if (!parts || !input.dataId || !input.requestId) {
      return false;
    }

    // A documentacao fala em milissegundos e os exemplos dela vem em segundos:
    // aceita os dois, e a janela continua sendo a mesma.
    const ts = Number(parts.ts);
    const signedAt = ts > 1e12 ? ts / 1000 : ts;
    const age = Math.abs(Date.now() / 1000 - signedAt);

    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) {
      return false;
    }

    // O Mercado Pago assina o id em minusculas: `ORD01JQ...` entra no
    // manifesto como `ord01jq...`. Sem isso, toda notificacao de order cai.
    const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${parts.ts};`;
    const expected = createHmac('sha256', mercadoPagoWebhookSecret(this.config))
      .update(manifest)
      .digest('hex');

    return this.equals(expected, parts.v1);
  }

  private buildPayload(input: CreateOrderInput): CreateOrderPayload {
    const isPix = input.method === 'PIX';
    const description =
      input.items.length === 1
        ? input.items[0].title
        : `${input.items.length} módulos da Imersão RH Estratégico`;

    return {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: input.orderId,
      total_amount: toAmount(input.amountCents),
      description,
      payer: {
        email: input.payer.email,
        first_name: input.payer.firstName,
        last_name: input.payer.lastName,
        identification: { type: 'CPF', number: input.payer.document },
      },
      items: this.toItems(input),
      transactions: {
        payments: [
          {
            amount: toAmount(input.amountCents),
            payment_method: isPix
              ? { id: 'pix', type: 'bank_transfer' }
              : {
                  id: input.card?.paymentMethodId ?? '',
                  type: 'credit_card',
                  token: input.card?.token ?? '',
                  installments: input.card?.installments ?? 1,
                  statement_descriptor: statementDescriptor(this.config),
                },
            // So o PIX espera pagamento; cartao processa na hora e nao pode
            // herdar validade.
            ...(isPix ? { expiration_time: PIX_EXPIRATION } : {}),
          },
        ],
      },
    };
  }

  /**
   * Um item por modulo, para o antifraude e a conciliacao, ate o limite de 10
   * da Orders API (`maximum_items`). O pacote vai sempre como um item so, e a
   * compra avulsa acima do limite e consolidada: o valor e o do pedido, para a
   * soma bater com o `total_amount`. O detalhe por modulo continua nos
   * `order_items` do nosso banco.
   */
  private toItems(input: CreateOrderInput): OrderItemPayload[] {
    const count = input.items.length;

    if (input.bundle) {
      return [
        {
          title: input.bundle.title,
          description: `Acesso de 6 meses aos ${count} módulos do ${input.bundle.title}`,
          quantity: 1,
          unit_price: toAmount(input.amountCents),
          external_code: input.bundle.id,
        },
      ];
    }

    if (count > MAX_ORDER_ITEMS) {
      const titles = input.items.map((item) => item.title).join(', ');

      return [
        {
          title: `${count} módulos da Imersão RH Estratégico`,
          description: `Acesso de 6 meses a ${count} módulos da Imersão RH Estratégico: ${titles}`.slice(0, 600),
          quantity: 1,
          unit_price: toAmount(input.amountCents),
          external_code: input.orderId,
        },
      ];
    }

    return input.items.map((item) => this.toItem(item));
  }

  private toItem(item: OrderModuleItem): OrderItemPayload {
    return {
      title: item.title,
      // O antifraude le a descricao (checklist, item 5), e o comprador a ve no
      // extrato: ela precisa dizer o que foi comprado, e nao repetir o titulo.
      description: `Acesso de 6 meses ao módulo "${item.title}" da Imersão RH Estratégico`,
      quantity: 1,
      unit_price: toAmount(item.priceCents),
      external_code: item.moduleId,
    };
  }

  private toOrder(response: OrderResponse): MercadoPagoOrder {
    const payment = response.transactions?.payments?.[0];
    const method = payment?.payment_method;

    return {
      id: response.id,
      status: response.status,
      statusDetail: response.status_detail ?? null,
      paymentId: payment?.id ?? null,
      pix: method?.qr_code
        ? {
            qrCode: method.qr_code,
            qrCodeBase64: method.qr_code_base64 ?? '',
            ticketUrl: method.ticket_url ?? null,
          }
        : null,
    };
  }

  private parseSignature(signature: string | undefined): { ts: string; v1: string } | null {
    if (!signature) {
      return null;
    }

    const parts = Object.fromEntries(
      signature
        .split(',')
        .map((part) => part.split('=').map((piece) => piece.trim()))
        .filter((pair): pair is [string, string] => pair.length === 2),
    );

    return parts.ts && parts.v1 ? { ts: parts.ts, v1: parts.v1 } : null;
  }

  /** Comparacao em tempo constante; tamanhos diferentes ja sao divergencia. */
  private equals(expected: string, received: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');

    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async request(path: string, init: RequestInit): Promise<OrderResponse> {
    const response = await fetch(`${MERCADO_PAGO_API}${path}`, init);

    if (!response.ok) {
      const detail = await response.text();

      // O corpo da falha entra no log porque a Orders API devolve a lista
      // inteira de erros de validacao — e e ela que diz qual campo recusou.
      // Nenhum dado de cartao passa por aqui: o que sobe e o token (decisao 8).
      this.logger.error(`Mercado Pago respondeu ${response.status} em ${path}: ${detail}`);

      throw new ServiceUnavailableException(
        'Não foi possível falar com o provedor de pagamento. Tente de novo em instantes.',
      );
    }

    return (await response.json()) as OrderResponse;
  }
}
