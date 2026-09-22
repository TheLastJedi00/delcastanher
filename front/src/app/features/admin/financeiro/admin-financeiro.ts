import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  AdminFinanceService,
  FinanceGranularity,
  FinanceMethod,
  FinanceOrderStatus,
  FINANCE_WINDOW_DAYS,
} from '../../../core/services/admin-finance.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Input } from '../../../shared/ui/input/input';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';
import { StatCard } from '../../../shared/ui/stat-card/stat-card';
import { TimeSeriesChart, TimeSeriesPoint } from '../../../shared/ui/time-series-chart/time-series-chart';

/** Um dia em milissegundos. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto o object URL da planilha sobrevive ao clique. O navegador le o blob de
 * forma assincrona depois do `click()`; revogar no mesmo tick e uma corrida com
 * o proprio download.
 */
const REVOKE_DELAY_MS = 1_000;

/** Rotulo de cada situacao, para o admin nao ler o enum cru. */
const STATUS_LABEL: Record<FinanceOrderStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  REJECTED: 'Recusado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
  REFUNDED: 'Estornado',
};

const STATUS_VARIANT: Record<FinanceOrderStatus, 'teal' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  PAID: 'success',
  REJECTED: 'danger',
  CANCELLED: 'teal',
  EXPIRED: 'teal',
  REFUNDED: 'danger',
};

/** Rotulo do meio de pagamento. */
const METHOD_LABEL: Record<FinanceMethod, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
};

/** `2026-09-30T…` vira `2026-09-30`, que e o que o `input[type=date]` aceita. */
function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

/** O dia digitado vira instante; `end` pega o dia inteiro, ate a meia-noite seguinte. */
function fromDateInput(value: string, edge: 'start' | 'end'): string {
  const date = new Date(`${value}T00:00:00`);

  return edge === 'end' ? new Date(date.getTime() + DAY_MS).toISOString() : date.toISOString();
}

/**
 * Aba **Financeiro** do painel administrativo (Spec 016).
 *
 * Ela existe para responder uma pergunta de preco: hoje todos os modulos custam
 * o mesmo valor provisorio, e sem saber qual modulo vende, em qual metodo, e
 * quantos compradores nunca abriram o video, qualquer reajuste e palpite.
 *
 * Tres coisas nao acontecem aqui, e as tres sao deliberadas:
 *
 * 1. **Cortesia nao vira dinheiro** (decisao 1). O contador de concessoes e
 *    exibido sem valor monetario, para que o ranking de modulos nao seja lido
 *    como demanda quando parte dele foi concessao.
 * 2. **Liquido sem taxa nao vira numero** (decisao 5). Ele aparece como estado
 *    proprio — "nao apurado" —, com quantos pedidos ficaram fora de vigencia e
 *    o atalho para cadastrar a taxa.
 * 3. **Periodo sem pedido nao vira zero** (decisao 15). A tela diz que ainda
 *    nao ha vendas nesse intervalo e oferece amplia-lo, em vez de desenhar um
 *    grafico reto no zero.
 *
 * A unica escrita e o cadastro de vigencia de taxa (decisao 20): nao existe
 * botao de estornar, cancelar, reenviar cobranca ou conceder desconto — estorno
 * e contestacao seguem no painel do Mercado Pago.
 */
@Component({
  selector: 'app-admin-financeiro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Badge,
    Button,
    Card,
    Input,
    ReactiveFormsModule,
    SectionHeader,
    StatCard,
    TimeSeriesChart,
  ],
  templateUrl: './admin-financeiro.html',
})
export class AdminFinanceiro {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly finance = inject(AdminFinanceService);

  /** `painel` e o relatorio; `taxas` e o historico de vigencias e o cadastro. */
  readonly view = signal<'painel' | 'taxas'>('painel');

  /** Datas como o `input[type=date]` as escreve. */
  readonly from = signal('');
  readonly to = signal('');
  readonly granularity = signal<FinanceGranularity>('day');

  readonly search = signal('');
  readonly exporting = signal(false);
  readonly feeSaving = signal(false);
  readonly feeError = signal<string | null>(null);
  readonly feeSaved = signal(false);
  /** Id copiado ha instantes, para a tela confirmar o clique. */
  readonly copied = signal<string | null>(null);

  private readonly searchInput = new Subject<string>();

  /**
   * Cadastro de vigencia. Reativo, e nao template-driven: sao quatro campos com
   * regra propria, e o percentual e digitado em **porcentagem** para virar
   * pontos-base na submissao — o administrador pensa em 4,99%, e o banco
   * guarda 499.
   */
  readonly feeForm = this.fb.nonNullable.group({
    method: ['PIX' as FinanceMethod, Validators.required],
    percent: ['', [Validators.required, Validators.pattern(/^\d{1,3}([.,]\d{1,2})?$/)]],
    fixed: ['0', [Validators.required, Validators.pattern(/^\d{1,4}([.,]\d{1,2})?$/)]],
    validFrom: ['', Validators.required],
    note: [''],
  });

  readonly statuses = Object.entries(STATUS_LABEL) as [FinanceOrderStatus, string][];

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const fallback = this.finance.query();

    this.from.set(params.get('de') ?? toDateInput(fallback.from));
    this.to.set(params.get('ate') ?? toDateInput(fallback.to));
    this.granularity.set(params.get('granularidade') === 'month' ? 'month' : 'day');

    // A busca vai ao servidor, mas nao a cada tecla: sem o debounce, digitar um
    // e-mail dispararia uma consulta por letra.
    this.searchInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(term => {
        this.search.set(term);
        this.finance.setOrdersQuery({ search: term }).subscribe({ error: () => undefined });
      });

    // O recorte vive na URL: a tela filtrada vira link compartilhavel e
    // sobrevive ao F5, no padrao que a Spec 013 estabeleceu.
    effect(() => {
      const de = this.from();
      const ate = this.to();
      const granularidade = this.granularity();

      void this.router.navigate([], {
        relativeTo: this.route,
        replaceUrl: true,
        queryParams: {
          de,
          ate,
          granularidade: granularidade === 'day' ? null : granularidade,
        },
        queryParamsHandling: 'merge',
      });
    });

    this.applyPeriod();
  }

  /** O rotulo do periodo anterior, para a legenda: "vs. 01/08 a 31/08". */
  readonly previousLabel = computed(() => {
    const previous = this.finance.summary()?.previous;

    if (!previous) {
      return '';
    }

    return `vs. ${this.formatDate(previous.period.from)} a ${this.formatDate(
      // O `to` e exclusivo: a legenda mostra o ultimo dia que de fato entrou.
      new Date(new Date(previous.period.to).getTime() - DAY_MS).toISOString(),
    )}`;
  });

  /**
   * A seta de tendencia so aparece quando o periodo anterior teve pedido
   * (decisao 19). Sem base de comparacao ela fica de fora, em vez de mostrar
   * "+100%".
   */
  readonly trend = computed<'up' | 'down' | undefined>(() => {
    const change = this.finance.summary()?.previous?.changePercent;

    if (change === null || change === undefined) {
      return undefined;
    }

    return change >= 0 ? 'up' : 'down';
  });

  readonly trendValue = computed(() => {
    const change = this.finance.summary()?.previous?.changePercent;

    return change === null || change === undefined
      ? ''
      : `${change > 0 ? '+' : ''}${change}%`;
  });

  /** A serie de faturamento, no formato que o grafico recebe. */
  readonly chartPoints = computed<TimeSeriesPoint[]>(() =>
    this.finance.series().map(point => ({ bucket: point.bucket, valueCents: point.grossCents })),
  );

  /** Intervalo exibido na paginacao: "21 a 40 de 137". */
  readonly range = computed(() => {
    const { page, pageSize } = this.finance.ordersQuery();
    const total = this.finance.ordersTotal();

    return {
      first: total === 0 ? 0 : (page - 1) * pageSize + 1,
      last: Math.min(page * pageSize, total),
      total,
    };
  });

  /** Troca o recorte e recarrega o resumo e a lista. */
  applyPeriod() {
    const from = this.from();
    const to = this.to();

    if (!from || !to) {
      return;
    }

    this.finance
      .setQuery({
        from: fromDateInput(from, 'start'),
        to: fromDateInput(to, 'end'),
        granularity: this.granularity(),
      })
      .subscribe({ error: () => undefined });

    this.finance.loadOrders().subscribe({ error: () => undefined });
  }

  setGranularity(value: string) {
    this.granularity.set(value === 'month' ? 'month' : 'day');
    this.applyPeriod();
  }

  setFrom(value: string) {
    this.from.set(value);
    this.applyPeriod();
  }

  setTo(value: string) {
    this.to.set(value);
    this.applyPeriod();
  }

  /**
   * Amplia o intervalo, que e o que a tela oferece quando nao ha pedido nenhum
   * (decisao 15). Um periodo sem venda costuma ser um recorte curto demais, e
   * nao uma loja parada.
   */
  widenPeriod() {
    const to = new Date();

    this.from.set(toDateInput(new Date(to.getTime() - 90 * DAY_MS).toISOString()));
    this.to.set(toDateInput(to.toISOString()));
    this.applyPeriod();
  }

  onSearch(term: string) {
    this.searchInput.next(term);
  }

  filterStatus(value: string) {
    this.finance
      .setOrdersQuery({ status: (value || null) as FinanceOrderStatus | null })
      .subscribe({ error: () => undefined });
  }

  filterMethod(value: string) {
    this.finance
      .setOrdersQuery({ method: (value || null) as FinanceMethod | null })
      .subscribe({ error: () => undefined });
  }

  goToPage(page: number) {
    const target = Math.min(Math.max(1, page), this.finance.ordersTotalPages());

    this.finance.setOrdersQuery({ page: target }).subscribe({ error: () => undefined });
  }

  /** Abre a tela de taxas — tambem o atalho do estado "nao apurado". */
  openFees() {
    this.view.set('taxas');
    this.feeError.set(null);
    this.finance.loadFees().subscribe({ error: message => this.feeError.set(String(message)) });
  }

  closeFees() {
    this.view.set('painel');
    this.feeSaved.set(false);
  }

  /**
   * Cadastra a vigencia. O percentual digitado vira pontos-base e o valor fixo
   * vira centavos: **nenhum float chega a API** (decisao 2).
   */
  submitFee() {
    if (this.feeForm.invalid) {
      this.feeForm.markAllAsTouched();

      return;
    }

    const { method, percent, fixed, validFrom, note } = this.feeForm.getRawValue();

    this.feeSaving.set(true);
    this.feeError.set(null);
    this.feeSaved.set(false);

    this.finance
      .createFee({
        method,
        percentBasisPoints: Math.round(Number(percent.replace(',', '.')) * 100),
        fixedCents: Math.round(Number(fixed.replace(',', '.')) * 100),
        validFrom: fromDateInput(validFrom, 'start'),
        note: note.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.feeSaving.set(false);
          this.feeSaved.set(true);
          this.feeForm.reset({ method, percent: '', fixed: '0', validFrom: '', note: '' });
          this.finance.loadFees().subscribe({ error: () => undefined });
          // O liquido do periodo muda com a vigencia nova: recarregar e o que
          // tira o "nao apurado" da tela.
          this.finance.load().subscribe({ error: () => undefined });
        },
        error: (message: string) => {
          this.feeSaving.set(false);
          this.feeError.set(message);
        },
      });
  }

  /** Copia um id do Mercado Pago — e o que o suporte leva para o painel de la. */
  copy(value: string) {
    void navigator.clipboard?.writeText(value);
    this.copied.set(value);
    setTimeout(() => this.copied.set(null), 1500);
  }

  /** Baixa a planilha do filtro corrente. O arquivo vem pronto do servidor. */
  exportCsv() {
    this.exporting.set(true);

    this.finance.exportCsv().subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();

        setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  /** Centavos em reais. A formatacao acontece aqui, e nunca na API (decisao 2). */
  formatCents(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }

    return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  /** `499` pontos-base viram `4,99%` — o numero que o contrato diz. */
  formatPercent(basisPoints: number): string {
    return `${(basisPoints / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`;
  }

  statusLabel(status: FinanceOrderStatus): string {
    return STATUS_LABEL[status];
  }

  statusVariant(status: FinanceOrderStatus) {
    return STATUS_VARIANT[status];
  }

  methodLabel(method: FinanceMethod): string {
    return METHOD_LABEL[method];
  }

  /** A janela default, citada no estado vazio. */
  readonly windowDays = FINANCE_WINDOW_DAYS;
}
