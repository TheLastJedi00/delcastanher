import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { isPlaceholder } from '../../../core/mocks/placeholders';

/**
 * Renderiza um texto que pode ser um dado comercial ainda nao definido.
 *
 * Quando o valor esta no formato `[ALGO]` (ver core/mocks/placeholders.ts) ele
 * ganha tratamento visual de "pendente" — borda tracejada e tom neutro — em vez
 * de aparecer como texto solto que o visitante leria como erro de sistema.
 */
@Component({
  selector: 'ui-placeholder-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex max-w-full' },
  template: `
    @if (pending()) {
      <span [class]="classes()" [title]="'Informação a ser definida'">
        <svg class="h-3 w-3 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
        </svg>
        <span class="truncate">{{ value() }}</span>
      </span>
    } @else {
      <span class="min-w-0">{{ value() }}</span>
    }
  `,
})
export class PlaceholderText {
  readonly value = input('');
  /** Tom claro para uso sobre fundo escuro (hero, banner de escassez). */
  readonly tone = input<'light' | 'dark'>('dark');

  protected readonly pending = computed(() => isPlaceholder(this.value()));

  protected readonly classes = computed(() =>
    [
      'inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-dashed px-2 py-0.5',
      'text-[0.85em] font-semibold uppercase tracking-wide',
      this.tone() === 'light'
        ? 'border-white/40 bg-white/10 text-white/80'
        : 'border-brand-navy/25 bg-brand-navy/5 text-slate-500',
    ].join(' ')
  );
}
