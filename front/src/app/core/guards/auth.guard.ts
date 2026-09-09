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
