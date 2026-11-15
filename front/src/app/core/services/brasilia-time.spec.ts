import { formatBrasiliaLong, formatBrasiliaShort, fromBrasiliaInput, toBrasiliaInput } from './brasilia-time';

/** Spec 032, decisao 7: tela em Brasilia, API em UTC. */
describe('brasilia-time', () => {
  it('o campo do formulario vira ISO com -03:00', () => {
    expect(fromBrasiliaInput('2026-11-27T00:00')).toBe('2026-11-27T00:00:00-03:00');
    expect(new Date(fromBrasiliaInput('2026-11-27T00:00') as string).toISOString()).toBe(
      '2026-11-27T03:00:00.000Z',
    );
  });

  it('campo vazio ou fora do formato vira nulo', () => {
    expect(fromBrasiliaInput('')).toBeNull();
    expect(fromBrasiliaInput('27/11/2026 00:00')).toBeNull();
  });

  it('o instante UTC volta para o campo em hora de Brasilia', () => {
    expect(toBrasiliaInput('2026-11-27T03:00:00.000Z')).toBe('2026-11-27T00:00');
    expect(toBrasiliaInput('2026-12-01T02:59:00.000Z')).toBe('2026-11-30T23:59');
  });

  it('formata o texto da vitrine e do painel em Brasilia, qualquer que seja o fuso do aparelho', () => {
    expect(formatBrasiliaShort('2026-12-01T02:59:00.000Z')).toBe('30/11 às 23h59');
    expect(formatBrasiliaLong('2026-11-27T03:00:00.000Z')).toBe('27/11/2026 às 00h00');
  });
});
