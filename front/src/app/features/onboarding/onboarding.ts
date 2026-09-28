import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { REDIRECT_PARAM, safeRedirect } from '../../core/guards/safe-redirect';
import { AuthService } from '../../core/services/auth.service';
import {
  LEGAL_DOCUMENT_PATHS,
  LEGAL_DOCUMENT_TITLES,
  LegalDocumentsService,
  PolicyStatus,
} from '../../core/services/legal-documents.service';
import { PolicyVersionConflict, UserService } from '../../core/services/user.service';
import { Button } from '../../shared/ui/button/button';
import { Checkbox } from '../../shared/ui/checkbox/checkbox';
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
  imports: [ReactiveFormsModule, RouterLink, Logo, Input, Button, Checkbox, LoadingOverlay],
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

            <!-- Spec 015, decisao 10: nasce desmarcado e os documentos abrem em
                 aba nova. Caixa pre-marcada nao e consentimento livre e
                 inequivoco, e perder o formulario ja preenchido para ler a
                 politica faria a leitura custar caro. -->
            <!-- Spec 022, decisao 6: o rotulo lista so o que esta publicado.
                 Pedir aceite de um texto que nao existe nao e consentimento. -->
            @if (policy()) {
              <ui-checkbox formControlName="policyAccepted" [error]="errors().policyAccepted">
                <!-- A pontuacao encosta nos links de proposito: espaco entre o
                     fim do bloco e a virgula apareceria na tela. -->
                Li e aceito
                @for (doc of policies(); track doc.kind; let first = $first) {
                  {{ first ? 'a' : 'e a' }}
                  <a
                    [routerLink]="doc.path"
                    target="_blank"
                    class="font-semibold text-brand-teal-deep underline underline-offset-2"
                    >{{ doc.title }}</a
                  >}@if (hasTerms()) {, e declaro estar ciente das condições descritas nos
                  <a
                    routerLink="/termos-de-uso"
                    target="_blank"
                    class="font-semibold text-brand-teal-deep underline underline-offset-2"
                    >Termos de Uso</a
                  >}.
              </ui-checkbox>
            } @else {
              <p class="text-sm text-slate-500" role="status">Carregando os documentos para o aceite…</p>
            }

            @if (errorMessage()) {
              <p role="alert" class="rounded-xl bg-state-danger/10 px-4 py-3 text-sm font-medium text-state-danger">
                {{ errorMessage() }}
              </p>
            }

            <ui-button
              variant="primary"
              type="submit"
              [fullWidth]="true"
              [loading]="isLoading()"
              [disabled]="!policy() || !form.controls.policyAccepted.value">
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
  private readonly route = inject(ActivatedRoute);
  private readonly legal = inject(LegalDocumentsService);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    bio: ['', [Validators.required, Validators.maxLength(600)]],
    phone: ['', [Validators.required, Validators.maxLength(30)]],
    linkedin: ['', [Validators.maxLength(200), Validators.pattern(LINKEDIN)]],
    // `requiredTrue`: marcado e a unica forma valida. A API tambem recusa
    // concluir o onboarding sem aceite — teto de UI que o servidor nao valida
    // nao e teto (Spec 015, decisao 9).
    policyAccepted: [false, Validators.requiredTrue],
  });

  readonly isLoading = signal(false);
  /**
   * Versao da politica vigente e documentos publicados (Spec 022, decisoes 6
   * e 7). O aceite grava esta versao, e a API recusa qualquer outra.
   */
  readonly policy = signal<PolicyStatus | null>(null);
  readonly errorMessage = signal('');

  /** Politicas publicadas, na ordem do aceite: Privacidade e Cookies. */
  protected readonly policies = computed(() =>
    (this.policy()?.published ?? [])
      .filter(kind => kind !== 'TERMS')
      .map(kind => ({ kind, title: LEGAL_DOCUMENT_TITLES[kind], path: LEGAL_DOCUMENT_PATHS[kind] })),
  );

  /** Os Termos so entram no aceite depois de publicados (decisao 6). */
  protected readonly hasTerms = computed(() => this.policy()?.published.includes('TERMS') ?? false);

  /** Erros so aparecem depois da primeira tentativa de envio. */
  private readonly submitted = signal(false);

  /** Reexecuta o `errors` a cada digitacao, para o aviso sumir ao corrigir. */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly errors = computed(() => {
    this.value();

    if (!this.submitted()) {
      return { name: '', bio: '', phone: '', linkedin: '', policyAccepted: '' };
    }

    const { name, bio, phone, linkedin, policyAccepted } = this.form.controls;

    return {
      name: messageFor(name, 'Informe seu nome completo.'),
      bio: messageFor(bio, 'Escreva um resumo da sua atuação.'),
      phone: messageFor(phone, 'Informe um telefone para contato.'),
      linkedin: messageFor(linkedin, ''),
      policyAccepted: policyAccepted.hasError('required')
        ? 'É necessário aceitar a Política de Privacidade para concluir o cadastro.'
        : '',
    };
  });

  constructor() {
    this.loadPolicy();
  }

  submit(): void {
    this.submitted.set(true);
    this.errorMessage.set('');

    if (this.form.invalid || this.isLoading()) {
      return;
    }

    const policy = this.policy();

    if (!policy?.version) {
      this.errorMessage.set('Não foi possível carregar os documentos para o aceite. Tente de novo em instantes.');
      this.loadPolicy();

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
        // Na mesma requisicao do perfil, de proposito: em requisicao propria, o
        // aceite poderia falhar sozinho e deixar perfil completo sem aceite
        // (Spec 015, decisao 7).
        policyAccepted: true,
        policyVersion: policy.version,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          // Destino que veio do login (Spec 019, decisao 17), ou a area da pessoa.
          const redirect = safeRedirect(this.route.snapshot.queryParamMap.get(REDIRECT_PARAM));
          void this.router.navigateByUrl(redirect ?? this.auth.homeUrl());
        },
        error: (error: string | PolicyVersionConflict) => {
          this.isLoading.set(false);

          if (error instanceof PolicyVersionConflict) {
            // A politica mudou enquanto a pessoa preenchia (decisao 7): o
            // aceite era de um texto que ja nao esta em vigor. Recarrega os
            // documentos e pede o aceite de novo, sem perder o formulario.
            this.form.controls.policyAccepted.setValue(false);
            this.policy.set(null);
            this.loadPolicy();
            this.errorMessage.set(
              'Os documentos foram atualizados enquanto você preenchia. Leia a versão vigente e marque o aceite de novo para concluir.',
            );

            return;
          }

          this.errorMessage.set(error);
        },
      });
  }

  /** Le a versao vigente direto da rede: o aceite precisa ser da atual. */
  private loadPolicy(): void {
    this.legal.policyStatus(true).subscribe({
      next: status => this.policy.set(status),
      error: () => undefined,
    });
  }
}
