import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { AuthService } from '../../../core/services/auth.service';
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
      @if (sentMessage()) {
        <div class="flex flex-col gap-4">
          <p class="rounded-xl bg-state-success/10 px-4 py-3 text-sm font-medium text-state-success">
            {{ sentMessage() }}
          </p>
          <ui-button variant="primary" (click)="closed.emit()" [fullWidth]="true">Voltar ao login</ui-button>
        </div>
      } @else {
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

        @if (errorMessage()) {
          <p role="alert" class="rounded-xl bg-state-danger/10 px-4 py-3 text-sm font-medium text-state-danger">
            {{ errorMessage() }}
          </p>
        }

        <ui-button
          variant="primary"
          type="submit"
          [fullWidth]="true"
          [loading]="isSending()"
          [disabled]="isSending()">
          Enviar link de acesso
        </ui-button>
        <ui-button variant="outline" (click)="closed.emit()" [fullWidth]="true">Cancelar</ui-button>
      </form>
      }
    </ui-modal>
  `,
})
export class CreateAccountModal {
  private readonly auth = inject(AuthService);
  private readonly analytics = inject(AnalyticsService);

  readonly closed = output<void>();
  /** E-mail ja normalizado, emitido apenas quando o formulario e valido. */
  readonly submitted = output<string>();

  readonly isSending = signal(false);
  readonly errorMessage = signal('');
  readonly sentMessage = signal('');

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

    if (!this.isValid() || this.isSending()) {
      return;
    }

    const email = normalize(this.email());

    this.isSending.set(true);
    this.errorMessage.set('');

    this.auth.requestAccount(email).subscribe({
      next: message => {
        this.isSending.set(false);
        this.sentMessage.set(message);

        // So conta como lead o pedido que a API aceitou — disparar no clique
        // contaria tambem e-mail invalido e erro de rede. O endereco em si nao
        // vai junto: e dado pessoal, e a medicao nao precisa dele.
        this.analytics.track('generate_lead', { form: 'solicitar_acesso' });

        this.submitted.emit(email);
      },
      error: (message: string) => {
        this.isSending.set(false);
        this.errorMessage.set(message);
      },
    });
  }
}
