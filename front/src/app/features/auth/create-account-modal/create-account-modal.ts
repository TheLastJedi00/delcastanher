import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { Button } from '../../../shared/ui/button/button';
import { Modal } from '../../../shared/ui/modal/modal';

/**
 * Formulario modal de solicitacao de acesso: o usuario informa o e-mail e o
 * Firebase envia o link de definicao de senha.
 */
@Component({
  selector: 'app-create-account-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, Button],
  template: `
    <ui-modal
      title="Criar nova conta"
      description="Informe seu e-mail. Enviaremos um link para você definir sua senha."
      (closed)="closed.emit()">
      <form (submit)="$event.preventDefault(); submit()" class="flex flex-col gap-4">
        <ui-button variant="primary" type="submit" [fullWidth]="true">Enviar link de acesso</ui-button>
        <ui-button variant="outline" (click)="closed.emit()" [fullWidth]="true">Cancelar</ui-button>
      </form>
    </ui-modal>
  `,
})
export class CreateAccountModal {
  readonly closed = output<void>();

  submit() {
    // Campos e validacao entram na Task 3.3; o envio, na Task 3.4.
  }
}
