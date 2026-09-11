import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CHECKOUT_DEMO_NOTICE } from '../../core/mocks/checkout.mock';
import { Button } from '../../shared/ui/button/button';
import { Logo } from '../../shared/ui/logo/logo';
import { OrderSummary } from '../../shared/ui/order-summary/order-summary';
import { CheckoutStateService } from './checkout-state';

/**
 * Fim da jornada simulada.
 *
 * Encerra com a mensagem verdadeira do fluxo atual: quem define a senha e o
 * link que o Firebase envia por e-mail (`AuthService.requestAccount`). Por isso
 * o CTA aponta para `/login` e nao para `/ava` — sem sessao real os guards
 * devolveriam o visitante, e "curso desbloqueado" esta fora do escopo desta
 * spec (decisoes 1 e 2 do context.md).
 */
@Component({
  selector: 'app-checkout-success',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Logo, Button, OrderSummary],
  template: `
    <div class="flex min-h-screen flex-col bg-slate-50">
      <p
        role="note"
        class="bg-brand-navy px-4 py-2.5 text-center text-xs font-semibold leading-relaxed text-white/90">
        {{ demoNotice }}
      </p>

      <main class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-4 py-12 text-center">
        <ui-logo size="lg" />

        <span
          class="flex h-16 w-16 items-center justify-center rounded-2xl bg-state-success/10 text-state-success"
          aria-hidden="true">
          <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </span>

        <div>
          <h1 class="mb-3 text-2xl font-extrabold tracking-tight text-brand-navy md:text-3xl">
            Inscrição concluída
          </h1>
          <p class="text-sm leading-relaxed text-slate-600 md:text-base">
            Enviamos para
            @if (email()) {
              <span class="font-bold text-brand-navy">{{ email() }}</span>
            } @else {
              <span>o seu e-mail</span>
            }
            o link de definição de senha. É por ele que você cria o acesso à área do aluno — depois
            é só entrar pelo login com o e-mail e a senha que você definir.
          </p>
        </div>

        @if (product(); as product) {
          <ui-order-summary
            class="w-full text-left"
            [name]="product.name"
            [summary]="product.summary"
            [price]="product.price"
            [priceNote]="product.priceNote"
            [kind]="product.kind === 'curso' ? 'Curso' : 'Plano'"
            [method]="state.methodLabel()" />
        }

        <a routerLink="/login" class="w-full">
          <ui-button variant="primary" size="lg" [fullWidth]="true">Acessar meu curso</ui-button>
        </a>

        <p class="text-xs leading-relaxed text-slate-500">
          Não recebeu o e-mail? Confira a caixa de spam ou peça um novo link na tela de login.
        </p>
      </main>
    </div>
  `,
})
export class CheckoutSuccess {
  protected readonly state = inject(CheckoutStateService);

  protected readonly demoNotice = CHECKOUT_DEMO_NOTICE;
  protected readonly product = computed(() => this.state.product());
  protected readonly email = computed(() => this.state.buyer().email);
}
