import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { REDIRECT_PARAM, safeRedirect } from './safe-redirect';

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
export const onboardingGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const users = inject(UserService);
  const isOnboardingRoute = route.routeConfig?.path === 'onboarding';

  return users.ensureProfile().pipe(
    map(profile => {
      const completed = profile?.onboardingCompleted ?? false;

      if (isOnboardingRoute) {
        const target = safeRedirect(route.queryParamMap?.get(REDIRECT_PARAM)) ?? auth.homeUrl();

        return completed ? router.parseUrl(target) : true;
      }

      // O destino segue junto ate o fim do onboarding (Spec 019, decisao 17):
      // o primeiro acesso de quem veio do `/planos` termina na loja com o
      // pacote marcado, e nao no inicio da area.
      return completed
        ? true
        : router.createUrlTree(['/onboarding'], {
            queryParams: state?.url ? { [REDIRECT_PARAM]: state.url } : {},
          });
    }),
  );
};
