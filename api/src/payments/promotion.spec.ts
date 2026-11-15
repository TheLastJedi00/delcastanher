import { applyDiscount, effectiveEnd, isRunning, overlaps } from './promotion';

const at = (iso: string) => new Date(iso);

/** Campanha de 27/11 00h00 a 01/12 00h00 (Brasilia), em UTC. */
const BLACK_FRIDAY = {
  startsAt: at('2026-11-27T03:00:00Z'),
  endsAt: at('2026-12-01T03:00:00Z'),
  endedEarlyAt: null,
};

/** Spec 032, decisao 4: o desconto e calculado num ponto so. */
describe('applyDiscount', () => {
  it('R$ 989,00 com 30% sai por R$ 692,30', () => {
    expect(applyDiscount(98900, 30)).toBe(69230);
  });

  it('arredonda para o centavo mais proximo', () => {
    // 24700 * 0,85 = 20995; 999 * 0,67 = 669,33 -> 669; 999 * 0,5 = 499,5 -> 500
    expect(applyDiscount(24700, 15)).toBe(20995);
    expect(applyDiscount(999, 33)).toBe(669);
    expect(applyDiscount(999, 50)).toBe(500);
  });

  it('aceita os extremos de 1% e 90%', () => {
    expect(applyDiscount(98900, 1)).toBe(97911);
    expect(applyDiscount(98900, 90)).toBe(9890);
  });

  it('sem campanha (porcentagem nula ou zero), o preco nao muda', () => {
    expect(applyDiscount(98900, null)).toBe(98900);
    expect(applyDiscount(98900, 0)).toBe(98900);
  });

  it('recusa porcentagem fora de 0 a 90 ou fracionada', () => {
    expect(() => applyDiscount(98900, 91)).toThrow();
    expect(() => applyDiscount(98900, -1)).toThrow();
    expect(() => applyDiscount(98900, 12.5)).toThrow();
  });
});

/** Decisao 1: a vigente e derivada do periodo, sem coluna "ativa". */
describe('isRunning', () => {
  it('antes do inicio, nao vale', () => {
    expect(isRunning(BLACK_FRIDAY, at('2026-11-27T02:59:59.999Z'))).toBe(false);
  });

  it('vale a partir do instante exato do inicio', () => {
    expect(isRunning(BLACK_FRIDAY, at('2026-11-27T03:00:00Z'))).toBe(true);
    expect(isRunning(BLACK_FRIDAY, at('2026-11-29T15:00:00Z'))).toBe(true);
  });

  it('no instante exato do fim, ja nao vale', () => {
    expect(isRunning(BLACK_FRIDAY, at('2026-12-01T02:59:59.999Z'))).toBe(true);
    expect(isRunning(BLACK_FRIDAY, at('2026-12-01T03:00:00Z'))).toBe(false);
  });

  it('encerrada antes da hora, deixa de valer no encerramento', () => {
    const ended = { ...BLACK_FRIDAY, endedEarlyAt: at('2026-11-28T12:00:00Z') };

    expect(isRunning(ended, at('2026-11-28T11:59:59Z'))).toBe(true);
    expect(isRunning(ended, at('2026-11-28T12:00:00Z'))).toBe(false);
  });
});

describe('effectiveEnd', () => {
  it('e o fim marcado, ou o encerramento antecipado quando ha', () => {
    expect(effectiveEnd(BLACK_FRIDAY)).toEqual(BLACK_FRIDAY.endsAt);
    expect(effectiveEnd({ ...BLACK_FRIDAY, endedEarlyAt: at('2026-11-28T12:00:00Z') })).toEqual(
      at('2026-11-28T12:00:00Z'),
    );
  });
});

/** Decisao 2: periodos nao se cruzam. Intervalos meio-abertos [inicio, fim). */
describe('overlaps', () => {
  const period = (start: string, end: string) => ({
    startsAt: at(start),
    endsAt: at(end),
    endedEarlyAt: null,
  });

  it('cruza quando um comeca antes de o outro acabar', () => {
    expect(overlaps(BLACK_FRIDAY, period('2026-11-30T00:00:00Z', '2026-12-05T00:00:00Z'))).toBe(true);
    expect(overlaps(BLACK_FRIDAY, period('2026-11-20T00:00:00Z', '2026-11-28T00:00:00Z'))).toBe(true);
  });

  it('um dentro do outro cruza', () => {
    expect(overlaps(BLACK_FRIDAY, period('2026-11-28T00:00:00Z', '2026-11-29T00:00:00Z'))).toBe(true);
  });

  it('encostados (um acaba quando o outro comeca) nao cruzam', () => {
    expect(overlaps(BLACK_FRIDAY, period('2026-12-01T03:00:00Z', '2026-12-02T03:00:00Z'))).toBe(false);
    expect(overlaps(BLACK_FRIDAY, period('2026-11-20T00:00:00Z', '2026-11-27T03:00:00Z'))).toBe(false);
  });

  it('a encerrada antes da hora ocupa so ate o encerramento', () => {
    const ended = { ...BLACK_FRIDAY, endedEarlyAt: at('2026-11-28T12:00:00Z') };

    expect(overlaps(ended, period('2026-11-29T00:00:00Z', '2026-11-30T00:00:00Z'))).toBe(false);
  });
});
