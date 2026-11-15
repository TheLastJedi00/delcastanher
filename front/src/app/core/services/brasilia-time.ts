/**
 * Horario de Brasilia para campanhas (Spec 032, decisao 7): o painel e a
 * vitrine falam sempre em `America/Sao_Paulo`, e a API guarda em UTC.
 *
 * O deslocamento e fixo em -03:00: o Brasil nao tem horario de verao desde
 * 2019. Se ele voltar, `fromBrasiliaInput` e o unico ponto a mudar — a
 * formatacao ja usa o fuso pelo nome.
 */
export const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';
const BRASILIA_OFFSET = '-03:00';

const PARTS = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsOf(iso: string): Record<string, string> {
  return Object.fromEntries(
    PARTS.formatToParts(new Date(iso))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
}

/**
 * Valor de um `<input type="datetime-local">` (hora de Brasilia, sem fuso)
 * para ISO 8601 com o deslocamento: `2026-11-27T00:00` vira
 * `2026-11-27T00:00:00-03:00`. Nulo quando o campo esta vazio ou fora do
 * formato.
 */
export function fromBrasiliaInput(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00${BRASILIA_OFFSET}` : null;
}

/** O contrario: um instante para o valor do campo, em hora de Brasilia. */
export function toBrasiliaInput(iso: string): string {
  const p = partsOf(iso);

  return `${p['year']}-${p['month']}-${p['day']}T${p['hour']}:${p['minute']}`;
}

/** "27/11 às 23h59", na hora de Brasilia, para a vitrine e o painel. */
export function formatBrasiliaShort(iso: string): string {
  const p = partsOf(iso);

  return `${p['day']}/${p['month']} às ${p['hour']}h${p['minute']}`;
}

/** "27/11/2026 às 23h59", quando o ano importa (historico do painel). */
export function formatBrasiliaLong(iso: string): string {
  const p = partsOf(iso);

  return `${p['day']}/${p['month']}/${p['year']} às ${p['hour']}h${p['minute']}`;
}
