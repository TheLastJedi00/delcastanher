import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { switchMap } from 'rxjs';

import { Input } from '../../shared/ui/input/input';
import { CheckoutBuyer } from './checkout-state';

export type BuyerForm = FormGroup<{
  name: FormControl<string>;
  email: FormControl<string>;
  document: FormControl<string>;
  phone: FormControl<string>;
}>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validacao de formato apenas, sem dependencia nova de mascara (task 2.1):
 * os padroes aceitam o dado digitado com ou sem pontuacao, e a normalizacao
 * para so digitos acontece na leitura.
 */
const CPF = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
const PHONE = /^\(?\d{2}\)?[\s-]?\d{4,5}-?\d{4}$/;

export function createBuyerForm(fb: NonNullableFormBuilder): BuyerForm {
  return fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.pattern(EMAIL)]],
    document: ['', [Validators.required, Validators.pattern(CPF)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE)]],
  });
}

/** Valor do formulario ja limpo, no formato guardado pela jornada. */
export function readBuyer(form: BuyerForm): CheckoutBuyer {
  const { name, email, document, phone } = form.getRawValue();

  return {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    document: document.replace(/\D/g, ''),
    phone: phone.replace(/\D/g, ''),
  };
}

/**
 * Dados pessoais do comprador — o cadastro inicial que vira a conta do aluno
 * quando o fluxo real existir. Reusa o `ui-input`, que ja implementa
 * ControlValueAccessor.
 */
@Component({
  selector: 'app-checkout-buyer-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Input],
  template: `
    <fieldset [formGroup]="form()" class="flex flex-col gap-5">
      <legend class="sr-only">Seus dados</legend>

      <ui-input
        label="Nome completo"
        placeholder="Como está no seu documento"
        formControlName="name"
        [error]="errors().name" />

      <ui-input
        label="E-mail"
        type="email"
        placeholder="seu@email.com"
        formControlName="email"
        [error]="errors().email" />

      <div class="grid gap-5 sm:grid-cols-2">
        <ui-input
          label="CPF"
          placeholder="000.000.000-00"
          formControlName="document"
          [error]="errors().document" />

        <ui-input
          label="Telefone"
          type="tel"
          placeholder="(11) 90000-0000"
          formControlName="phone"
          [error]="errors().phone" />
      </div>

      <p class="text-xs leading-relaxed text-slate-500">
        Usamos o e-mail para enviar o acesso à área do aluno. Confira antes de continuar.
      </p>
    </fieldset>
  `,
})
export class CheckoutBuyerForm {
  readonly form = input.required<BuyerForm>();
  /** Erros so aparecem depois da primeira tentativa de envio. */
  readonly submitted = input(false);

  /** Reexecuta o `errors` a cada digitacao, para o aviso sumir ao corrigir. */
  private readonly value = toSignal(
    toObservable(this.form).pipe(switchMap(form => form.valueChanges)),
    { initialValue: null }
  );

  protected readonly errors = computed(() => {
    const empty = { name: '', email: '', document: '', phone: '' };

    if (!this.submitted()) {
      return empty;
    }

    this.value();

    const { name, email, document, phone } = this.form().controls;

    return {
      name: name.valid ? '' : 'Informe seu nome completo.',
      email: email.valid ? '' : 'Informe um e-mail válido.',
      document: document.valid ? '' : 'Informe um CPF válido.',
      phone: phone.valid ? '' : 'Informe um telefone com DDD.',
    };
  });
}
