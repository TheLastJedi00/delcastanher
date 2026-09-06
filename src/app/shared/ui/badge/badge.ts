import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeVariant = 'teal' | 'navy' | 'success' | 'warning' | 'danger';

const VARIANTS: Record<BadgeVariant, string> = {
  teal: 'bg-brand-teal/10 text-brand-teal',
  navy: 'bg-brand-navy/10 text-brand-navy',
  success: 'bg-state-success/10 text-state-success',
  warning: 'bg-state-warning/10 text-state-warning',
  danger: 'bg-state-danger/10 text-state-danger',
};

@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span [class]="classes()">
      @if (label()) {
        {{ label() }}
      } @else {
        <ng-content />
      }
    </span>
  `,
})
export class Badge {
  readonly variant = input<BadgeVariant>('teal');
  readonly label = input('');

  protected readonly classes = computed(
    () =>
      `inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${VARIANTS[this.variant()]}`
  );
}
