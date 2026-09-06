import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const WIDTHS = {
  sm: 'max-w-3xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
} as const;

@Component({
  selector: 'ui-page-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
})
export class PageContainer {
  readonly maxWidth = input<keyof typeof WIDTHS>('xl');
  readonly animate = input(true);

  protected readonly classes = computed(() =>
    [
      'mx-auto w-full px-4 py-6 md:px-6 md:py-8 lg:px-8',
      WIDTHS[this.maxWidth()],
      this.animate() ? 'animate-fade-in-up' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}
