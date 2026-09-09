import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { CHECKOUT_DEMO_NOTICE, findCheckoutProductBySlug } from '../../core/mocks/checkout.mock';
import { Button } from '../../shared/ui/button/button';
import { Logo } from '../../shared/ui/logo/logo';
import { OrderSummary } from '../../shared/ui/order-summary/order-summary';
import {
  PaymentMethod,
  PaymentMethodSelector,
} from '../../shared/ui/payment-method-selector/payment-method-selector';
import { CheckoutBuyerForm, createBuyerForm, readBuyer } from './checkout-buyer-form';
import { CheckoutCardForm } from './checkout-card-form';
import { CheckoutStateService } from './checkout-state';

/**
 * Pagina principal do mockup de checkout.
 *
 * Layout de conversao: sem menu de navegacao e sem rodape institucional — a
 * unica saida e voltar para a pagina do produto. O aviso de demonstracao fica
 * permanentemente visivel (decisao 7) e a rota e marcada como `noindex`:
 * um checkout de mentira nao pode ser indexado nem confundido com o real.
 */
@Component({
  selector: 'app-checkout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Logo,
    Button,
    OrderSummary,
    PaymentMethodSelector,
    CheckoutBuyerForm,
    CheckoutCardForm,
  ],
  templateUrl: './checkout.html',
})
export class Checkout {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  protected readonly state = inject(CheckoutStateService);

  protected readonly demoNotice = CHECKOUT_DEMO_NOTICE;

  private readonly slug = toSignal(
    this.route.paramMap.pipe(map(params => params.get('productSlug'))),
    { initialValue: null }
  );

  /** null quando o slug nao existe no mock — o template cai no fallback. */
  protected readonly product = computed(() => findCheckoutProductBySlug(this.slug()));

  protected readonly buyerForm = createBuyerForm(this.fb);
  protected readonly method = signal<PaymentMethod>('pix');
  protected readonly submitted = signal(false);

  protected readonly isCard = computed(() => this.method() === 'cartao');

  constructor() {
    this.title.setTitle('Checkout (demonstração) | Delcastanher');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    // O produto da URL abre a jornada; trocar de slug recomeca o pedido em vez
    // de aproveitar o estado do anterior.
    effect(() => {
      const product = this.product();

      if (product) {
        this.state.start(product);
      }
    });

    effect(() => this.state.setMethod(this.method()));
  }

  /** Guarda os dados do comprador na jornada (nunca os do cartao). */
  protected saveBuyer(): void {
    this.state.setBuyer(readBuyer(this.buyerForm));
  }
}
