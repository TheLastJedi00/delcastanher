import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  mercadoPagoAccessToken,
  mercadoPagoWebhookSecret,
  statementDescriptor,
} from '../config/payments.config';
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
  amountCents: number;
  method: PaymentMethodKind;
  payer: OrderPayer;
  items: OrderModuleItem[];
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
      Authorization: `Bearer ${mercadoPagoAccessToken(this.config)}`,
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
  async getOrder(mpOrderId: string): Promise<MercadoPagoOrder> {
    const response = await this.request(`/orders/${encodeURIComponent(mpOrderId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${mercadoPagoAccessToken(this.config)}` },
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

    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.ts));

    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) {
      return false;
    }

    const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${parts.ts};`;
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
      items: input.items.map((item) => this.toItem(item)),
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
