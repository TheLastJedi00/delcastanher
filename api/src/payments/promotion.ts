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

/** Os dois periodos se cruzam? Encostados nao cruzam (decisao 2). */
export function overlaps(a: PromotionPeriod, b: PromotionPeriod): boolean {
  return a.startsAt < effectiveEnd(b) && b.startsAt < effectiveEnd(a);
}
