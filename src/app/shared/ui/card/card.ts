import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CardVariant = 'default' | 'glass' | 'elevated' | 'outline';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<CardVariant, string> = {
  default: 'bg-white shadow-card border border-brand-navy/8',
  glass: 'glass',
  elevated: 'bg-white shadow-glass',
  outline: 'bg-transparent border border-brand-navy/12',
};

const PADDINGS: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-6 md:p-8',
};

@Component({
  selector: 'ui-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
})
export class Card {
  readonly variant = input<CardVariant>('default');
  readonly padding = input<CardPadding>('md');
  readonly hover = input(true);

  protected readonly classes = computed(() =>
    [
      'rounded-2xl transition-all duration-300 h-full',
      VARIANTS[this.variant()],
      PADDINGS[this.padding()],
      this.hover() ? 'hover:shadow-card-hover hover:-translate-y-1' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}
