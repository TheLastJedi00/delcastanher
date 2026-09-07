import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { Button } from '../../shared/ui/button/button';
import { Input } from '../../shared/ui/input/input';
import { LoadingOverlay } from '../../shared/ui/loading-overlay/loading-overlay';
import { Logo } from '../../shared/ui/logo/logo';

/** Mensagem do primeiro erro do campo, ou vazio quando ele esta valido. */
function messageFor(control: AbstractControl, required: string): string {
  if (control.hasError('required')) {
    return required;
  }

  if (control.hasError('maxlength')) {
    const { requiredLength } = control.getError('maxlength') as { requiredLength: number };

    return `Use no máximo ${requiredLength} caracteres.`;
  }

  return control.hasError('pattern') ? 'Informe um endereço válido do LinkedIn.' : '';
}

/** Aceita o endereco com ou sem protocolo; a API normaliza para https://. */
const LINKEDIN = /^(https?:\/\/)?([\w-]+\.)*linkedin\.com\/.+$/i;

/**
 * Primeiro acesso: completa o cadastro do aluno antes de liberar a plataforma.
 * E a mesma rota para quem ja existia no Firebase antes do banco - o
 * `onboardingGuard` traz todo mundo para ca ate o perfil estar preenchido.
 */
@Component({
  selector: 'app-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Logo, Input, Button, LoadingOverlay],
  template: `
    <main class="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <span class="blob-teal -left-24 top-10 h-80 w-80 animate-float bg-brand-teal-light/25" aria-hidden="true"></span>
      <span class="blob-navy -right-24 bottom-0 h-96 w-96 animate-pulse-soft bg-white/10" aria-hidden="true"></span>

      <div class="relative z-10 w-full max-w-xl">
        <div class="glass animate-scale-in rounded-3xl p-8 md:p-10">
          <div class="mb-8 text-center">
            <div class="mb-4 flex justify-center">
              <ui-logo size="md" />
            </div>
            <h1 class="mb-2 text-2xl font-bold tracking-tight text-brand-navy">
              Complete seu perfil
            </h1>
            <p class="text-sm leading-relaxed text-slate-500">
              Faltam poucos dados para liberar sua trilha. Leva menos de um minuto.
            </p>
          </div>

          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
            <ui-input
              label="Nome Completo"
              placeholder="Como você quer ser chamado(a)"
              formControlName="name"
              [error]="errors().name" />

            <ui-input
              label="Bio / Resumo Profissional"
              placeholder="Conte em poucas linhas sua atuação em RH"
              [multiline]="true"
              [rows]="4"
              formControlName="bio"
              [error]="errors().bio" />

            <ui-input
              label="Telefone"
              type="tel"
              placeholder="(11) 90000-0000"
              formControlName="phone"
              [error]="errors().phone" />

            <ui-input
              label="LinkedIn (opcional)"
              placeholder="linkedin.com/in/seu-perfil"
              formControlName="linkedin"
              [error]="errors().linkedin" />

            @if (errorMessage()) {
              <p role="alert" class="rounded-xl bg-state-danger/10 px-4 py-3 text-sm font-medium text-state-danger">
                {{ errorMessage() }}
              </p>
            }

            <ui-button variant="primary" type="submit" [fullWidth]="true" [loading]="isLoading()">
              Concluir cadastro
            </ui-button>
          </form>
        </div>
      </div>

      @if (isLoading()) {
        <ui-loading-overlay message="Salvando seu perfil" />
      }
    </main>
  `,
})
export class Onboarding {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    bio: ['', [Validators.required, Validators.maxLength(600)]],
    phone: ['', [Validators.required, Validators.maxLength(30)]],
    linkedin: ['', [Validators.maxLength(200), Validators.pattern(LINKEDIN)]],
  });

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  /** Erros so aparecem depois da primeira tentativa de envio. */
  private readonly submitted = signal(false);

  /** Reexecuta o `errors` a cada digitacao, para o aviso sumir ao corrigir. */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly errors = computed(() => {
    this.value();

    if (!this.submitted()) {
      return { name: '', bio: '', phone: '', linkedin: '' };
    }

    const { name, bio, phone, linkedin } = this.form.controls;

    return {
      name: messageFor(name, 'Informe seu nome completo.'),
      bio: messageFor(bio, 'Escreva um resumo da sua atuação.'),
      phone: messageFor(phone, 'Informe um telefone para contato.'),
      linkedin: messageFor(linkedin, ''),
    };
  });

  submit(): void {
    this.submitted.set(true);
    this.errorMessage.set('');

    if (this.form.invalid || this.isLoading()) {
      return;
    }

    const { name, bio, phone, linkedin } = this.form.getRawValue();

    this.isLoading.set(true);

    this.users
      .updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
        linkedin: linkedin.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          void this.router.navigateByUrl(this.auth.homeUrl());
        },
        error: (message: string) => {
          this.isLoading.set(false);
          this.errorMessage.set(message);
        },
      });
  }
}
