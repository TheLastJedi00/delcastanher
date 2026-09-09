import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import {
  CHECKOUT_DEMO_NOTICE,
  CHECKOUT_PIX_CODE,
  CHECKOUT_SCENARIOS,
  CheckoutScenario,
  findCheckoutProductBySlug,
} from '../../core/mocks/checkout.mock';
import { Button } from '../../shared/ui/button/button';
import { LoadingOverlay } from '../../shared/ui/loading-overlay/loading-overlay';
import { Logo } from '../../shared/ui/logo/logo';
import { OrderSummary } from '../../shared/ui/order-summary/order-summary';
import {
  PaymentMethod,
  PaymentMethodSelector,
} from '../../shared/ui/payment-method-selector/payment-method-selector';
import { CheckoutBuyerForm, createBuyerForm, readBuyer } from './checkout-buyer-form';
import { CheckoutCardForm } from './checkout-card-form';
import { CheckoutResult } from './checkout-result';
import { CheckoutStateService } from './checkout-state';

/** Duracao da simulacao de processamento. Exportada para os testes. */
export const PROCESSING_DELAY_MS = 1600;

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
    NgOptimizedImage,
    Logo,
    LoadingOverlay,
    Button,
    OrderSummary,
    PaymentMethodSelector,
    CheckoutBuyerForm,
    CheckoutCardForm,
    CheckoutResult,
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

  protected readonly pixCode = CHECKOUT_PIX_CODE;
  protected readonly pixCopied = signal(false);

  /** Cenario que a simulacao vai devolver — escolhido, nunca sorteado. */
  protected readonly scenarios = CHECKOUT_SCENARIOS;
  protected readonly scenario = signal<CheckoutScenario>('aprovado');

  protected readonly isProcessing = signal(false);
  private processingTimer: ReturnType<typeof setTimeout> | null = null;

  /** Presente apenas enquanto o cartao esta selecionado. */
  private readonly cardForm = viewChild(CheckoutCardForm);

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

    // Sair da tela no meio do "processando" nao pode deixar um timer solto
    // mexendo no estado da jornada depois.
    inject(DestroyRef).onDestroy(() => {
      if (this.processingTimer) {
        clearTimeout(this.processingTimer);
      }
    });
  }

  protected scenarioClasses(scenario: CheckoutScenario): string {
    return [
      'rounded-xl border px-3 py-1.5 text-xs font-bold tracking-tight transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2',
      this.scenario() === scenario
        ? 'border-brand-navy bg-brand-navy text-white'
        : 'border-brand-navy/20 bg-white text-slate-600 hover:border-brand-navy/40',
    ].join(' ');
  }

  /** Copia a chave PIX de demonstracao para a area de transferencia. */
  protected async copyPixCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pixCode);
      this.pixCopied.set(true);
    } catch {
      // Sem permissao de clipboard a chave continua visivel e selecionavel na
      // tela — o fluxo nao trava por causa da copia.
      this.pixCopied.set(false);
    }
  }

  /**
   * Conclui a etapa de pagamento. Valida o que a tela exige, guarda os dados
   * do comprador na jornada (nunca os do cartao) e segue para a simulacao.
   */
  protected submit(): void {
    this.submitted.set(true);

    if (this.buyerForm.invalid || this.cardForm()?.form.invalid || this.isProcessing()) {
      return;
    }

    this.state.setBuyer(readBuyer(this.buyerForm));
    this.isProcessing.set(true);

    // Espera artificial: sem ela o desfecho aparece no mesmo quadro do clique e
    // a tela de "processando" — que e justamente o estado a ser demonstrado —
    // nunca chega a ser vista.
    this.processingTimer = setTimeout(() => {
      this.isProcessing.set(false);
      this.state.complete(this.scenario());
      this.cardForm()?.clear();
    }, PROCESSING_DELAY_MS);
  }

  /** Volta ao formulario apos uma falha, preservando os dados preenchidos. */
  protected retry(): void {
    this.submitted.set(false);
    this.state.clearOutcome();
  }
}
