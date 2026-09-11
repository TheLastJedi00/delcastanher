import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CheckoutOutcome, CheckoutProduct } from '../../core/mocks/checkout.mock';
import { Button } from '../../shared/ui/button/button';
import { OrderSummary } from '../../shared/ui/order-summary/order-summary';

/**
 * Resultado da simulacao de pagamento: aprovado, recusado ou erro de
 * comunicacao.
 *
 * A mensagem e o codigo vem inteiros do mock — a tela nao escreve texto de
 * desfecho por conta propria. Nos cenarios de falha o CTA devolve o comprador
 * ao formulario com o que ele ja digitou preservado (task 3.2).
 */
@Component({
  selector: 'app-checkout-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, OrderSummary],
  template: `
    <section
      class="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center"
      role="status"
      aria-live="polite">
      <span [class]="iconClasses()" aria-hidden="true">
        @if (approved()) {
          <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
        } @else {
          <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        }
      </span>

      <div>
        <h1 class="mb-3 text-2xl font-extrabold tracking-tight text-brand-navy md:text-3xl">
          {{ outcome().title }}
        </h1>
        <p class="text-sm leading-relaxed text-slate-600 md:text-base">{{ outcome().message }}</p>
        <p class="mt-3 font-mono text-xs text-slate-400">Código da simulação: {{ outcome().code }}</p>
      </div>

      @if (approved()) {
        <ui-order-summary
          class="w-full text-left"
          [name]="product().name"
          [summary]="product().summary"
          [price]="product().price"
          [priceNote]="product().priceNote"
          [kind]="product().kind === 'curso' ? 'Curso' : 'Plano'"
          [method]="methodLabel()" />

        <div class="w-full rounded-2xl border border-brand-teal/30 bg-brand-teal/5 p-5 text-left">
          <h2 class="mb-1 text-sm font-extrabold tracking-tight text-brand-navy">Próximo passo</h2>
          <p class="text-sm leading-relaxed text-slate-600">
            Defina a senha da sua conta para acessar a área do aluno.
          </p>
        </div>

        <a [routerLink]="passwordLink()" class="w-full">
          <ui-button variant="primary" size="lg" [fullWidth]="true">Definir minha senha</ui-button>
        </a>
      } @else {
        <ui-button variant="primary" size="lg" [fullWidth]="true" (click)="retry.emit()">
          {{ outcome().recovery }}
        </ui-button>
        <p class="text-xs leading-relaxed text-slate-500">
          Seus dados continuam preenchidos — nada foi cobrado.
        </p>
      }
    </section>
  `,
})
export class CheckoutResult {
  readonly outcome = input.required<CheckoutOutcome>();
  readonly product = input.required<CheckoutProduct>();
  readonly methodLabel = input('');

  /** Pedido para voltar ao formulario, preservando o que ja foi preenchido. */
  readonly retry = output<void>();

  protected readonly approved = computed(() => this.outcome().scenario === 'aprovado');

  protected readonly passwordLink = computed(() => ['/checkout', this.product().slug, 'senha']);

  protected readonly iconClasses = computed(() =>
    [
      'flex h-16 w-16 items-center justify-center rounded-2xl',
      this.approved()
        ? 'bg-state-success/10 text-state-success'
        : 'bg-state-danger/10 text-state-danger',
    ].join(' ')
  );
}
