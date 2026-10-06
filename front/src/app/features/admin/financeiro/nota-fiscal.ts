import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import {
  AdminInvoicesService,
  InvoiceSettings,
  InvoiceStatus,
  InvoiceSummary,
} from '../../../core/services/admin-invoices.service';
import { Badge, BadgeVariant } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Modal } from '../../../shared/ui/modal/modal';

const STATUS: Record<InvoiceStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Na fila', variant: 'warning' },
  PROCESSING: { label: 'Processando', variant: 'warning' },
  UNKNOWN: { label: 'Verificar', variant: 'danger' },
  AUTHORIZED: { label: 'Autorizada', variant: 'success' },
  DENIED: { label: 'Rejeitada', variant: 'danger' },
  ERROR: { label: 'Erro', variant: 'danger' },
  CANCELLING: { label: 'Cancelando', variant: 'warning' },
  CANCELLED: { label: 'Cancelada', variant: 'navy' },
  CANCEL_ERROR: { label: 'Erro ao cancelar', variant: 'danger' },
  REFUND_PENDING: { label: 'Estorno fora do prazo', variant: 'danger' },
};

/** O dialogo aberto, quando ha um. */
type Dialog = 'reissue-unknown' | 'link' | 'cancel' | null;

/**
 * Nota fiscal (NFS-e, Spec 024.2) de um pedido na listagem do financeiro
 * (Spec 023, decisao A9):
 * selo da situacao, numero e as acoes que a situacao permite.
 *
 * `UNKNOWN` e `REFUND_PENDING` saem com destaque e um texto que diz o que
 * fazer: sao as duas situacoes em que a plataforma parou e espera uma pessoa
 * (decisoes A2 e A7).
 */
@Component({
  selector: 'app-nota-fiscal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Badge, Button, Modal],
  template: `
    <div class="flex flex-col items-start gap-1.5" data-testid="nota-fiscal">
      @if (invoice(); as nota) {
        <div class="flex flex-wrap items-center gap-1.5">
          <ui-badge [variant]="status().variant" [label]="status().label" />
          @if (nota.environment !== 'producao') {
            <ui-badge variant="navy" label="Homologação" data-testid="selo-homologacao" />
          }
        </div>
        @if (nota.number) {
          <span class="text-xs text-slate-600">NFS-e nº {{ nota.number }}</span>
        }
        @if (nota.status === 'UNKNOWN') {
          <p class="max-w-[16rem] rounded-lg bg-state-danger/5 px-2 py-1 text-xs text-state-danger" data-testid="destaque">
            A emissão saiu sem resposta. Verifique no painel da Notaas se a nota existe.
          </p>
        }
        @if (nota.status === 'REFUND_PENDING') {
          <p class="max-w-[16rem] rounded-lg bg-state-danger/5 px-2 py-1 text-xs text-state-danger" data-testid="destaque">
            Estorno fora do prazo de cancelamento: a nota não pode mais ser cancelada direto no sistema. Tratar com a contadora.
          </p>
        }
        @if (nota.lastError && showsError()) {
          <p class="max-w-[16rem] break-words text-xs text-slate-500" [title]="nota.lastError">
            {{ nota.lastError }}
          </p>
        }
      } @else {
        <span class="text-xs text-slate-400">Sem nota</span>
      }

      <div class="flex flex-wrap gap-1">
        @for (action of actions(); track action.id) {
          <ui-button variant="ghost" size="sm" [loading]="busy() === action.id" [disabled]="!!busy()" (click)="run(action.id)">
            {{ action.label }}
          </ui-button>
        }
      </div>

      @if (error()) {
        <p class="max-w-[16rem] text-xs text-state-danger" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="max-w-[16rem] text-xs text-state-success" role="status">{{ notice() }}</p>
      }
    </div>

    @if (dialog() === 'reissue-unknown') {
      <ui-modal title="Emitir a nota de novo?" (closed)="dialog.set(null)">
        <p class="text-sm text-slate-600">
          Nada garante que a Notaas recuse a segunda emissão do mesmo pedido: se a nota anterior foi
          enfileirada, emitir de novo gera <strong>duas NFS-e válidas</strong>. Abra o painel da Notaas
          e confira que não existe nota para este pedido. Se existir, use "Vincular nota".
        </p>
        <label class="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" [formControl]="confirmControl" class="mt-1" data-testid="confirmar-sem-nota" />
          Conferi no painel da Notaas: não existe nota para este pedido.
        </label>
        <div class="mt-6 flex justify-end gap-3">
          <ui-button variant="ghost" (click)="dialog.set(null)">Cancelar</ui-button>
          <ui-button variant="primary" [disabled]="!confirmControl.value" [loading]="!!busy()" (click)="reissueConfirmed()">
            Emitir de novo
          </ui-button>
        </div>
      </ui-modal>
    }

    @if (dialog() === 'link') {
      <ui-modal title="Vincular nota existente" (closed)="dialog.set(null)">
        <label for="invoice-id-{{ orderId() }}" class="block text-sm text-slate-700">
          invoiceId da nota no painel da Notaas
        </label>
        <input
          id="invoice-id-{{ orderId() }}"
          [formControl]="invoiceIdControl"
          class="mt-1 w-full rounded-xl border border-brand-navy/15 px-3 py-2 font-mono text-sm"
          data-testid="invoice-id" />
        <div class="mt-6 flex justify-end gap-3">
          <ui-button variant="ghost" (click)="dialog.set(null)">Cancelar</ui-button>
          <ui-button variant="primary" [disabled]="invoiceIdControl.invalid" [loading]="!!busy()" (click)="linkConfirmed()">
            Vincular
          </ui-button>
        </div>
      </ui-modal>
    }

    @if (dialog() === 'cancel') {
      <ui-modal title="Cancelar a NFS-e?" (closed)="dialog.set(null)">
        <p class="text-sm text-slate-600">
          O cancelamento vai ao Sistema Nacional da NFS-e e não pode ser desfeito. Use para uma nota emitida em
          duplicidade ou por engano. O estorno do pagamento continua sendo feito no Mercado Pago.
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <ui-button variant="ghost" (click)="dialog.set(null)">Voltar</ui-button>
          <ui-button variant="danger" [loading]="!!busy()" (click)="cancelConfirmed()">Cancelar a nota</ui-button>
        </div>
      </ui-modal>
    }
  `,
})
export class NotaFiscal {
  private readonly invoices = inject(AdminInvoicesService);

  readonly orderId = input.required<string>();
  readonly orderStatus = input.required<string>();
  readonly invoice = input<InvoiceSummary | null>(null);
  readonly settings = input<InvoiceSettings | null>(null);

  /** A nota mudou: a listagem recarrega. */
  readonly changed = output<void>();

  readonly busy = signal<string | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly dialog = signal<Dialog>(null);

  readonly confirmControl = new FormControl(false, { nonNullable: true });
  readonly invoiceIdControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });

  readonly status = computed(() => STATUS[this.invoice()?.status ?? 'PENDING']);

  readonly showsError = computed(() =>
    ['ERROR', 'DENIED', 'UNKNOWN', 'CANCEL_ERROR'].includes(this.invoice()?.status ?? ''),
  );

  /** O que esta situacao permite (decisao A9). */
  readonly actions = computed(() => {
    const nota = this.invoice();
    const enabled = this.settings()?.enabled ?? false;
    const list: { id: string; label: string }[] = [];

    if (!nota) {
      if (enabled && this.orderStatus() === 'PAID') {
        list.push({ id: 'issue', label: 'Emitir nota' });
      }

      return list;
    }

    switch (nota.status) {
      case 'ERROR':
      case 'DENIED':
        if (enabled) list.push({ id: 'issue', label: 'Emitir de novo' });
        break;
      case 'UNKNOWN':
        if (enabled) {
          list.push({ id: 'link', label: 'Vincular nota' });
          list.push({ id: 'reissue-unknown', label: 'Emitir de novo' });
        }
        break;
      case 'PROCESSING':
      case 'CANCELLING':
        if (enabled) list.push({ id: 'sync', label: 'Atualizar' });
        break;
      case 'AUTHORIZED':
        if (nota.hasPdf) list.push({ id: 'pdf', label: 'Baixar PDF' });
        if (nota.hasPdf) list.push({ id: 'email', label: 'Reenviar e-mail' });
        if (enabled && this.withinCancelWindow()) list.push({ id: 'cancel', label: 'Cancelar' });
        break;
      case 'CANCEL_ERROR':
        if (enabled && this.withinCancelWindow()) list.push({ id: 'cancel', label: 'Cancelar' });
        break;
      case 'CANCELLED':
        if (nota.hasPdf) list.push({ id: 'pdf', label: 'Baixar PDF' });
        break;
    }

    return list;
  });

  run(action: string): void {
    this.error.set('');
    this.notice.set('');

    switch (action) {
      case 'issue':
        this.call('issue', this.invoices.issue(this.orderId()), 'Emissão enviada à Notaas.');
        break;
      case 'sync':
        this.call('sync', this.invoices.sync(this.orderId()), 'Situação atualizada.');
        break;
      case 'email':
        this.call('email', this.invoices.resendEmail(this.orderId()), 'E-mail reenviado ao comprador.');
        break;
      case 'pdf':
        this.openPdf();
        break;
      case 'reissue-unknown':
        this.confirmControl.setValue(false);
        this.dialog.set('reissue-unknown');
        break;
      case 'link':
        this.invoiceIdControl.setValue('');
        this.dialog.set('link');
        break;
      case 'cancel':
        this.dialog.set('cancel');
        break;
    }
  }

  reissueConfirmed(): void {
    this.call('issue', this.invoices.issue(this.orderId(), true), 'Emissão enviada à Notaas.');
  }

  linkConfirmed(): void {
    this.call('link', this.invoices.link(this.orderId(), this.invoiceIdControl.value.trim()), 'Nota vinculada.');
  }

  cancelConfirmed(): void {
    this.call('cancel', this.invoices.cancel(this.orderId()), 'Cancelamento enviado à Notaas.');
  }

  private withinCancelWindow(): boolean {
    const issuedAt = this.invoice()?.issuedAt;
    const hours = this.settings()?.cancelWindowHours ?? 24;

    return !!issuedAt && Date.now() - new Date(issuedAt).getTime() < hours * 60 * 60 * 1000;
  }

  private call(id: string, request: Observable<unknown>, success: string): void {
    this.busy.set(id);
    request.subscribe({
      next: () => {
        this.busy.set(null);
        this.dialog.set(null);
        this.notice.set(success);
        this.changed.emit();
      },
      error: (message: string) => {
        this.busy.set(null);
        this.dialog.set(null);
        this.error.set(message);
      },
    });
  }

  private openPdf(): void {
    this.busy.set('pdf');
    this.invoices.pdf(this.orderId()).subscribe({
      next: ({ url }) => {
        this.busy.set(null);
        window.open(url, '_blank', 'noopener');
      },
      error: (message: string) => {
        this.busy.set(null);
        this.error.set(message);
      },
    });
  }
}
