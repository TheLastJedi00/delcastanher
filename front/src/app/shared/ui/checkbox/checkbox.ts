import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let checkboxInstances = 0;

/**
 * Caixa de selecao da plataforma, no mesmo desenho do `ui-input`: alem do
 * `[(checked)]`, implementa ControlValueAccessor, para atender tanto as telas
 * em signals quanto as em Reactive Forms sem uma segunda versao.
 *
 * Nasceu na Spec 015, para o aceite da Politica de Privacidade no onboarding —
 * o primeiro formulario da plataforma que precisa de um. Por isso o rotulo
 * aceita conteudo projetado em vez de so texto: o aceite precisa dos links dos
 * documentos dentro da propria frase, e um rotulo que so recebe string
 * obrigaria a por os links fora dele, longe do que esta sendo aceito.
 */
@Component({
  selector: 'ui-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Checkbox), multi: true }],
  template: `
    <div class="flex items-start gap-3">
      <input
        type="checkbox"
        [id]="id()"
        [class]="classes()"
        [disabled]="isDisabled()"
        [checked]="checked()"
        [attr.aria-describedby]="error() ? id() + '-error' : null"
        [attr.aria-invalid]="error() ? 'true' : null"
        (change)="onToggle($event)"
        (blur)="onBlur()" />

      <label [attr.for]="id()" class="text-sm leading-relaxed text-slate-600">
        <ng-content />
      </label>
    </div>

    @if (error()) {
      <p [id]="id() + '-error'" class="mt-1.5 text-xs font-medium text-state-danger">
        {{ error() }}
      </p>
    }
  `,
})
export class Checkbox implements ControlValueAccessor {
  readonly error = input('');
  readonly checked = model(false);

  protected readonly id = input(`ui-checkbox-${checkboxInstances++}`);
  protected readonly isDisabled = signal(false);

  private onChange: (value: boolean) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: boolean | null): void {
    this.checked.set(value ?? false);
  }

  registerOnChange(fn: (value: boolean) => void): void {
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
      // `mt-0.5` alinha a caixa com a primeira linha do rotulo, que costuma
      // ocupar varias linhas — centralizar deixaria a caixa boiando no meio.
      'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border bg-white/80',
      'text-brand-teal accent-brand-teal transition-all duration-200 outline-none',
      'focus:ring-2 focus:ring-brand-teal/20',
      this.error() ? 'border-state-danger focus:ring-state-danger/20' : 'border-brand-navy/20',
      this.isDisabled() ? 'cursor-not-allowed opacity-60' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  protected onToggle(event: Event) {
    const value = (event.target as HTMLInputElement).checked;

    this.checked.set(value);
    this.onChange(value);
  }

  protected onBlur() {
    this.onTouched();
  }
}
