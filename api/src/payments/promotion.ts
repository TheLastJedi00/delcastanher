import { ConflictException } from '@nestjs/common';

/** Teto da porcentagem de desconto (Spec 032, decisao 1). */
export const MAX_PERCENT_OFF = 90;

/** Periodo da campanha, como as regras desta spec o leem. */
export interface PromotionPeriod {
  startsAt: Date;
  endsAt: Date;
  /** Preenchido quando o admin encerra antes da hora. */
  endedEarlyAt: Date | null;
}

/**
 * Preco com o desconto da campanha (Spec 032, decisao 4).
 *
 * E o **unico** lugar que faz essa conta: oferta, pedido e previa do painel
 * passam por aqui, e o front so exibe o resultado. Conta inteira em centavos,
 * arredondada para o centavo mais proximo. Sem campanha (nula ou zero), o
 * preco volta igual.
 */
export function applyDiscount(priceCents: number, percentOff: number | null): number {
  if (percentOff === null || percentOff === 0) {
    return priceCents;
  }

  if (!Number.isInteger(percentOff) || percentOff < 0 || percentOff > MAX_PERCENT_OFF) {
    throw new RangeError(`Porcentagem de desconto inválida: ${percentOff}.`);
  }

  return Math.round((priceCents * (100 - percentOff)) / 100);
}

/** Fim de fato: o marcado, ou o encerramento antecipado quando houver. */
export function effectiveEnd(period: PromotionPeriod): Date {
  return period.endedEarlyAt && period.endedEarlyAt < period.endsAt ? period.endedEarlyAt : period.endsAt;
}

/**
 * A campanha vale agora? Intervalo meio-aberto `[inicio, fim)` (decisao 1):
 * no instante exato do fim ela ja acabou, e duas campanhas encostadas nunca
 * valem ao mesmo tempo.
 */
export function isRunning(period: PromotionPeriod, now: Date): boolean {
  return period.startsAt <= now && now < effectiveEnd(period);
}

/**
 * Recusa o pedido cujo valor nao e o que a tela mostrou (decisao 6): a
 * campanha acabou, ou comecou, entre a tela de pagamento e o clique. O
 * servidor continua dono do preco — o valor esperado so serve para recusar,
 * nunca para definir. Ausente (front anterior a esta spec), nao confere.
 *
 * O 409 leva `code` e o valor novo, para a tela distinguir este caso dos
 * outros 409 do pedido e mostrar o preco certo sem outra consulta.
 */
export function assertExpectedAmount(expectedAmountCents: number | undefined, amountCents: number): void {
  if (expectedAmountCents === undefined || expectedAmountCents === amountCents) {
    return;
  }

  throw new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'PRICE_CHANGED',
    message: 'O preço mudou. Confira o novo valor antes de pagar.',
    amountCents,
  });
}

/** O que o pedido precisa saber da campanha vigente. */
export interface AppliedPromotion {
  id: string;
  name: string;
  percentOff: number;
}

/** Colunas da campanha no pedido (decisao 5). */
export interface OrderPromotionColumns {
  promotionId: string | null;
  promotionNameSnapshot: string | null;
  discountPercentSnapshot: number | null;
  listAmountCents: number | null;
}

/**
 * As colunas da campanha para gravar no pedido: preenchidas em campanha,
 * nulas fora dela — inclusive o `listAmountCents`, para "nulo" significar
 * sempre "sem desconto", e nunca "desconto de zero".
 */
export function orderPromotionColumns(
  promotion: AppliedPromotion | null,
  listAmountCents: number,
): OrderPromotionColumns {
  return promotion
    ? {
        promotionId: promotion.id,
        promotionNameSnapshot: promotion.name,
        discountPercentSnapshot: promotion.percentOff,
        listAmountCents,
      }
    : { promotionId: null, promotionNameSnapshot: null, discountPercentSnapshot: null, listAmountCents: null };
}

/** A campanha de um pedido, como recibo, e-mail e financeiro a mostram. */
export interface OrderPromotionView {
  name: string;
  percentOff: number;
  listAmountCents: number;
}

/** Le os snapshots da campanha do pedido; nulo fora de campanha (decisao 12). */
export function orderPromotionView(row: {
  promotionNameSnapshot?: string | null;
  discountPercentSnapshot?: number | null;
  listAmountCents?: number | null;
}): OrderPromotionView | null {
  return row.promotionNameSnapshot && row.discountPercentSnapshot != null && row.listAmountCents != null
    ? { name: row.promotionNameSnapshot, percentOff: row.discountPercentSnapshot, listAmountCents: row.listAmountCents }
    : null;
}

/** Os dois periodos se cruzam? Encostados nao cruzam (decisao 2). */
export function overlaps(a: PromotionPeriod, b: PromotionPeriod): boolean {
  return a.startsAt < effectiveEnd(b) && b.startsAt < effectiveEnd(a);
}
