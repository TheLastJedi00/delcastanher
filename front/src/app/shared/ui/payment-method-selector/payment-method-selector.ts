import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export type PaymentMethod = 'pix' | 'cartao';

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  description: string;
}

/** Ordem canonica dos metodos: PIX primeiro, por ser a via aprovada na hora. */
export const PAYMENT_METHODS: PaymentMethodOption[] = [
  {
    value: 'pix',
    label: 'PIX',
    description: 'Aprovação imediata, sem parcelamento.',
  },
  {
    value: 'cartao',
    label: 'Cartão de crédito',
    description: 'Parcelamento conforme a condição da turma.',
  },
];

/**
 * Escolha do metodo de pagamento do checkout.
 *
 * E um grupo de radio de verdade (`role="radiogroup"` + `aria-checked`), e nao
 * dois cards clicaveis: quem navega por teclado ou leitor de tela precisa
 * ouvir que sao opcoes excludentes e qual esta ativa.
 */
@Component({
  selector: 'ui-payment-method-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" class="grid gap-3 sm:grid-cols-2">
      @for (option of options; track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="value() === option.value"
          [attr.tabindex]="value() === option.value ? 0 : -1"
          (click)="select(option.value)"
          [class]="optionClasses(option.value)">
          <span class="flex items-center gap-2">
            <span [class]="markerClasses(option.value)" aria-hidden="true">
              @if (value() === option.value) {
                <span class="h-2 w-2 rounded-full bg-white"></span>
              }
            </span>
            <span class="text-sm font-bold tracking-tight text-brand-navy">{{ option.label }}</span>
          </span>
          <span class="mt-2 block text-xs leading-relaxed text-slate-500">
            {{ option.description }}
          </span>
        </button>
      }
    </div>
  `,
})
export class PaymentMethodSelector {
  readonly value = model<PaymentMethod>('pix');
  protected readonly options = PAYMENT_METHODS;
  readonly label = input('Forma de pagamento');

  select(method: PaymentMethod): void {
    this.value.set(method);
  }

  protected optionClasses(method: PaymentMethod): string {
    return [
      'rounded-2xl border p-4 text-left transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2',
      this.value() === method
        ? 'border-brand-teal bg-brand-teal/5 shadow-card'
        : 'border-brand-navy/10 bg-white hover:border-brand-teal/40',
    ].join(' ');
  }

  protected markerClasses(method: PaymentMethod): string {
    return [
      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
      this.value() === method ? 'border-brand-teal bg-brand-teal' : 'border-brand-navy/25',
    ].join(' ');
  }
}
