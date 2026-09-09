import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { CHECKOUT_DEMO_NOTICE } from '../../core/mocks/checkout.mock';
import { Button } from '../../shared/ui/button/button';
import { Input } from '../../shared/ui/input/input';
import { Logo } from '../../shared/ui/logo/logo';
import { CheckoutStateService } from './checkout-state';

/**
 * Definicao de senha — mockup.
 *
 * Encena a etapa que fecha a jornada de compra, mas nao autentica: nao chama o
 * `AuthService`, nao grava sessao e nao passa pelos guards (decisao 1 do
 * context.md). No fluxo real de hoje quem define a senha e o link enviado pelo
 * Firebase, e e isso que a tela seguinte diz ao comprador. O submit apenas
 * avanca para `sucesso`.
 */
@Component({
  selector: 'app-checkout-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Logo, Input, Button],
  template: `
    <div class="flex min-h-screen flex-col">
      <p
        role="note"
        class="bg-brand-navy px-4 py-2.5 text-center text-xs font-semibold leading-relaxed text-white/90">
        {{ demoNotice }}
      </p>

      <main class="relative flex flex-1 items-center justify-center bg-gradient-hero px-4 py-12">
        <span class="blob-teal -left-24 top-10 h-80 w-80 animate-float bg-brand-teal-light/25" aria-hidden="true"></span>
        <span class="blob-navy -right-24 bottom-0 h-96 w-96 animate-pulse-soft bg-white/10" aria-hidden="true"></span>

        <div class="relative z-10 w-full max-w-md">
          <div class="glass animate-scale-in rounded-3xl p-8 md:p-10">
            <div class="mb-8 text-center">
              <div class="mb-4 flex justify-center">
                <ui-logo size="md" />
              </div>
              <h1 class="mb-2 text-2xl font-bold tracking-tight text-brand-navy">
                Defina sua senha
              </h1>
              <p class="text-sm leading-relaxed text-slate-500">
                É com ela que você entra na área do aluno.
                @if (email()) {
                  <span class="mt-1 block font-semibold text-brand-navy">{{ email() }}</span>
                }
              </p>
            </div>

            <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5" novalidate>
              <ui-input
                label="Senha"
                type="password"
                placeholder="Mínimo de 8 caracteres"
                autocomplete="new-password"
                formControlName="password"
                [error]="errors().password" />

              <ui-input
                label="Confirme a senha"
                type="password"
                placeholder="Repita a senha"
                autocomplete="new-password"
                formControlName="confirmation"
                [error]="errors().confirmation" />

              <ui-button variant="primary" type="submit" [fullWidth]="true">
                Concluir
              </ui-button>
            </form>

            <p class="mt-6 text-center text-xs leading-relaxed text-slate-500">
              Demonstração: esta senha não é salva em lugar nenhum e nenhuma conta é criada aqui.
            </p>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class CheckoutPassword {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly state = inject(CheckoutStateService);

  protected readonly demoNotice = CHECKOUT_DEMO_NOTICE;
  protected readonly email = computed(() => this.state.buyer().email);

  protected readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmation: ['', [Validators.required]],
  });

  /** Erros so aparecem depois da primeira tentativa de envio. */
  private readonly submitted = signal(false);

  /** Reexecuta o `errors` a cada digitacao, para o aviso sumir ao corrigir. */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  private readonly matches = computed(() => {
    this.value();

    const { password, confirmation } = this.form.getRawValue();

    return !!password && password === confirmation;
  });

  protected readonly errors = computed(() => {
    if (!this.submitted()) {
      return { password: '', confirmation: '' };
    }

    const { password } = this.form.controls;

    return {
      password: password.valid ? '' : 'Use pelo menos 8 caracteres.',
      confirmation: this.matches() ? '' : 'As senhas não são iguais.',
    };
  });

  protected submit(): void {
    this.submitted.set(true);

    if (this.form.invalid || !this.matches()) {
      return;
    }

    // Nada de AuthService, sessao ou API: a senha morre com o formulario.
    const slug = this.state.product()?.slug;

    if (slug) {
      this.router.navigate(['/checkout', slug, 'sucesso']);
    }
  }
}
