import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { CheckoutStateService } from './checkout-state';

/**
 * Guarda local das etapas seguintes do checkout (`senha` e `sucesso`).
 *
 * Nada a ver com o `authGuard` da Spec 004: aqui a pergunta e apenas se existe
 * uma jornada em andamento. Acesso direto por URL ou F5 chega com o
 * `CheckoutStateService` vazio e volta para o inicio do checkout, em vez de
 * exibir um pedido que nao existe (decisao 3 do context.md).
 */
export const checkoutJourneyGuard: CanActivateFn = route => {
  const state = inject(CheckoutStateService);
  const router = inject(Router);

  if (state.hasJourney()) {
    return true;
  }

  const slug =
    route.paramMap.get('productSlug') ??
    route.parent?.paramMap.get('productSlug') ??
    state.product()?.slug;

  return router.createUrlTree(slug ? ['/checkout', slug] : ['/planos']);
};
