import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Input } from '../../shared/ui/input/input';

const CARD_NUMBER = /^(\d[\s.-]?){13,19}$/;
const EXPIRY = /^(0[1-9]|1[0-2])\/?\d{2}$/;
const CVV = /^\d{3,4}$/;

/**
 * Dados do cartao — puramente visuais.
 *
 * O formulario vive inteiro dentro deste componente e o pai so consulta
 * `form.valid`: nenhum valor daqui vai para a API, para o `localStorage` ou
 * para as etapas seguintes da jornada (decisao 6 do context.md). O autofill de
 * cartao do navegador fica desligado — nao faz sentido oferecer o cartao real
 * de alguem a um formulario de demonstracao.
 */
@Component({
  selector: 'app-checkout-card-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Input],
  template: `
    <fieldset [formGroup]="form" class="flex flex-col gap-5" autocomplete="off">
      <legend class="sr-only">Dados do cartão</legend>

      <ui-input
        label="Número do cartão"
        placeholder="0000 0000 0000 0000"
        inputMode="numeric"
        autocomplete="off"
        formControlName="number"
        [error]="errors().number" />

      <ui-input
        label="Nome impresso no cartão"
        placeholder="Como aparece no cartão"
        autocomplete="off"
        formControlName="holder"
        [error]="errors().holder" />

      <div class="grid gap-5 sm:grid-cols-2">
        <ui-input
          label="Validade"
          placeholder="MM/AA"
          inputMode="numeric"
          autocomplete="off"
          formControlName="expiry"
          [error]="errors().expiry" />

        <ui-input
          label="CVV"
          placeholder="000"
          inputMode="numeric"
          autocomplete="off"
          formControlName="cvv"
          [error]="errors().cvv" />
      </div>

      <p class="rounded-xl bg-brand-navy/5 px-4 py-3 text-xs leading-relaxed text-slate-600">
        Estes campos são apenas visuais: os dados não são enviados, salvos nem levados para as
        próximas telas.
      </p>
    </fieldset>
  `,
})
export class CheckoutCardForm {
  private readonly fb = inject(NonNullableFormBuilder);

  /** Erros so aparecem depois da primeira tentativa de envio. */
  readonly submitted = input(false);

  readonly form = this.fb.group({
    number: ['', [Validators.required, Validators.pattern(CARD_NUMBER)]],
    holder: ['', [Validators.required, Validators.maxLength(120)]],
    expiry: ['', [Validators.required, Validators.pattern(EXPIRY)]],
    cvv: ['', [Validators.required, Validators.pattern(CVV)]],
  });

  /** Reexecuta o `errors` a cada digitacao, para o aviso sumir ao corrigir. */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly errors = computed(() => {
    const empty = { number: '', holder: '', expiry: '', cvv: '' };

    if (!this.submitted()) {
      return empty;
    }

    this.value();

    const { number, holder, expiry, cvv } = this.form.controls;

    return {
      number: number.valid ? '' : 'Informe um número de cartão válido.',
      holder: holder.valid ? '' : 'Informe o nome impresso no cartão.',
      expiry: expiry.valid ? '' : 'Use o formato MM/AA.',
      cvv: cvv.valid ? '' : 'Informe o código de segurança.',
    };
  });

  /** Descarta os dados do cartao ao trocar de metodo ou concluir a jornada. */
  clear(): void {
    this.form.reset();
  }
}
