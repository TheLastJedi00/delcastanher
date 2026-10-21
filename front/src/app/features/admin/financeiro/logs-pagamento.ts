import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { AdminFinanceService, PaymentLogLine } from '../../../core/services/admin-finance.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Modal } from '../../../shared/ui/modal/modal';

/** Data e hora com segundos, no fuso da empresa: a linha do tempo e de segundos. */
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** Etapa em palavras do gestor, e nao no codigo do log. */
const STAGE_LABEL: Record<string, string> = {
  create_order: 'Cobrança no Mercado Pago',
  get_order: 'Consulta do pedido',
  webhook: 'Aviso do Mercado Pago',
  sdk_load: 'Carregar o Mercado Pago',
  secure_fields: 'Campos do cartão',
  payment_method: 'Bandeira do cartão',
  installments: 'Parcelas',
  tokenize: 'Dados do cartão',
};

const LEVEL: Record<PaymentLogLine['level'], { label: string; variant: 'danger' | 'warning' | 'teal' }> = {
  ERROR: { label: 'Erro', variant: 'danger' },
  WARNING: { label: 'Aviso', variant: 'warning' },
  INFO: { label: 'Info', variant: 'teal' },
};

/**
 * Modal "Logs do pagamento" do financeiro (Spec 028, decisao 8).
 *
 * Linha do tempo de uma tentativa de pagamento: o que o servidor e o navegador
 * do comprador registraram, do mais antigo ao mais novo. So leitura. O corpo
 * do Mercado Pago vem limpo da API, sem token do cartao nem dados do pagador.
 */
@Component({
  selector: 'app-logs-pagamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, Badge],
  template: `
    <ui-modal
      title="Logs do pagamento"
      [description]="'Pedido ' + orderId()"
      size="lg"
      (closed)="closed.emit()">
      @if (loading()) {
        <p class="text-sm text-slate-500" role="status">Carregando os logs…</p>
      } @else if (error(); as message) {
        <p class="text-sm text-state-danger" role="alert">{{ message }}</p>
      } @else if (lines().length === 0) {
        <p class="text-sm text-slate-600" data-testid="logs-vazio">
          Nenhum log registrado para este pedido.
        </p>
      } @else {
        <ol class="space-y-4" data-testid="logs-linha-do-tempo">
          @for (line of lines(); track line.id) {
            <li class="rounded-2xl border border-brand-navy/8 bg-white/70 p-4">
              <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span class="font-mono">{{ format(line.createdAt) }}</span>
                <ui-badge [variant]="level(line).variant" [label]="level(line).label" />
                <span>{{ line.source === 'API' ? 'Servidor' : 'Navegador' }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ stage(line.stage) }}</span>
                @if (line.httpStatus !== null) {
                  <span aria-hidden="true">·</span>
                  <span>HTTP {{ line.httpStatus }}</span>
                }
                @if (line.environment === 'sandbox') {
                  <span class="rounded-full bg-state-warning/10 px-2 text-state-warning">teste</span>
                }
              </div>

              <p class="mt-2 text-sm text-slate-800">{{ line.message }}</p>

              @if (line.mpStatus || line.mpStatusDetail) {
                <p class="mt-1 text-xs text-slate-600">
                  Mercado Pago: {{ line.mpStatus ?? '—' }} / {{ line.mpStatusDetail ?? '—' }}
                  @if (line.mpOrderId) {
                    · <span class="font-mono">{{ line.mpOrderId }}</span>
                  }
                </p>
              }

              @if (line.detail) {
                <details class="mt-2">
                  <summary class="cursor-pointer text-xs font-semibold text-brand-teal-deep">
                    Ver detalhe
                  </summary>
                  <pre class="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{{ json(line.detail) }}</pre>
                </details>
              }
            </li>
          }
        </ol>
      }
    </ui-modal>
  `,
})
export class LogsPagamento implements OnInit {
  private readonly finance = inject(AdminFinanceService);

  readonly orderId = input.required<string>();
  readonly closed = output<void>();

  protected readonly lines = signal<PaymentLogLine[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.finance.orderLogs(this.orderId()).subscribe({
      next: lines => {
        this.lines.set(lines);
        this.loading.set(false);
      },
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }

  protected format(iso: string): string {
    return DATE_TIME.format(new Date(iso));
  }

  protected stage(stage: string): string {
    return STAGE_LABEL[stage] ?? stage;
  }

  protected level(line: PaymentLogLine) {
    return LEVEL[line.level];
  }

  protected json(detail: unknown): string {
    return JSON.stringify(detail, null, 2);
  }
}
