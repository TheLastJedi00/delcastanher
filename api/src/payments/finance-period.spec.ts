import { ACTIVITY_WINDOW_DAYS } from '../users/users.admin.service';
import { bucketKey, bucketsOf, previousPeriod, resolvePeriod } from './finance-period';

describe('finance-period', () => {
  /**
   * Decisao 11. Uma venda as 21h de terca em Brasilia e quarta-feira em UTC, e
   * no ultimo dia do mes ela e o mes seguinte. O corte e no fuso de Sao Paulo
   * para que "de 01/09 a 30/09" signifique o setembro que o administrador tem
   * em mente.
   */
  describe('bucketKey — o corte e no fuso de Sao Paulo (Task 3.6)', () => {
    it('poe uma venda das 21h de 30/09 em Sao Paulo no dia 30, e nao no 1o de outubro', () => {
      // 30/09/2026 21:00 em Sao Paulo = 01/10/2026 00:00 em UTC.
      const venda = new Date('2026-10-01T00:00:00Z');

      expect(bucketKey(venda, 'day')).toBe('2026-09-30');
    });

    it('poe essa mesma venda em setembro, e nao em outubro, na granularidade de mes', () => {
      const venda = new Date('2026-10-01T00:00:00Z');

      expect(bucketKey(venda, 'month')).toBe('2026-09');
    });

    it('mantem no dia seguinte a venda que ja e do dia seguinte em Sao Paulo', () => {
      const venda = new Date('2026-10-01T12:00:00Z');

      expect(bucketKey(venda, 'day')).toBe('2026-10-01');
    });
  });

  describe('bucketsOf — dia sem venda e ponto zero, e nao buraco', () => {
    it('devolve uma chave por dia do intervalo', () => {
      const keys = bucketsOf(
        { from: new Date('2026-09-01T03:00:00Z'), to: new Date('2026-09-04T03:00:00Z') },
        'day',
      );

      expect(keys).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    });

    it('agrupa o mesmo intervalo em uma chave por mes', () => {
      const keys = bucketsOf(
        { from: new Date('2026-08-15T03:00:00Z'), to: new Date('2026-10-02T03:00:00Z') },
        'month',
      );

      expect(keys).toEqual(['2026-08', '2026-09', '2026-10']);
    });

    it('nao devolve chave nenhuma para um intervalo vazio', () => {
      const instante = new Date('2026-09-01T03:00:00Z');

      expect(bucketsOf({ from: instante, to: instante }, 'day')).toEqual([]);
    });
  });

  describe('resolvePeriod — o recorte pedido (Task 3.9)', () => {
    it('cai nos ultimos 30 dias quando nada e informado', () => {
      const agora = new Date('2026-09-22T12:00:00Z');

      const period = resolvePeriod(undefined, undefined, agora);

      expect(period.to).toEqual(agora);
      expect((period.to.getTime() - period.from.getTime()) / (24 * 60 * 60 * 1000)).toBe(
        ACTIVITY_WINDOW_DAYS,
      );
    });

    // A mesma janela do `ACTIVITY_WINDOW_DAYS` da Spec 013: as duas abas do
    // painel nao podem ter dois "recente" diferentes.
    it('usa a mesma janela default da aba de alunos', () => {
      expect(ACTIVITY_WINDOW_DAYS).toBe(30);
    });

    it('recusa from posterior a to', () => {
      expect(() => resolvePeriod('2026-09-30T00:00:00Z', '2026-09-01T00:00:00Z')).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    });

    it('aceita from igual a to', () => {
      expect(() => resolvePeriod('2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')).not.toThrow();
    });
  });

  /**
   * Decisao 19. "Mes anterior" no dia 5 de outubro nao e setembro inteiro
   * contra cinco dias de outubro — essa conta sempre mostra queda, todo mes,
   * ate o dia 30.
   */
  describe('previousPeriod — janela do mesmo tamanho (Task 3.7)', () => {
    it('devolve o intervalo imediatamente anterior e de igual duracao', () => {
      const previous = previousPeriod({
        from: new Date('2026-09-01T00:00:00Z'),
        to: new Date('2026-09-11T00:00:00Z'),
      });

      expect(previous.from.toISOString()).toBe('2026-08-22T00:00:00.000Z');
      expect(previous.to.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });
  });
});
