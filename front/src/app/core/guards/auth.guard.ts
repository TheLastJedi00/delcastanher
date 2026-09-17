import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Role } from '../services/auth.service';

/**
 * Perfil exigido por rota. `null` significa "qualquer usuario autenticado" -
 * o caso do onboarding, por onde todo mundo passa antes da area dele.
 */
const REQUIRED_ROLE: Record<string, Role | null> = {
  ava: 'aluno',
  admin: 'admin',
  onboarding: null,
  // Spec 014: a loja e de qualquer pessoa autenticada, como o onboarding.
  //
  // Faltar aqui nao daria "acesso negado": daria **laco de redirecionamento**.
  // Rota fora deste mapa cai em `homeUrl()`, e o aluno sem acesso seria mandado
  // para `/ava`, de onde o `accessGuard` o devolveria para `/loja`, sem fim. O
  // admin tambem passa: ele tem conta de usuario como qualquer um, e nao ha
  // motivo para esconder dele a tela que vende.
  loja: null,
};

/**
 * Libera a rota apenas para o perfil correspondente. Sem sessao valida,
 * redireciona ao login; com sessao de outro perfil, manda o usuario para a
 * area a que ele tem acesso.
 */
export const authGuard: CanActivateFn = route => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const role = auth.role();

  if (!role) {
    return router.parseUrl('/login');
  }

  const path = route.routeConfig?.path ?? '';
  const required = REQUIRED_ROLE[path];

  if (path in REQUIRED_ROLE && (required === null || required === role)) {
    return true;
  }

  return router.parseUrl(auth.homeUrl());
};
