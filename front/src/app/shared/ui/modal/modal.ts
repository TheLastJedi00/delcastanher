import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

let modalInstances = 0;

/**
 * Casca de dialogo modal: cuida do backdrop, do fechamento (Esc / clique fora /
 * botao) e da semantica ARIA. O conteudo vem por projecao.
 */
@Component({
  selector: 'ui-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fixed inset-0 z-50 flex items-center justify-center px-4 py-8',
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <div
      class="absolute inset-0 bg-brand-navy/30 backdrop-blur-sm"
      (click)="closed.emit()"
      aria-hidden="true"></div>

    <div
      class="glass animate-scale-in relative z-10 max-h-full w-full max-w-md overflow-y-auto rounded-3xl p-8"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 [id]="titleId" class="text-2xl font-bold tracking-tight text-brand-navy">
            {{ title() }}
          </h2>
          @if (description()) {
            <p class="mt-1 text-sm text-slate-500">{{ description() }}</p>
          }
        </div>

        <button
          type="button"
          (click)="closed.emit()"
          aria-label="Fechar"
          class="-mr-2 -mt-2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-navy/5 hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <ng-content />
    </div>
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly closed = output<void>();

  protected readonly titleId = `ui-modal-title-${modalInstances++}`;
}
