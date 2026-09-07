import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { Button } from '../../../shared/ui/button/button';
import { Input } from '../../../shared/ui/input/input';
import { Modal } from '../../../shared/ui/modal/modal';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Compara os e-mails ignorando caixa e espacos nas pontas. */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Formulario modal de solicitacao de acesso: o usuario informa o e-mail duas
 * vezes e o Firebase envia o link de definicao de senha.
 */
@Component({
  selector: 'app-create-account-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, Button, Input],
  template: `
    <ui-modal
      title="Criar nova conta"
      description="Informe seu e-mail duas vezes. Enviaremos um link para você definir sua senha."
      (closed)="closed.emit()">
      <form (submit)="$event.preventDefault(); submit()" class="flex flex-col gap-4" novalidate>
        <ui-input
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          [(value)]="email"
          [error]="showErrors() ? emailError() : ''" />

        <ui-input
          label="Confirme seu e-mail"
          type="email"
          placeholder="seu@email.com"
          [(value)]="confirmEmail"
          [error]="showErrors() ? confirmError() : ''" />

        <ui-button variant="primary" type="submit" [fullWidth]="true">
          Enviar link de acesso
        </ui-button>
        <ui-button variant="outline" (click)="closed.emit()" [fullWidth]="true">Cancelar</ui-button>
      </form>
    </ui-modal>
  `,
})
export class CreateAccountModal {
  readonly closed = output<void>();
  /** E-mail ja normalizado, emitido apenas quando o formulario e valido. */
  readonly submitted = output<string>();

  readonly email = signal('');
  readonly confirmEmail = signal('');

  /** Erros so aparecem depois da primeira tentativa de envio. */
  readonly showErrors = signal(false);

  readonly emailError = computed(() => {
    const value = normalize(this.email());

    if (!value) {
      return 'Informe seu e-mail.';
    }

    return EMAIL_PATTERN.test(value) ? '' : 'Informe um e-mail válido.';
  });

  readonly confirmError = computed(() => {
    const confirmation = normalize(this.confirmEmail());

    if (!confirmation) {
      return 'Confirme seu e-mail.';
    }

    return confirmation === normalize(this.email()) ? '' : 'Os e-mails não são iguais.';
  });

  readonly isValid = computed(() => !this.emailError() && !this.confirmError());

  submit() {
    this.showErrors.set(true);

    if (!this.isValid()) {
      return;
    }

    this.submitted.emit(normalize(this.email()));
  }
}
