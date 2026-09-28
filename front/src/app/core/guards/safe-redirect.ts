/** Nome do query param que carrega o destino depois do login (Spec 019). */
export const REDIRECT_PARAM = 'redirect';

/**
 * Devolve o destino pedido em `?redirect=` so quando ele e um caminho interno
 * do app, e `null` em qualquer outro caso (Spec 019, decisao 17).
 *
 * Sem esta validacao, `/login?redirect=https://site-falso` viraria um
 * redirecionamento aberto com a marca da Delcastanher no meio do caminho. O
 * guard do login, o proprio login e o onboarding usam esta funcao, e so ela:
 * uma regra repetida em tres lugares e uma regra que escapa por um deles.
 *
 * - precisa comecar com `/` e nao com `//` (relativo ao protocolo, que o
 *   navegador resolve como outro dominio);
 * - `\` fica de fora porque alguns navegadores o tratam como `/`;
 * - `/login` e recusado para nao criar laco no proprio login.
 */
export function safeRedirect(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) {
    return null;
  }

  if (url.includes('\\')) {
    return null;
  }

  const path = url.split(/[?#]/)[0];

  if (path === '/login' || path.startsWith('/login/')) {
    return null;
  }

  return url;
}
