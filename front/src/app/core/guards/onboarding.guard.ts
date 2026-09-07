import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';

/**
 * Segura as rotas internas ate o perfil estar completo, e faz o caminho
 * inverso na propria `/onboarding`, para quem ja preencheu nao voltar ao
 * formulario.
 *
 * `ensureProfile` cobre o acesso direto por URL: em um reload o estado esta
 * vazio, e a decisao espera a resposta do backend em vez de chutar. Se a
 * chamada falhar, o perfil vem nulo e o usuario cai no onboarding - o
 * caminho seguro, ja que sem o dado nao da para afirmar que ele completou.
 */
export const onboardingGuard: CanActivateFn = route => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const users = inject(UserService);
  const isOnboardingRoute = route.routeConfig?.path === 'onboarding';

  return users.ensureProfile().pipe(
    map(profile => {
      const completed = profile?.onboardingCompleted ?? false;

      if (isOnboardingRoute) {
        return completed ? router.parseUrl(auth.homeUrl()) : true;
      }

      return completed ? true : router.parseUrl('/onboarding');
    }),
  );
};
