import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Logo } from '../logo/logo';

/**
 * Sobreposicao de carregamento em tela cheia: bloqueia a interacao com a tela
 * enquanto uma requisicao esta em andamento e usa o proprio logotipo como
 * indicador de progresso.
 */
@Component({
  selector: 'ui-loading-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo],
  template: `
    <div class="flex flex-col items-center gap-5" role="status" aria-live="assertive">
      <ui-logo size="lg" />
      <p class="text-sm font-bold uppercase tracking-widest text-brand-navy/70">{{ message() }}</p>
    </div>
  `,
})
export class LoadingOverlay {
  readonly message = input('Carregando');
}
