/** Teto do `detail` gravado em log (Spec 028, decisao 7). */
export const MAX_DETAIL_BYTES = 10 * 1024;

/**
 * Chaves que nunca saem em log, em qualquer nivel: o token do cartao e os
 * dados do pagador que o Mercado Pago devolve no corpo da order (`email` e
 * `identification`, o CPF).
 */
const SECRET_KEYS = new Set(['token', 'email', 'identification']);

/** Copia sem as chaves de `SECRET_KEYS`. */
function strip(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(strip);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .map(([key, inner]) => [key, strip(inner)]),
    );
  }

  return value;
}

/**
 * Corpo de resposta ou erro pronto para log: sem token nem dados do pagador
 * e com no maximo 10 KB (Spec 028, decisoes 7 e 12). Texto que nao e JSON
 * vira `{ text }`, e o que passa do teto vira `{ truncated, preview }`.
 */
export function sanitizeDetail(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }

  let parsed = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = { text: value };
    }
  }

  const clean = strip(parsed);
  const json = JSON.stringify(clean);

  if (Buffer.byteLength(json, 'utf8') <= MAX_DETAIL_BYTES) {
    return clean;
  }

  return { truncated: true, preview: json.slice(0, MAX_DETAIL_BYTES) };
}
