import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { REDIRECT_PARAM, safeRedirect } from './safe-redirect';

/**
 * Guard do `/login` (Spec 019, decisao 16): quem ja tem sessao nao ve o
 * formulario, e vai para a propria area — ou para o destino interno pedido em
 * `?redirect=`.
 *
 * Fica no `/login`, e nao num link diferente em cada pagina da vitrine: assim
 * ele cobre o botao do cabecalho, o rodape, o voltar do navegador, o favorito
 * e a URL digitada de uma vez.
 *
 * A sessao ja foi refeita pelo `provideSessionRestore` antes do roteamento
 * (Spec 017, decisao 19), entao a leitura aqui e sincrona. No prerender nao ha
 * sessao, e o login e renderizado normalmente.
 */
export const guestGuard: CanActivateFn = route => {
  const auth = inject(AuthService);

  if (!auth.role()) {
    return true;
  }

  const target = safeRedirect(route.queryParamMap.get(REDIRECT_PARAM)) ?? auth.homeUrl();

  return inject(Router).parseUrl(target);
};
