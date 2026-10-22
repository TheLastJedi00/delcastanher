import { Routes } from '@angular/router';

/**
 * Rotas da loja (Spec 014).
 *
 * Todas atras de `authGuard + onboardingGuard`, aplicados no pai: comprar e ato
 * de quem ja tem conta e ja se apresentou (decisao 21). O `accessGuard` NAO
 * entra aqui — a loja e justamente o destino de quem ainda nao tem acesso.
 */
export const LOJA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./loja').then(m => m.Loja),
  },
  {
    path: 'pagamento',
    loadComponent: () => import('./pagamento').then(m => m.Pagamento),
  },
  {
    path: 'pedido/:orderId',
    loadComponent: () => import('./pedido').then(m => m.Pedido),
  },
  {
    // Spec 030: o link secreto do modulo de teste. A rota herda o `noindex` e a
    // renderizacao so no cliente da loja, e nunca entra no sitemap.
    path: 'teste/:chave',
    loadComponent: () => import('./teste').then(m => m.LojaTeste),
  },
  { path: '**', redirectTo: '' },
];
