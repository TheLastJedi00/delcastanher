import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
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

  submit() {
    this.email.markAsTouched();
    this.emailError.set(this.validationMessage());

    if (this.email.invalid) {
      return;
    }

    this.users
      .addAdmin(this.email.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => this.added.emit(result));
  }

  private validationMessage(): string {
    if (this.email.hasError('required')) {
      return 'Informe o e-mail.';
    }

    return this.email.hasError('email') ? 'Informe um e-mail válido.' : '';
  }
}
