import { ChangeDetectionStrategy, Component, computed, forwardRef, input, model, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let inputInstances = 0;

@Component({
  selector: 'ui-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Input), multi: true },
  ],
  template: `
    @if (label()) {
      <label [attr.for]="id()" class="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
        {{ label() }}
      </label>
    }

    @if (multiline()) {
      <textarea
        [id]="id()"
        [rows]="rows()"
        [placeholder]="placeholder()"
        [class]="classes()"
        [disabled]="isDisabled()"
        [value]="value()"
        (input)="onInput($event)"
        (blur)="onBlur()"></textarea>
    } @else {
      <input
        [id]="id()"
        [type]="type()"
        [placeholder]="placeholder()"
        [class]="classes()"
        [disabled]="isDisabled()"
        [value]="value()"
        (input)="onInput($event)"
        (blur)="onBlur()" />
    }

    @if (error()) {
      <p class="mt-1.5 text-xs font-medium text-state-danger">{{ error() }}</p>
    }
  `,
})

/**
 * Campo de texto da plataforma. Alem do `[(value)]`, implementa
 * ControlValueAccessor: o mesmo componente atende as telas em signals e as
 * que usam Reactive Forms, sem uma segunda versao do input.
 */
export class Input implements ControlValueAccessor {
  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input('text');
  readonly error = input('');
  readonly multiline = input(false);
  readonly rows = input(4);
  readonly mono = input(false);
  readonly value = model('');

  protected readonly id = input(`ui-input-${inputInstances++}`);
  protected readonly isDisabled = signal(false);

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  protected readonly classes = computed(() =>
    [
      'w-full rounded-xl bg-white/80 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400',
      'border transition-all duration-200 outline-none',
      'focus:ring-2 focus:ring-brand-teal/20',
      this.error()
        ? 'border-state-danger focus:border-state-danger focus:ring-state-danger/20'
        : 'border-brand-navy/10 focus:border-brand-teal',
      this.mono() ? 'font-mono' : '',
      this.isDisabled() ? 'cursor-not-allowed opacity-60' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  protected onInput(event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;

    this.value.set(value);
    this.onChange(value);
  }

  protected onBlur() {
    this.onTouched();
  }
}
