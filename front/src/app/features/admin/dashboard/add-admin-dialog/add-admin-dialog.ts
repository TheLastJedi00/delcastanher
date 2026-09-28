import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AddAdminResult, AdminUsersService } from '../../../../core/services/admin-users.service';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';

/**
 * Adicionar administrador por e-mail (Spec 021). Um campo so: quem administra
 * nao precisa saber se a pessoa ja tem conta — a API resolve os dois casos e
 * devolve o que fez (decisao 1).
 */
@Component({
  selector: 'app-add-admin-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, Input, Button, ReactiveFormsModule],
  template: `
    <ui-modal
      title="Adicionar administrador"
      description="A pessoa passa a ter acesso ao painel administrativo."
      (closed)="closed.emit()">
      @if (result(); as done) {
        <div>
          <p class="text-sm font-semibold text-brand-navy">{{ done.email }}</p>
          <p class="mt-2 text-sm text-slate-600">{{ outcomeMessage() }}</p>
          @if (done.outcome === 'created' && !done.inviteEmailSent) {
            <p class="mt-3 text-sm text-state-danger">
              O e-mail para definir a senha não pôde ser enviado. A conta já é administradora: peça para a
              pessoa usar "Esqueci minha senha" na tela de login.
            </p>
          }
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <ui-button variant="outline" (click)="reset()">Adicionar outro</ui-button>
          <ui-button variant="primary" (click)="closed.emit()">Concluir</ui-button>
        </div>
      } @else {
      <form (ngSubmit)="submit()" novalidate>
        <ui-input
          label="E-mail"
          type="email"
          autocomplete="off"
          placeholder="nome@empresa.com"
          [formControl]="email"
          [error]="emailError()" />

        <p class="mt-3 text-xs text-slate-500">
          Se ainda não houver conta com este e-mail, ela é criada e a pessoa recebe o link para definir a senha.
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <ui-button variant="outline" (click)="closed.emit()">Cancelar</ui-button>
          <ui-button variant="primary" type="submit">Adicionar</ui-button>
        </div>
      </form>
      }
    </ui-modal>
  `,
})
export class AddAdminDialog {
  private readonly users = inject(AdminUsersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly closed = output<void>();
  /** Emitido no sucesso, para a tela recarregar a listagem. */
  readonly added = output<AddAdminResult>();

  readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });

  /** Erro do campo, so depois de tocado ou de uma tentativa de envio. */
  readonly emailError = signal('');

  /** O que a API fez; com ele preenchido, o modal mostra o resultado. */
  readonly result = signal<AddAdminResult | null>(null);

  /**
   * Cada caminho pede algo diferente de quem administra: avisar a pessoa do
   * e-mail, pedir que ela saia e entre, ou nada (decisoes 3, 6 e 7).
   */
  readonly outcomeMessage = computed(() => {
    switch (this.result()?.outcome) {
      case 'created':
        return 'Conta criada como administradora. Enviamos um e-mail para a pessoa definir a senha — avise-a de que ele vai chegar. No primeiro acesso ela passa pelo cadastro inicial antes de entrar no painel.';
      case 'promoted':
        return 'Conta promovida a administradora. O acesso ao painel aparece depois que a pessoa sair e entrar de novo na plataforma.';
      case 'already-admin':
        return 'Esta conta já era administradora. Nada foi alterado.';
      default:
        return '';
    }
  });

  submit() {
    this.email.markAsTouched();
    this.emailError.set(this.validationMessage());

    if (this.email.invalid) {
      return;
    }

    this.users
      .addAdmin(this.email.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        this.result.set(result);
        this.added.emit(result);
      });
  }

  /** Volta ao formulario vazio para adicionar outra pessoa. */
  reset() {
    this.result.set(null);
    this.email.reset();
    this.emailError.set('');
  }

  private validationMessage(): string {
    if (this.email.hasError('required')) {
      return 'Informe o e-mail.';
    }

    return this.email.hasError('email') ? 'Informe um e-mail válido.' : '';
  }
}
