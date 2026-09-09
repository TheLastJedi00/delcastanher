import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PlaceholderText } from '../placeholder-text/placeholder-text';

/**
 * Faixa de urgencia das paginas de venda (gatilhos de tempo e escassez).
 *
 * Sem timer funcional por decisao da Spec 006: um countdown exigiria uma
 * data-alvo real e o projeto ainda nao tem calendario de turmas. Prazo e vagas
 * entram como texto — normalmente placeholder — e o ui-countdown fica para a
 * spec que trouxer as datas.
 */
@Component({
  selector: 'ui-scarcity-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderText],
  host: { class: 'block' },
  template: `
    <div [class]="wrapperClasses()" role="status">
      <span class="blob-teal -right-10 -top-10 h-40 w-40 bg-brand-teal-light/20" aria-hidden="true"></span>

      <div class="relative mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-4 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
        @if (headline()) {
          <p class="text-sm font-extrabold uppercase tracking-[0.15em] text-white">{{ headline() }}</p>
        }

        <div class="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          @if (deadline()) {
            <p class="flex items-center gap-2 text-sm text-white/90">
              <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="font-semibold">{{ deadlineLabel() }}</span>
              <ui-placeholder-text [value]="deadline()" tone="light" />
            </p>
          }

          @if (seats()) {
            <p class="flex items-center gap-2 text-sm text-white/90">
              <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span class="font-semibold">{{ seatsLabel() }}</span>
              <ui-placeholder-text [value]="seats()" tone="light" />
            </p>
          }
        </div>
      </div>
    </div>
  `,
})
export class ScarcityBanner {
  readonly headline = input('Últimas vagas da turma');
  readonly deadlineLabel = input('Inscrições até');
  /** Texto do prazo — hoje placeholder (`[TURMA ENCERRA EM]`). */
  readonly deadline = input('');
  readonly seatsLabel = input('Vagas restantes:');
  /** Texto das vagas — hoje placeholder (`[VAGAS RESTANTES]`). */
  readonly seats = input('');
  /** Fixa a faixa no topo da viewport ao rolar a pagina. */
  readonly sticky = input(false);

  protected readonly wrapperClasses = computed(() =>
    [
      'relative overflow-hidden bg-gradient-brand text-white shadow-card',
      this.sticky() ? 'sticky top-0 z-30' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}
