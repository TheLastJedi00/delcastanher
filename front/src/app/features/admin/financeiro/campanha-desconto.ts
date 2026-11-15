import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Observable, debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs';
import {
  AdminPromotionsService,
  Promotion,
  PromotionInput,
  PromotionListItem,
  PromotionPreview,
} from '../../../core/services/admin-promotions.service';
import {
  formatBrasiliaLong,
  formatBrasiliaShort,
  fromBrasiliaInput,
  toBrasiliaInput,
} from '../../../core/services/brasilia-time';
import { formatPrice } from '../../../core/services/store.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';

/** Teto da porcentagem, o mesmo da API (Spec 032, decisao 1). */
const MAX_PERCENT_OFF = 90;

/** O que esta aberto no card: nada, o formulario, ou uma confirmacao. */
type Mode =
  | { kind: 'idle' }
  | { kind: 'create' }
  | { kind: 'edit'; promotion: Promotion }
  | { kind: 'confirm-end'; promotion: Promotion }
  | { kind: 'confirm-remove'; promotion: Promotion };

/** Fim depois do inicio, conferido no grupo (o servidor confere de novo). */
function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = fromBrasiliaInput(group.get('startsAt')?.value ?? '');
  const end = fromBrasiliaInput(group.get('endsAt')?.value ?? '');

  return start && end && new Date(end) <= new Date(start) ? { endBeforeStart: true } : null;
}

/**
 * Campanha de desconto no Financeiro (Spec 032, decisao 10).
 *
 * O card nao "liga" campanha nenhuma: ele grava o periodo, e a loja le o que
 * vale no instante (decisao 1). Por isso os estados sao os da API — agendada,
 * no ar e encerrada — e nunca um interruptor.
 *
 * Confirmacoes (encerrar e apagar) ficam dentro do card, e nao num `confirm()`
 * do navegador, que trava a pagina e nao segue o visual do painel.
 */
@Component({
  selector: 'app-campanha-desconto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card, ReactiveFormsModule],
  template: `
    <ui-card variant="default" padding="lg" [hover]="false">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-xl">
          <h3 class="text-lg font-semibold text-brand-navy">Campanha de desconto</h3>
          <p class="mt-1 text-sm text-slate-600">
            Uma porcentagem de desconto em todos os produtos da loja, com início e fim marcados no
            horário de Brasília. A loja muda sozinha no início e volta ao preço normal no fim.
          </p>
        </div>

        @if (mode().kind === 'idle' && !loading()) {
          <ui-button size="sm" data-testid="criar-campanha" (click)="openCreate()">Criar campanha</ui-button>
        }
      </div>

      @if (error(); as message) {
        <p class="mt-4 text-sm text-state-danger" role="alert">{{ message }}</p>
      }

      @if (loading()) {
        <div class="mt-5 h-20 animate-pulse rounded-xl bg-slate-100" aria-busy="true" aria-label="Carregando as campanhas"></div>
      }

      @if (formOpen()) {
        <form class="mt-5 grid gap-4 md:grid-cols-2" [formGroup]="form" (ngSubmit)="save()" data-testid="form-campanha">
          <label class="flex flex-col gap-1 text-sm md:col-span-2">
            <span class="font-medium text-slate-700">Nome</span>
            <input formControlName="name" maxlength="60" [class]="inputClass" />
          </label>

          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-slate-700">Desconto (%)</span>
            <input
              formControlName="percentOff"
              type="number"
              min="1"
              [max]="maxPercent"
              step="1"
              inputmode="numeric"
              [class]="inputClass" />
            @if (editingRunning()) {
              <span class="text-xs text-slate-500">Com a campanha no ar, a porcentagem não muda.</span>
            }
          </label>

          <div class="hidden md:block"></div>

          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-slate-700">Início (Brasília)</span>
            <input formControlName="startsAt" type="datetime-local" [class]="inputClass" />
          </label>

          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium text-slate-700">Fim (Brasília)</span>
            <input formControlName="endsAt" type="datetime-local" [class]="inputClass" />
          </label>

          @if (form.hasError('endBeforeStart')) {
            <p class="text-sm text-state-danger md:col-span-2" role="alert">O fim precisa ser depois do início.</p>
          }

          @if (previewText(); as text) {
            <p class="rounded-xl bg-brand-teal/5 px-4 py-3 text-sm text-brand-navy md:col-span-2" data-testid="previa">
              {{ text }}
            </p>
          }

          <div class="flex flex-wrap gap-2 md:col-span-2">
            <ui-button type="submit" size="sm" [loading]="busy()" [disabled]="form.invalid || busy()">
              {{ mode().kind === 'create' ? 'Criar campanha' : 'Salvar' }}
            </ui-button>
            <ui-button variant="ghost" size="sm" (click)="close()">Cancelar</ui-button>
          </div>
        </form>
      }

      @for (promotion of open(); track promotion.id) {
        <div class="mt-5 rounded-xl border border-brand-navy/10 p-4" [attr.data-testid]="'campanha-' + promotion.status">
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-semibold text-brand-navy">{{ promotion.name }} · −{{ promotion.percentOff }}%</p>
            @if (promotion.status === 'RUNNING') {
              <ui-badge variant="success" label="No ar" />
            } @else {
              <ui-badge variant="navy" label="Agendada" />
            }
          </div>

          <p class="mt-1 text-sm text-slate-600">
            @if (promotion.status === 'RUNNING') {
              Termina em {{ short(promotion.endsAt) }}.
            } @else {
              De {{ short(promotion.startsAt) }} a {{ short(promotion.endsAt) }}.
            }
          </p>

          @if (promotion.status === 'RUNNING') {
            <dl class="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt class="text-xs uppercase tracking-widest text-slate-500">Pedidos pagos</dt>
                <dd class="font-semibold text-brand-navy">{{ promotion.totals.paidOrders }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-widest text-slate-500">Receita</dt>
                <dd class="font-semibold text-brand-navy">{{ price(promotion.totals.revenueCents) }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-widest text-slate-500">Desconto</dt>
                <dd class="font-semibold text-brand-navy">{{ price(promotion.totals.discountCents) }}</dd>
              </div>
            </dl>
          }

          @switch (confirmFor(promotion.id)) {
            @case ('end') {
              <div class="mt-4 rounded-xl bg-state-danger/5 p-3 text-sm" role="alertdialog" aria-label="Encerrar a campanha">
                <p class="text-slate-700">Encerrar a campanha agora? A loja volta ao preço normal na hora.</p>
                <div class="mt-2 flex gap-2">
                  <ui-button variant="danger" size="sm" [loading]="busy()" data-testid="confirmar-encerrar" (click)="end(promotion)">
                    Encerrar agora
                  </ui-button>
                  <ui-button variant="ghost" size="sm" (click)="close()">Voltar</ui-button>
                </div>
              </div>
            }
            @case ('remove') {
              <div class="mt-4 rounded-xl bg-state-danger/5 p-3 text-sm" role="alertdialog" aria-label="Apagar a campanha">
                <p class="text-slate-700">Apagar a campanha agendada? Ela ainda não começou.</p>
                <div class="mt-2 flex gap-2">
                  <ui-button variant="danger" size="sm" [loading]="busy()" data-testid="confirmar-apagar" (click)="remove(promotion)">
                    Apagar
                  </ui-button>
                  <ui-button variant="ghost" size="sm" (click)="close()">Voltar</ui-button>
                </div>
              </div>
            }
            @default {
              @if (mode().kind === 'idle') {
                <div class="mt-4 flex flex-wrap gap-2">
                  @if (promotion.status === 'RUNNING') {
                    <ui-button variant="outline" size="sm" data-testid="alterar-fim" (click)="openEdit(promotion)">
                      Alterar fim
                    </ui-button>
                    <ui-button variant="danger" size="sm" data-testid="encerrar" (click)="askEnd(promotion)">
                      Encerrar agora
                    </ui-button>
                  } @else {
                    <ui-button variant="outline" size="sm" data-testid="editar" (click)="openEdit(promotion)">Editar</ui-button>
                    <ui-button variant="ghost" size="sm" data-testid="apagar" (click)="askRemove(promotion)">Apagar</ui-button>
                  }
                </div>
              }
            }
          }
        </div>
      }

      @if (history().length > 0) {
        <details class="mt-6" data-testid="historico">
          <summary class="cursor-pointer text-sm font-semibold text-brand-navy">
            Campanhas encerradas ({{ history().length }})
          </summary>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-[36rem] text-left text-sm">
              <thead class="text-xs uppercase tracking-widest text-slate-500">
                <tr>
                  <th class="py-2 pr-3 font-semibold">Campanha</th>
                  <th class="py-2 pr-3 font-semibold">Período</th>
                  <th class="py-2 pr-3 text-right font-semibold">Pedidos</th>
                  <th class="py-2 pr-3 text-right font-semibold">Receita</th>
                  <th class="py-2 text-right font-semibold">Desconto</th>
                </tr>
              </thead>
              <tbody>
                @for (item of history(); track item.id) {
                  <tr class="border-t border-brand-navy/5">
                    <td class="py-2 pr-3">{{ item.name }} · −{{ item.percentOff }}%</td>
                    <td class="py-2 pr-3 text-slate-600">
                      {{ long(item.startsAt) }} a {{ long(item.endedEarlyAt ?? item.endsAt) }}
                      @if (item.endedEarlyAt) {
                        <span class="text-xs">(encerrada antes)</span>
                      }
                    </td>
                    <td class="py-2 pr-3 text-right">{{ item.totals.paidOrders }}</td>
                    <td class="py-2 pr-3 text-right">{{ price(item.totals.revenueCents) }}</td>
                    <td class="py-2 text-right">{{ price(item.totals.discountCents) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    </ui-card>
  `,
})
export class CampanhaDesconto implements OnInit {
  private readonly promotions = inject(AdminPromotionsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly maxPercent = MAX_PERCENT_OFF;
  protected readonly inputClass =
    'rounded-xl border border-brand-navy/10 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 disabled:bg-slate-50 disabled:text-slate-500';

  protected readonly items = signal<PromotionListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mode = signal<Mode>({ kind: 'idle' });
  private readonly preview = signal<PromotionPreview | null>(null);

  /** No ar primeiro, depois as agendadas pela data de inicio. */
  protected readonly open = computed(() =>
    this.items()
      .filter(item => item.status !== 'ENDED')
      .sort((a, b) =>
        a.status === b.status ? a.startsAt.localeCompare(b.startsAt) : a.status === 'RUNNING' ? -1 : 1,
      ),
  );
  protected readonly history = computed(() => this.items().filter(item => item.status === 'ENDED'));
  protected readonly formOpen = computed(() => ['create', 'edit'].includes(this.mode().kind));
  protected readonly editingRunning = computed(() => {
    const mode = this.mode();

    return mode.kind === 'edit' && mode.promotion.status === 'RUNNING';
  });

  /** "O pacote sai de R$ 989,00 por R$ 692,30", com o preco vigente, pela API. */
  protected readonly previewText = computed(() => {
    const tier = this.preview()?.bundle?.tier;

    if (!tier || tier.listPriceCents === tier.priceCents) {
      return null;
    }

    return `O pacote sai de ${formatPrice(tier.listPriceCents)} por ${formatPrice(tier.priceCents)}, e cada módulo avulso com o mesmo desconto.`;
  });

  protected readonly form = new FormGroup(
    {
      name: new FormControl('Black Friday', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(60)],
      }),
      percentOff: new FormControl<number | null>(30, [
        Validators.required,
        Validators.min(1),
        Validators.max(MAX_PERCENT_OFF),
        Validators.pattern(/^\d+$/),
      ]),
      startsAt: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      endsAt: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: endAfterStart },
  );

  ngOnInit(): void {
    this.load();

    // A previa acompanha a porcentagem digitada, sem uma chamada por tecla.
    this.form.controls.percentOff.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter(
          (value): value is number =>
            Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_PERCENT_OFF,
        ),
        switchMap(value => this.promotions.preview(value)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ next: preview => this.preview.set(preview), error: () => this.preview.set(null) });
  }

  protected openCreate(): void {
    this.error.set(null);
    this.form.reset({ name: 'Black Friday', percentOff: 30, startsAt: '', endsAt: '' });
    this.form.enable();
    this.mode.set({ kind: 'create' });
    this.loadPreview(30);
  }

  protected openEdit(promotion: Promotion): void {
    this.error.set(null);
    this.form.reset({
      name: promotion.name,
      percentOff: promotion.percentOff,
      startsAt: toBrasiliaInput(promotion.startsAt),
      endsAt: toBrasiliaInput(promotion.endsAt),
    });
    this.form.enable();

    // Decisao 2: no ar, so o nome e o fim mudam.
    if (promotion.status === 'RUNNING') {
      this.form.controls.percentOff.disable();
      this.form.controls.startsAt.disable();
    }

    this.mode.set({ kind: 'edit', promotion });
    this.loadPreview(promotion.percentOff);
  }

  protected askEnd(promotion: Promotion): void {
    this.error.set(null);
    this.mode.set({ kind: 'confirm-end', promotion });
  }

  protected askRemove(promotion: Promotion): void {
    this.error.set(null);
    this.mode.set({ kind: 'confirm-remove', promotion });
  }

  protected close(): void {
    this.mode.set({ kind: 'idle' });
    this.preview.set(null);
  }

  protected confirmFor(id: string): 'end' | 'remove' | null {
    const mode = this.mode();

    if (mode.kind === 'confirm-end' && mode.promotion.id === id) {
      return 'end';
    }

    return mode.kind === 'confirm-remove' && mode.promotion.id === id ? 'remove' : null;
  }

  protected save(): void {
    const mode = this.mode();
    const raw = this.form.getRawValue();
    const startsAt = fromBrasiliaInput(raw.startsAt);
    const endsAt = fromBrasiliaInput(raw.endsAt);

    if (this.form.invalid || !startsAt || !endsAt || raw.percentOff === null) {
      return;
    }

    const input: PromotionInput = { name: raw.name.trim(), percentOff: raw.percentOff, startsAt, endsAt };
    const request =
      mode.kind === 'edit'
        ? this.promotions.update(
            mode.promotion.id,
            mode.promotion.status === 'RUNNING' ? { name: input.name, endsAt: input.endsAt } : input,
          )
        : this.promotions.create(input);

    this.run(request);
  }

  protected end(promotion: Promotion): void {
    this.run(this.promotions.end(promotion.id));
  }

  protected remove(promotion: Promotion): void {
    this.run(this.promotions.remove(promotion.id));
  }

  protected price(cents: number): string {
    return formatPrice(cents);
  }

  protected short(iso: string): string {
    return formatBrasiliaShort(iso);
  }

  protected long(iso: string): string {
    return formatBrasiliaLong(iso);
  }

  /** Grava e recarrega a lista: estado e totais vem da API, nunca deduzidos aqui. */
  private run(request: Observable<unknown>): void {
    this.busy.set(true);
    this.error.set(null);

    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.close();
        this.load();
      },
      error: (message: string) => {
        this.busy.set(false);
        this.error.set(message);
      },
    });
  }

  private loadPreview(percentOff: number): void {
    this.promotions.preview(percentOff).subscribe({
      next: preview => this.preview.set(preview),
      error: () => this.preview.set(null),
    });
  }

  private load(): void {
    this.promotions.list().subscribe({
      next: items => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }
}
