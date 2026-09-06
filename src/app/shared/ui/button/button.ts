import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-brand text-white shadow-card hover:shadow-glow-teal',
  secondary: 'bg-brand-navy text-white shadow-card hover:bg-brand-navy-light',
  ghost: 'text-brand-teal hover:bg-brand-teal/5',
  outline: 'border border-brand-teal text-brand-teal hover:bg-brand-teal/5',
  danger: 'bg-state-danger text-white shadow-card hover:brightness-110',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm gap-1.5',
  md: 'px-6 py-2.5 text-sm gap-2',
  lg: 'px-8 py-4 text-lg gap-2.5',
};

@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.w-full]': 'fullWidth()', class: 'inline-flex' },
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="classes()">
      @if (loading()) {
        <svg class="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      }
      <ng-content />
    </button>
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly fullWidth = input(false);

  protected readonly classes = computed(() =>
    [
      'inline-flex items-center justify-center rounded-xl font-bold tracking-tight',
      'transition-all duration-200 active:scale-[0.98]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2',
      VARIANTS[this.variant()],
      SIZES[this.size()],
      this.fullWidth() ? 'w-full' : '',
      this.loading() ? 'pointer-events-none opacity-70' : '',
      this.disabled() ? 'opacity-50 cursor-not-allowed' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}
