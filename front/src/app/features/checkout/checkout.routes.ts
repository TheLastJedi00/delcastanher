import { Routes } from '@angular/router';

/**
 * Rotas do mockup de checkout (Spec 007).
 *
 * Publicas de proposito: nenhuma etapa autentica, grava sessao ou passa pelos
 * guards da Spec 004 (decisao 1 do context.md). `senha` e `sucesso` sao rotas
 * irmas e nao filhas visuais — cada etapa ocupa a tela inteira.
 */
export const CHECKOUT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./checkout').then(m => m.Checkout),
  },
  {
    path: 'senha',
    loadComponent: () => import('./checkout-password').then(m => m.CheckoutPassword),
  },
  {
    path: 'sucesso',
    loadComponent: () => import('./checkout-success').then(m => m.CheckoutSuccess),
  },
  { path: '**', redirectTo: '' },
];
