import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

@Component({
  selector: 'ui-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @if (label()) {
      <label [attr.for]="id()" class="block text-xs font-bold uppercase tracking-widest text-brand-steel mb-2">
        {{ label() }}
      </label>
    }

    @if (multiline()) {
      <textarea
        [id]="id()"
        [rows]="rows()"
        [placeholder]="placeholder()"
        [class]="classes()"
        [value]="value()"
        (input)="onInput($event)"></textarea>
    } @else {
      <input
        [id]="id()"
        [type]="type()"
        [placeholder]="placeholder()"
        [class]="classes()"
        [value]="value()"
        (input)="onInput($event)" />
    }

    @if (error()) {
      <p class="mt-1.5 text-xs font-medium text-state-danger">{{ error() }}</p>
    }
  `,
})
export class Input {
  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input('text');
  readonly error = input('');
  readonly multiline = input(false);
  readonly rows = input(4);
  readonly mono = input(false);
  readonly value = model('');

  protected readonly id = input(`ui-input-${Input.counter++}`);
  private static counter = 0;

  protected readonly classes = computed(() =>
    [
      'w-full rounded-xl bg-white/80 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400',
      'border transition-all duration-200 outline-none',
      'focus:ring-2 focus:ring-brand-teal/20',
      this.error()
        ? 'border-state-danger focus:border-state-danger focus:ring-state-danger/20'
        : 'border-brand-navy/10 focus:border-brand-teal',
      this.mono() ? 'font-mono' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  protected onInput(event: Event) {
    this.value.set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }
}
