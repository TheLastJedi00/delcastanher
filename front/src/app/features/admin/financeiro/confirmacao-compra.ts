import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, signal } from '@angular/core';
import { AdminPurchaseEmailService } from '../../../core/services/admin-purchase-email.service';
import { FinanceOrderStatus } from '../../../core/services/admin-finance.service';
import { Button } from '../../../shared/ui/button/button';

/** Data e hora no fuso da empresa, como o resto do financeiro. */
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/**
 * E-mail "Compra confirmada" de um pedido na listagem do financeiro (Spec 024,
 * Task 3.4): quando saiu, ou que nao saiu, e o reenvio.
 *
 * So pedido pago tem confirmacao. "Nao enviado" num pedido pago e o caso que
 * pede atencao: o Resend recusou, a chave nao estava configurada, ou o pedido e
 * de antes da Spec 024.
 */
@Component({
  selector: 'app-confirmacao-compra',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    <div class="flex flex-col items-start gap-1.5" data-testid="confirmacao-compra">
      @if (orderStatus() === 'PAID') {
        @if (sentAt(); as sent) {
          <span class="text-xs text-slate-600">Enviado em {{ format(sent) }}</span>
        } @else {
          <span class="text-xs font-semibold text-state-warning">Não enviado</span>
        }
        <ui-button variant="ghost" size="sm" [loading]="busy()" (click)="resend()">
          {{ sentAt() ? 'Reenviar confirmação' : 'Enviar confirmação' }}
        </ui-button>
      } @else {
        <span class="text-xs text-slate-400">—</span>
      }

      @if (error()) {
        <p class="max-w-[16rem] text-xs text-state-danger" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="max-w-[16rem] text-xs text-state-success" role="status">{{ notice() }}</p>
      }
    </div>
  `,
})
export class ConfirmacaoCompra {
  private readonly purchaseEmail = inject(AdminPurchaseEmailService);

  readonly orderId = input.required<string>();
  readonly orderStatus = input.required<FinanceOrderStatus>();
  readonly emailedAt = input<string | null>(null);

  /** Comeca no valor da listagem e passa a valer o do reenvio. */
  protected readonly sentAt = linkedSignal(() => this.emailedAt());
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected format(iso: string): string {
    return DATE_TIME.format(new Date(iso));
  }

  protected resend(): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');

    this.purchaseEmail.resend(this.orderId()).subscribe({
      next: ({ confirmationEmailedAt }) => {
        this.busy.set(false);
        this.sentAt.set(confirmationEmailedAt);
        this.notice.set('Confirmação enviada.');
      },
      error: (message: string) => {
        this.busy.set(false);
        this.error.set(message);
      },
    });
  }
}
