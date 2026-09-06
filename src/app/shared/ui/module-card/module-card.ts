import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'ui-module-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button type="button" [class]="classes()" (click)="selected.emit()" [attr.aria-current]="active() ? 'step' : null">
      @if (active()) {
        <span class="absolute inset-y-0 left-0 w-1 bg-gradient-teal" aria-hidden="true"></span>
      }

      <span class="mt-0.5 shrink-0">
        @if (completed()) {
          <span class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-teal text-white">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        } @else {
          <span class="block h-5 w-5 rounded-full border-2 border-brand-navy/20"></span>
        }
      </span>

      <span class="min-w-0">
        <span class="block text-[11px] font-bold uppercase tracking-[0.15em] text-brand-steel mb-1">
          Módulo {{ moduleNumber() }}
        </span>
        <span class="block text-sm font-bold" [class.text-brand-teal]="active()" [class.text-brand-navy]="!active()">
          {{ title() }}
        </span>
      </span>
    </button>
  `,
})
export class ModuleCard {
  readonly moduleNumber = input(1);
  readonly title = input('');
  readonly completed = input(false);
  readonly active = input(false);

  readonly selected = output<void>();

  protected readonly classes = computed(() =>
    [
      'relative flex w-full items-start gap-3 border-b border-brand-navy/8 p-4 text-left',
      'transition-all duration-200 hover:bg-brand-teal/5 hover:shadow-glow-teal',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal',
      this.active() ? 'bg-brand-teal/5' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}
