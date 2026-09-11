import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentService } from '../../../core/services/consent.service';

/**
 * Links legais e acionador de "Preferencias de cookies" (Spec 009, decisao 10).
 *
 * Vive como componente proprio porque precisa aparecer em dois contextos com
 * visual incompativel: o rodape da vitrine (fundo navy) e o rodape enxuto da
 * area logada (fundo claro). Revogar o consentimento tem de ser alcancavel dos
 * dois lados — inclusive de dentro do AVA, onde o `ui-footer` nao entra.
 */
@Component({
  selector: 'ui-legal-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    <nav
      aria-label="Links legais"
      class="flex flex-wrap items-center gap-x-6 gap-y-2"
      [class.justify-center]="align() === 'center'"
      [class.md:justify-end]="align() === 'end'">
      <a routerLink="/termos-de-uso" [class]="linkClasses()">Termos de Uso</a>
      <a routerLink="/politica-de-privacidade" [class]="linkClasses()">Política de Privacidade</a>
      <a routerLink="/politica-de-cookies" [class]="linkClasses()">Política de Cookies</a>
      <button type="button" [class]="linkClasses()" (click)="consent.reopen()">
        Preferências de cookies
      </button>
    </nav>
  `,
})
export class LegalLinks {
  /** `light` para fundo escuro (rodape da vitrine), `muted` para fundo claro. */
  readonly tone = input<'light' | 'muted'>('light');
  readonly align = input<'center' | 'end'>('center');

  protected readonly consent = inject(ConsentService);

  protected readonly linkClasses = computed(() =>
    [
      'text-xs underline-offset-2 transition-colors hover:underline',
      this.tone() === 'light'
        ? 'text-white/60 hover:text-brand-teal-light'
        : 'text-slate-400 hover:text-brand-teal-deep',
    ].join(' ')
  );
}
