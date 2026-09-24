import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

/**
 * Nome do cookie do refresh token. O prefixo `__Secure-` faz o navegador
 * recusar o cookie se ele nao vier com `Secure` de uma origem segura.
 */
export const REFRESH_COOKIE = '__Secure-refresh';

/** Duracao do cookie quando `AUTH_REFRESH_COOKIE_MAX_AGE_DAYS` nao esta definida. */
export const DEFAULT_REFRESH_COOKIE_MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Atributos comuns a gravar e apagar (Spec 017, decisao 12):
 *
 * - `httpOnly`: nenhum script da pagina le o token;
 * - sem `domain`: o cookie fica preso ao host da API;
 * - `path: '/auth'`: so `/auth/refresh` e `/auth/logout` o recebem;
 * - `sameSite: 'strict'`: todo uso parte do proprio front, que e o mesmo site.
 */
const BASE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auth',
};

/**
 * Opcoes de gravacao, com o `maxAge` renovado a cada refresh (decisao 15).
 * O refresh token do Firebase nao expira sozinho: quem limita a sessao e isto.
 */
export function refreshCookieOptions(config: ConfigService): CookieOptions {
  return { ...BASE_OPTIONS, maxAge: maxAgeDays(config) * DAY_MS };
}

/** Opcoes de remocao: as mesmas da gravacao, sem as que o navegador ignora. */
export function clearRefreshCookieOptions(): CookieOptions {
  return { ...BASE_OPTIONS };
}

/**
 * Valor invalido e erro, nao default: um erro de digitacao no painel viraria
 * uma sessao de duracao diferente da configurada sem ninguem perceber.
 */
function maxAgeDays(config: ConfigService): number {
  const raw = config.get<string>('AUTH_REFRESH_COOKIE_MAX_AGE_DAYS')?.trim();

  if (!raw) {
    return DEFAULT_REFRESH_COOKIE_MAX_AGE_DAYS;
  }

  const days = Number(raw);

  if (!Number.isInteger(days) || days < 1) {
    throw new Error(
      `AUTH_REFRESH_COOKIE_MAX_AGE_DAYS invalida ("${raw}"): informe um numero inteiro de dias, maior que zero.`,
    );
  }

  return days;
}
