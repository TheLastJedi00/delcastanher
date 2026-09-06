import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressVariant = 'teal' | 'brand' | 'gradient';

const FILLS: Record<ProgressVariant, string> = {
  teal: 'bg-brand-teal',
  brand: 'bg-gradient-brand',
  gradient: 'bg-gradient-teal',
};

@Component({
  selector: 'ui-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-2 w-full' },
  template: `
    <div
      [class]="trackClasses()"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="clamped()"
      [attr.aria-label]="label()">
      <div [class]="fillClasses()" [style.width.%]="clamped()"></div>
    </div>
    @if (showLabel()) {
      <span class="text-xs font-bold text-brand-steel tabular-nums shrink-0">{{ clamped() }}%</span>
    }
  `,
})
export class ProgressBar {
  readonly value = input(0);
  readonly variant = input<ProgressVariant>('gradient');
  readonly size = input<'sm' | 'md'>('sm');
  readonly showLabel = input(false);
  readonly label = input('Progresso');

  protected readonly clamped = computed(() => Math.min(100, Math.max(0, Math.round(this.value()))));

  protected readonly trackClasses = computed(
    () => `w-full overflow-hidden rounded-full bg-brand-navy/5 ${this.size() === 'md' ? 'h-3' : 'h-2'}`
  );

  protected readonly fillClasses = computed(
    () => `h-full rounded-full transition-all duration-700 ease-out ${FILLS[this.variant()]}`
  );
}
