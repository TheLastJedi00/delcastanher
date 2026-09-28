import { Observable, catchError, concat, defer, filter, map, of, timeout } from 'rxjs';

/** Quanto a leitura espera a API antes de desistir e ficar em carregamento. */
const LOAD_TIMEOUT_MS = 10_000;

/** Resultado de uma leitura: o valor, ou a falha — que nunca derruba o build. */
export type LoadResult<T> = { ok: true; value: T } | { ok: false };

/**
 * Leitura de conteudo publico que muda sem deploy (Spec 022, decisao 4).
 *
 * - **No build** (prerender), busca uma vez: o HTML sai com o valor do
 *   momento. Se a API falhar ou demorar, sai `{ ok: false }` e a pagina fica
 *   no estado de carregamento — o build **nao** falha por isso.
 * - **No navegador**, a primeira leitura reaproveita a resposta do build (o
 *   transfer cache da hidratacao), para a pagina nao piscar; a segunda vai a
 *   rede de verdade (`fresh`), e so emite se o valor for outro. Publicar no
 *   painel aparece no site em ate um minuto, o tempo de cache da CDN.
 *
 * Uma falha so e emitida se nada chegou antes: a segunda leitura falhar nao
 * apaga o texto que a primeira ja mostrou.
 */
export function buildThenBrowser<T>(
  load: (fresh: boolean) => Observable<T>,
  isBrowser: boolean,
): Observable<LoadResult<T>> {
  const attempt = (fresh: boolean): Observable<LoadResult<T>> =>
    load(fresh).pipe(
      timeout(LOAD_TIMEOUT_MS),
      map(value => ({ ok: true as const, value })),
      catchError(() => of({ ok: false as const })),
    );

  if (!isBrowser) {
    return attempt(false);
  }

  return defer(() => {
    let last: string | null = null;

    return concat(attempt(false), attempt(true), of(null)).pipe(
      filter((result): result is LoadResult<T> | null => {
        if (result === null) {
          // Fim das duas leituras: so avisa a falha se nada foi entregue.
          return last === null;
        }

        if (!result.ok) {
          return false;
        }

        const key = JSON.stringify(result.value);

        if (key === last) {
          return false;
        }

        last = key;

        return true;
      }),
      map(result => result ?? { ok: false as const }),
    );
  });
}
