import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Role } from '../services/auth.service';

/**
 * Exige um perfil na rota que o declara.
 *
 * O `authGuard` ja resolve papel, mas por um mapa central indexado pelo
 * caminho (`REQUIRED_ROLE`): a rota nao diz o que exige, quem diz e uma
 * tabela em outro arquivo. Aqui a exigencia fica **na propria rota**, o que
 * vale tanto para o `/admin` inteiro quanto para uma area futura que precise
 * de papel sem entrar naquele mapa.
 *
 * Sem sessao valida a resposta e o login; com sessao de outro perfil, a area
 * a que o usuario tem acesso — nunca uma tela de erro, que so informaria a um
 * aluno que existe um painel que ele nao pode abrir.
 */
export function roleGuard(required: Role): CanActivateFn {
  return () => {
    const router = inject(Router);
    const auth = inject(AuthService);
    const role = auth.role();

    if (!role) {
      return router.parseUrl('/login');
    }

    return role === required ? true : router.parseUrl(auth.homeUrl());
  };
}

/**
 * Portao do painel administrativo. Desde a Spec 010 ele deixou de ser so uma
 * questao de UI: e por tras destas telas que saem as URLs assinadas de escrita
 * no bucket (decisao 13).
 */
export const adminGuard: CanActivateFn = roleGuard('admin');
