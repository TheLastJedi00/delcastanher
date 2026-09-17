import { OrderStatus } from '../generated/prisma/client';

/**
 * Contratos da Orders API do Mercado Pago (Spec 014, decisao 7).
 *
 * Os nomes de campo daqui foram conferidos na Referencia de API de criacao de
 * order (task 3.0), e **nao** sao os mesmos da API de Pagamentos (`/v1/payments`),
 * que a maior parte dos exemplos da internet usa. As tres diferencas que mais
 * custam tempo:
 *
 * 1. `statement_descriptor` vive dentro de `transactions.payments[].payment_method`,
 *    e nao na raiz.
 * 2. `expiration_time` (duracao ISO 8601, ex. `PT30M`) vive em
 *    `transactions.payments[]`, e nao como `date_of_expiration` na raiz.
 * 3. O **device id** nao e campo de corpo: e o header `X-meli-session-id`
 *    (ver `DEVICE_ID_HEADER`).
 *
 * E uma ausencia que vale registro: a Orders API **nao expoe `issuer_id`** no
 * corpo, embora o checklist de qualidade do Mercado Pago o cobre — aquele
 * checklist foi escrito para a API de Pagamentos. Na Orders API o emissor vem
 * junto do `token` gerado pelo SDK no navegador, que ja o resolveu a partir do
 * BIN do cartao. Mandar um `issuer_id` inventado seria pior do que nao mandar.
 */

/** Header do device id, exigido pelo antifraude (checklist, item 10). */
export const DEVICE_ID_HEADER = 'X-meli-session-id';

/** Header de idempotencia, obrigatorio na criacao de order. */
export const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';

/** Base da API. Nao varia entre sandbox e producao: quem varia e a credencial. */
export const MERCADO_PAGO_API = 'https://api.mercadopago.com/v1';

/**
 * Validade do PIX (decisao 10). 30 minutos e o **minimo** que o Mercado Pago
 * aceita; o padrao dele seria 24 horas, que deixaria a loja cheia de pendencia
 * eterna e permitiria pagar hoje um QR de ontem.
 */
export const PIX_EXPIRATION = 'PT30M';

/** Item da order — alimenta o antifraude e o extrato do comprador. */
export interface OrderItemPayload {
  title: string;
  description: string;
  quantity: number;
  /** Decimal em string, como toda quantia da Orders API. */
  unit_price: string;
  /** Nosso id do modulo, para conciliar linha a linha. */
  external_code: string;
}

/** Pagador. Quanto mais completo, melhor a taxa de aprovacao (checklist). */
export interface OrderPayerPayload {
  email: string;
  first_name: string;
  last_name: string;
  identification: { type: 'CPF'; number: string };
}

/** Meio de pagamento dentro da transacao. */
export interface OrderPaymentMethodPayload {
  /** `pix`, ou a bandeira resolvida pelo SDK (`master`, `visa`...). */
  id: string;
  type: 'bank_transfer' | 'credit_card';
  /** Token do cartao gerado no navegador. Ausente no PIX. */
  token?: string;
  /** 1..6 (decisao 9). Ausente no PIX. */
  installments?: number;
  /** O que aparece na fatura do cartao. */
  statement_descriptor?: string;
}

export interface OrderTransactionPayload {
  amount: string;
  payment_method: OrderPaymentMethodPayload;
  /** Duracao ISO 8601; so no PIX. */
  expiration_time?: string;
}

/** Corpo de `POST /v1/orders` em modo automatico. */
export interface CreateOrderPayload {
  type: 'online';
  processing_mode: 'automatic';
  /** Id do **nosso** pedido: e o que liga a order a este banco. */
  external_reference: string;
  total_amount: string;
  description: string;
  payer: OrderPayerPayload;
  items: OrderItemPayload[];
  transactions: { payments: OrderTransactionPayload[] };
}

/** Dados do PIX que a tela precisa para cobrar. */
export interface PixDetails {
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string | null;
}

/**
 * Order do Mercado Pago reduzida ao que esta API guarda e exibe.
 *
 * `status` e `statusDetail` vao crus para o banco: quando o desfecho nao fizer
 * sentido, quem responde e o que o gateway disse, e nao a nossa leitura dele.
 */
export interface MercadoPagoOrder {
  id: string;
  status: string;
  statusDetail: string | null;
  paymentId: string | null;
  pix: PixDetails | null;
}

/**
 * Traducao do status da order para o estado do pedido (decisao 7).
 *
 * Status que nao esta aqui vira `PENDING`, e nunca `PAID`: um estado novo ou
 * desconhecido nao pode liberar conteudo por omissao.
 */
export const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  created: 'PENDING',
  processing: 'PENDING',
  action_required: 'PENDING',
  processed: 'PAID',
  failed: 'REJECTED',
  canceled: 'CANCELLED',
  expired: 'EXPIRED',
  refunded: 'REFUNDED',
  charged_back: 'REFUNDED',
};

export function toOrderStatus(mpStatus: string | null | undefined): OrderStatus {
  return ORDER_STATUS_MAP[mpStatus ?? ''] ?? 'PENDING';
}

/**
 * Mensagem ao comprador a partir do `status_detail` da recusa.
 *
 * Cinco recusas com cinco saidas diferentes: mandar "pagamento recusado" para
 * todas faria o comprador tentar de novo exatamente o que acabou de falhar.
 */
const REJECTION_MESSAGES: Record<string, string> = {
  bad_filled_card_data: 'Confira os dados do cartão: número, validade e código de segurança.',
  bad_filled_security_code: 'O código de segurança do cartão está incorreto.',
  bad_filled_date: 'A data de validade do cartão está incorreta.',
  insufficient_amount: 'O cartão não tem limite suficiente para este valor.',
  rejected_by_issuer:
    'O banco emissor recusou a cobrança. Fale com ele ou tente outro cartão.',
  required_call_for_authorize:
    'O banco emissor pede autorização para esta compra. Ligue para ele e tente de novo.',
  invalid_installments: 'O banco emissor não aceita esse número de parcelas para este valor.',
  card_disabled: 'O cartão está desabilitado. Fale com o banco emissor.',
  max_attempts_exceeded: 'Muitas tentativas com este cartão. Tente outro meio de pagamento.',
  high_risk:
    'Não foi possível concluir esta compra. Tente outro meio de pagamento ou fale com o suporte.',
  processing_error: 'Houve uma falha no processamento. Tente de novo em instantes.',
};

export function rejectionMessage(statusDetail: string | null | undefined): string {
  return (
    REJECTION_MESSAGES[statusDetail ?? ''] ??
    'O pagamento não foi aprovado. Tente outro cartão ou pague com PIX.'
  );
}
