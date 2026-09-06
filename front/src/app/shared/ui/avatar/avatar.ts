import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
};

@Component({
  selector: 'ui-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="initials()" [class]="classes() + ' object-cover'" />
    } @else {
      <span [class]="classes() + ' bg-gradient-brand text-white font-bold tracking-tight'" aria-hidden="true">
        {{ initials() }}
      </span>
    }
  `,
})
export class Avatar {
  readonly src = input('');
  readonly initials = input('');
  readonly size = input<AvatarSize>('md');

  protected readonly classes = computed(
    () =>
      `inline-flex items-center justify-center rounded-full ring-2 ring-white shadow-card shrink-0 ${SIZES[this.size()]}`
  );
}
