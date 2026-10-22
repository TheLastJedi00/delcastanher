import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AdminFinanceService, TestPaymentStatus } from '../../../core/services/admin-finance.service';
import { formatPrice } from '../../../core/services/store.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';

/**
 * Modulo de teste de pagamento no Financeiro (Spec 030).
 *
 * O toggle liga o modulo de teste de R$ 1,00 e mostra o link secreto que leva
 * a pagina dele. So admin paga por esse link, e desligar o invalida: religar
 * gera outro.
 */
@Component({
  selector: 'app-pagamento-teste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card],
  template: `
    <ui-card variant="default" padding="lg" [hover]="false">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-xl">
          <h3 class="text-lg font-semibold text-brand-navy" id="pagamento-teste-titulo">
            Pagamento de teste
          </h3>
          <p class="mt-1 text-sm text-slate-600">
            Um módulo de teste de {{ price() }} para testar o pagamento em produção, com cartão real
            ou PIX. Ele não libera aulas, não emite nota fiscal e fica fora da receita. O valor é
            estornado pelo Mercado Pago.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          data-testid="toggle-teste"
          aria-labelledby="pagamento-teste-titulo"
          [attr.aria-checked]="enabled()"
          [disabled]="busy() || loading()"
          (click)="toggle()"
          class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal disabled:opacity-50"
          [class.bg-brand-teal]="enabled()"
          [class.bg-slate-300]="!enabled()">
          <span
            class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
            [class.translate-x-6]="enabled()"
            [class.translate-x-1]="!enabled()"></span>
        </button>
      </div>

      @if (error(); as message) {
        <p class="mt-4 text-sm text-state-danger" role="alert">{{ message }}</p>
      }

      @if (link(); as url) {
        <div class="mt-5" data-testid="link-teste">
          <label for="link-teste-valor" class="block text-xs font-bold uppercase tracking-widest text-slate-500">
            Link secreto
          </label>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <input
              id="link-teste-valor"
              readonly
              [value]="url"
              class="min-w-0 flex-1 rounded-xl border border-brand-navy/10 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
            <ui-button variant="outline" size="sm" (click)="copy(url)">
              {{ copied() ? 'Link copiado' : 'Copiar link' }}
            </ui-button>
          </div>
          <p class="mt-2 text-xs text-slate-500">
            Só uma conta de admin com este link consegue pagar o módulo de teste. Desligue para
            invalidar o link.
          </p>
        </div>
      }
    </ui-card>
  `,
})
export class PagamentoTeste implements OnInit {
  private readonly finance = inject(AdminFinanceService);

  private readonly status = signal<TestPaymentStatus | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly enabled = computed(() => this.status()?.enabled ?? false);
  protected readonly price = computed(() => formatPrice(this.status()?.priceCents ?? 100));
  protected readonly link = computed(() => {
    const key = this.status()?.accessKey;

    return key ? `${window.location.origin}/loja/teste/${key}` : null;
  });

  ngOnInit(): void {
    this.finance.testPayment().subscribe({
      next: status => {
        this.status.set(status);
        this.loading.set(false);
      },
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }

  protected toggle(): void {
    this.busy.set(true);
    this.error.set(null);
    this.copied.set(false);

    this.finance.setTestPayment(!this.enabled()).subscribe({
      next: status => {
        this.status.set(status);
        this.busy.set(false);
      },
      error: (message: string) => {
        this.error.set(message);
        this.busy.set(false);
      },
    });
  }

  protected copy(url: string): void {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => this.copied.set(true))
      .catch(() => undefined);
  }
}
