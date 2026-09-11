import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentService } from '../../../core/services/consent.service';
import { Button } from '../button/button';

/**
 * Banner de consentimento de cookies (Spec 009, decisao 9).
 *
 * Aceitar e Recusar tem o mesmo peso visual de propositio: um "Recusar"
 * escondido em texto cinza transforma o aceite em caminho unico, e consentimento
 * sem alternativa real nao e consentimento livre.
 *
 * Nao bloqueia a tela. O conteudo publico e legivel sem cookie nenhum, entao
 * prender o visitante num modal seria pressao desnecessaria — o que o banner
 * garante e que nada dispare antes da escolha, e isso quem faz e o
 * `AnalyticsService`, nao a UI.
 */
@Component({
  selector: 'ui-cookie-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, RouterLink],
  template: `
    @if (consent.bannerVisible()) {
      <div
        role="region"
        aria-label="Consentimento de cookies"
        class="fixed inset-x-0 bottom-0 z-50 p-3 md:p-4">
        <div
          class="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-card md:flex-row md:items-center md:gap-6 md:p-5">
          <p class="min-w-0 flex-1 text-sm leading-relaxed text-slate-600">
            Usamos cookies para entender como a plataforma é usada e melhorar a experiência.
            Você decide: nada de medição é carregado antes do seu aceite. Veja a
            <a
              routerLink="/politica-de-cookies"
              class="font-semibold text-brand-teal-deep underline underline-offset-2 hover:text-brand-navy">
              Política de Cookies </a
            >.
          </p>

          <div class="flex shrink-0 gap-3">
            <ui-button variant="outline" size="sm" (click)="consent.reject()">Recusar</ui-button>
            <ui-button variant="primary" size="sm" (click)="consent.accept()">Aceitar</ui-button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CookieBanner {
  protected readonly consent = inject(ConsentService);
}
