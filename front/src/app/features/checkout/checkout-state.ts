import { Injectable, computed, signal } from '@angular/core';

import {
  CHECKOUT_OUTCOMES,
  CheckoutOutcome,
  CheckoutProduct,
  CheckoutScenario,
} from '../../core/mocks/checkout.mock';
import { PaymentMethod } from '../../shared/ui/payment-method-selector/payment-method-selector';

/**
 * Dados do comprador levados de uma etapa para a outra.
 *
 * Nao existe campo de cartao aqui, e isso e proposital: numero, validade e CVV
 * ficam no formulario e morrem com ele (decisao 6 do context.md).
 */
export interface CheckoutBuyer {
  name: string;
  email: string;
  document: string;
  phone: string;
}

const EMPTY_BUYER: CheckoutBuyer = { name: '', email: '', document: '', phone: '' };

/**
 * Estado da jornada de checkout entre rotas irmas.
 *
 * `senha` e `sucesso` sao rotas proprias, entao o resultado da simulacao
 * precisa viver fora do componente. Acesso direto por URL ou F5 chega aqui com
 * o estado vazio: `hasJourney` fica falso e as etapas seguintes devolvem o
 * visitante ao inicio do checkout, sem inventar um pedido (decisao 3).
 */
@Injectable({ providedIn: 'root' })
export class CheckoutStateService {
  private readonly _product = signal<CheckoutProduct | null>(null);
  private readonly _method = signal<PaymentMethod>('pix');
  private readonly _buyer = signal<CheckoutBuyer>(EMPTY_BUYER);
  private readonly _outcome = signal<CheckoutOutcome | null>(null);

  readonly product = this._product.asReadonly();
  readonly method = this._method.asReadonly();
  readonly buyer = this._buyer.asReadonly();
  readonly outcome = this._outcome.asReadonly();

  /**
   * A jornada so existe depois de uma simulacao aprovada — e o que autoriza as
   * telas de senha e sucesso a aparecerem.
   */
  readonly hasJourney = computed(
    () => !!this._product() && this._outcome()?.scenario === 'aprovado'
  );

  /** Rotulo do metodo escolhido, para as telas de resultado exibirem. */
  readonly methodLabel = computed(() =>
    this._method() === 'pix' ? 'PIX' : 'Cartão de crédito'
  );

  start(product: CheckoutProduct): void {
    this._product.set(product);
    this._outcome.set(null);
  }

  setMethod(method: PaymentMethod): void {
    this._method.set(method);
  }

  setBuyer(buyer: CheckoutBuyer): void {
    this._buyer.set(buyer);
  }

  /** Registra o desfecho escolhido no seletor de demonstracao. */
  complete(scenario: CheckoutScenario): CheckoutOutcome {
    const outcome = CHECKOUT_OUTCOMES[scenario];

    this._outcome.set(outcome);

    return outcome;
  }

  /** Volta ao formulario preservando os dados ja preenchidos (task 3.2). */
  clearOutcome(): void {
    this._outcome.set(null);
  }

  reset(): void {
    this._product.set(null);
    this._method.set('pix');
    this._buyer.set(EMPTY_BUYER);
    this._outcome.set(null);
  }
}
