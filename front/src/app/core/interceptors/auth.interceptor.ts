import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * Anexa o idToken da sessao as chamadas da nossa API. O destino e conferido
 * para que o token nunca vaze em requisicoes a terceiros (fontes, CDNs), e
 * um Authorization ja definido pela chamada tem prioridade.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const idToken = inject(AuthService).idToken();

  if (!idToken || !request.url.startsWith(environment.apiUrl) || request.headers.has('Authorization')) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${idToken}` } }));
};
