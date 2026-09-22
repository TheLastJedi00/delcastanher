import { BadRequestException } from '@nestjs/common';
import { ACTIVITY_WINDOW_DAYS } from '../users/users.admin.service';
import { FinanceGranularity } from './admin-finance.types';

/**
 * O fuso em que este painel pensa (decisao 11).
 *
 * Uma venda as 21h de terca em Brasilia e quarta-feira em UTC. Agrupar a serie
 * pelo fuso do banco jogaria tres horas de vendas de todo dia para o dia
 * seguinte, e no ultimo dia do mes jogaria para o mes seguinte. O corte e feito
 * aqui e no `AT TIME ZONE` da consulta, para que "de 01/09 a 30/09" signifique
 * o setembro que o administrador tem em mente.
 */
export const REPORT_TIME_ZONE = 'America/Sao_Paulo';

/** Um dia em milissegundos. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** O periodo resolvido: `from` inclusivo, `to` exclusivo. */
export interface ResolvedPeriod {
  from: Date;
  to: Date;
}

/**
 * As partes de um instante **no fuso de Sao Paulo**.
 *
 * `Intl` e a unica fonte que conhece o historico de fuso do pais; somar tres
 * horas na mao acertaria hoje e erraria em qualquer ano em que o horario de
 * verao existiu — e o painel vai consultar periodos antigos.
 */
function saoPauloParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/**
 * A chave do ponto da serie, no fuso do relatorio: `2026-09-30` no dia,
 * `2026-09` no mes. Uma venda as 21h de 30/09 em Sao Paulo cai em **setembro**.
 */
export function bucketKey(date: Date, granularity: FinanceGranularity): string {
  const { year, month, day } = saoPauloParts(date);

  return granularity === 'month' ? `${year}-${month}` : `${year}-${month}-${day}`;
}

/**
 * Todas as chaves do intervalo, inclusive as sem venda.
 *
 * Dia sem venda entra como ponto zero **dentro** do intervalo consultado, para
 * que o grafico nao invente continuidade entre duas datas distantes ligando uma
 * ponta a outra com uma reta que nao aconteceu.
 */
export function bucketsOf(period: ResolvedPeriod, granularity: FinanceGranularity): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  // O passo e sempre de um dia, inclusive na granularidade de mes: o conjunto
  // de chaves elimina a repeticao, e caminhar de mes em mes exigiria saber onde
  // cada mes comeca no fuso do relatorio para ganhar trinta iteracoes.
  for (let cursor = period.from.getTime(); cursor < period.to.getTime(); cursor += DAY_MS) {
    const key = bucketKey(new Date(cursor), granularity);

    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }

  // O ultimo instante do intervalo pode cair em uma chave que o passo diario
  // nao alcancou — um recorte de poucas horas atravessando a meia-noite.
  const last = bucketKey(new Date(period.to.getTime() - 1), granularity);

  if (period.to.getTime() > period.from.getTime() && !seen.has(last)) {
    keys.push(last);
  }

  return keys;
}

/**
 * Resolve o recorte pedido, caindo nos ultimos 30 dias quando nada vem.
 *
 * A janela default e a mesma do `ACTIVITY_WINDOW_DAYS` da Spec 013, para que as
 * duas abas do painel nao tenham dois "recente" diferentes.
 *
 * `from` posterior a `to` e **400**, e nao uma troca silenciosa: um filtro
 * invertido e defeito de quem chamou, e responder 200 com outro periodo
 * esconderia o defeito dentro de um numero de dinheiro.
 */
export function resolvePeriod(from?: string, to?: string, now = new Date()): ResolvedPeriod {
  const end = to ? new Date(to) : now;
  const start = from ? new Date(from) : new Date(end.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('As datas do periodo precisam estar no formato ISO 8601.');
  }

  if (start.getTime() > end.getTime()) {
    throw new BadRequestException('A data inicial precisa ser anterior a data final.');
  }

  return { from: start, to: end };
}

/**
 * O intervalo imediatamente anterior, de **igual duracao** (decisao 19).
 *
 * Comparar cinco dias de outubro com setembro inteiro mostraria queda todo mes
 * ate o dia 30 — o numero diria mais sobre o calendario do que sobre a loja.
 */
export function previousPeriod(period: ResolvedPeriod): ResolvedPeriod {
  const span = period.to.getTime() - period.from.getTime();

  return { from: new Date(period.from.getTime() - span), to: new Date(period.from.getTime()) };
}
