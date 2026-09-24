import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Refaz a sessao pelo cookie antes do roteamento (Spec 017, decisao 19): sem
 * isto, depois de um reload os guards mandariam para `/login` quem tem sessao
 * valida, porque o idToken so vive em memoria.
 *
 * Visitante anonimo e prerender nao pagam nada: `restoreSession` so chama a
 * API no navegador e com o indicador de sessao presente.
 */
export function provideSessionRestore(): EnvironmentProviders {
  return provideAppInitializer(() => inject(AuthService).restoreSession());
}
