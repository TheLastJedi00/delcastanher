import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PADDINGS = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-6 md:p-8',
} as const;

@Component({
  selector: 'ui-glass-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <div [class]="classes()">
      @if (accent()) {
        <span class="absolute inset-x-0 top-0 h-[3px] bg-gradient-brand" aria-hidden="true"></span>
      }
      <ng-content />
    </div>
  `,
})
export class GlassCard {
  readonly padding = input<keyof typeof PADDINGS>('md');
  readonly hover = input(true);
  /** Barra de gradiente brand no topo do card. */
  readonly accent = input(true);

  protected readonly classes = computed(() =>
    [
      'glass relative overflow-hidden rounded-2xl h-full transition-all duration-300',
      PADDINGS[this.padding()],
      this.hover() ? 'hover:shadow-glow-teal hover:-translate-y-1' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}
