import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService, isSessionEnded } from '../services/auth.service';

/** Rotas de sessao: nunca levam token nem disparam refresh, senao entram em laco. */
const AUTH_ROUTES = `${environment.apiUrl}/auth/`;

/**
 * Anexa o idToken da sessao as chamadas da nossa API. O destino e conferido
 * para que o token nunca vaze em requisicoes a terceiros (fontes, CDNs), e
 * um Authorization ja definido pela chamada tem prioridade.
 *
 * Um `401` com token anexado significa idToken vencido que o timer de
 * renovacao nao pegou (aba suspensa, relogio adiantado): o interceptor faz
 * **um** refresh — compartilhado entre as requisicoes que falharam juntas —
 * e repete a original uma vez. Refresh recusado encerra a sessao (Spec 017,
 * decisao 20).
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const idToken = auth.idToken();

  if (
    !idToken ||
    !request.url.startsWith(environment.apiUrl) ||
    request.url.startsWith(AUTH_ROUTES) ||
    request.headers.has('Authorization')
  ) {
    return next(request);
  }

  return next(withToken(request, idToken)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        catchError((refreshError: unknown) => {
          if (isSessionEnded(refreshError)) {
            auth.expire();
          }

          // Quem chamou recebe o erro original, e nao o do refresh.
          return throwError(() => error);
        }),
        switchMap(session => next(withToken(request, session.idToken))),
      );
    }),
  );
};

function withToken(request: HttpRequest<unknown>, idToken: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${idToken}` } });
}
