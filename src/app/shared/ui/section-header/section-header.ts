import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'ui-section-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div [class]="wrapperClasses()">
      @if (overline()) {
        <p class="text-xs font-bold uppercase tracking-widest text-brand-teal-deep mb-2">{{ overline() }}</p>
      }
      <h2 class="text-3xl md:text-4xl font-bold tracking-tight text-brand-navy">{{ title() }}</h2>
      @if (subtitle()) {
        <p class="mt-3 text-base text-slate-500 max-w-2xl" [class.mx-auto]="align() === 'center'">
          {{ subtitle() }}
        </p>
      }
    </div>
  `,
})
export class SectionHeader {
  readonly overline = input('');
  readonly title = input('');
  readonly subtitle = input('');
  readonly align = input<'left' | 'center'>('left');

  protected readonly wrapperClasses = computed(() =>
    this.align() === 'center' ? 'text-center' : 'text-left'
  );
}
