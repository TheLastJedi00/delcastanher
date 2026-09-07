import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { BackLink } from '../../shared/ui/back-link/back-link';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Input } from '../../shared/ui/input/input';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

/** Aceita o endereco com ou sem protocolo; a API normaliza para https://. */
const LINKEDIN = /^(https?:\/\/)?([\w-]+\.)*linkedin\.com\/.+$/i;

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

/**
 * Edicao do perfil ja persistido. Usa o mesmo `PATCH /users/me` do onboarding
 * - uma unica rota de escrita, entao as duas telas nunca divergem sobre o que
 * e um perfil valido.
 */
@Component({
  selector: 'app-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageContainer, BackLink, SectionHeader, Card, Avatar, Input, Button],
  template: `
    <ui-page-container maxWidth="sm">
      <div class="mb-6">
        <ui-back-link />
      </div>

      <div class="mb-6">
        <ui-section-header overline="Sua conta" title="Meu Perfil" />
      </div>

      <ui-card variant="default" padding="lg" [hover]="false">
        <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-6">
          <div class="flex items-center gap-6">
            <ui-avatar [initials]="users.initials()" size="lg" />
            <div>
              <p class="font-semibold text-brand-navy">{{ users.displayName() }}</p>
              <p class="text-sm text-slate-500">{{ email() }}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ui-input label="Nome Completo" formControlName="name" [error]="errors().name" />
            <ui-input label="Telefone" type="tel" formControlName="phone" [error]="errors().phone" />
          </div>

          <ui-input
            label="Bio / Resumo Profissional"
            [multiline]="true"
            [rows]="4"
            formControlName="bio"
            [error]="errors().bio" />

          <ui-input
            label="LinkedIn (opcional)"
            placeholder="linkedin.com/in/seu-perfil"
            formControlName="linkedin"
            [error]="errors().linkedin" />

          @if (saved()) {
            <p class="rounded-xl bg-state-success/10 px-4 py-3 text-sm font-medium text-state-success">
              Alterações salvas.
            </p>
          }

          @if (errorMessage()) {
            <p role="alert" class="rounded-xl bg-state-danger/10 px-4 py-3 text-sm font-medium text-state-danger">
              {{ errorMessage() }}
            </p>
          }

          <div class="flex justify-end">
            <ui-button variant="primary" type="submit" [loading]="isSaving()">
              Salvar Alterações
            </ui-button>
          </div>
        </form>
      </ui-card>
    </ui-page-container>
  `,
})
export class Perfil {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly users = inject(UserService);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    bio: ['', [Validators.required, Validators.maxLength(600)]],
    phone: ['', [Validators.required, Validators.maxLength(30)]],
    linkedin: ['', [Validators.maxLength(200), Validators.pattern(LINKEDIN)]],
  });

  readonly isSaving = signal(false);
  readonly saved = signal(false);
  readonly errorMessage = signal('');

  /** O e-mail vem do Firebase e nao e editavel por aqui. */
  readonly email = computed(() => this.users.profile()?.email ?? '');

  private readonly submitted = signal(false);

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

  constructor() {
    // O perfil pode chegar depois da tela (reload direto em /ava/perfil):
    // o effect preenche o formulario assim que o estado global e populado.
    effect(() => {
      const profile = this.users.profile();

      if (profile) {
        this.form.patchValue({
          name: profile.name ?? '',
          bio: profile.bio ?? '',
          phone: profile.phone ?? '',
          linkedin: profile.linkedin ?? '',
        });
      }
    });

    this.users.ensureProfile().subscribe();
  }

  save(): void {
    this.submitted.set(true);
    this.saved.set(false);
    this.errorMessage.set('');

    if (this.form.invalid || this.isSaving()) {
      return;
    }

    const { name, bio, phone, linkedin } = this.form.getRawValue();

    this.isSaving.set(true);

    this.users
      .updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
        linkedin: linkedin.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.saved.set(true);
        },
        error: (message: string) => {
          this.isSaving.set(false);
          this.errorMessage.set(message);
        },
      });
  }
}
