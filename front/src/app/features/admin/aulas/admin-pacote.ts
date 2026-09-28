import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { LAUNCH_BUNDLE_COPY, tierLabel } from '../../../core/mocks/plans.mock';
import { AdminBundle, AdminBundleTier, AdminBundlesService, UpdateTierInput } from '../../../core/services/admin-bundles.service';
import { formatPrice } from '../../../core/services/store.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';

/**
 * Bloco "Pacote de Lancamento" da Gestao de Aulas (Spec 019, decisao 13): os
 * lotes com vendidos, vagas e o vigente, e a edicao de preco e vagas.
 *
 * Mora num componente proprio, e nao dentro do `AdminAulas`: aquela aba ja e
 * grande, e o pacote e decisao comercial, nao conteudo. As recusas (vagas
 * abaixo das ocupadas, "sem limite" fora do ultimo lote) sao do servidor, e a
 * mensagem dele aparece no proprio formulario.
 */
@Component({
  selector: 'app-admin-pacote',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card, ReactiveFormsModule],
  template: `
    <ui-card variant="default" padding="lg" [hover]="false">
      <h3 class="text-lg font-semibold text-brand-navy">Pacote de Lançamento</h3>
      <p class="mt-1 text-sm text-slate-600">
        O lote vigente é o primeiro com vaga: ele vira sozinho quando as vagas acabam. Pedido pago,
        estornado ou PIX ainda no prazo ocupam vaga.
      </p>

      @if (error(); as message) {
        <p class="mt-4 text-sm text-state-danger" role="alert">{{ message }}</p>
      }

      @if (bundle(); as pack) {
        <div class="mt-5 overflow-x-auto">
          <table class="w-full min-w-[36rem] text-left text-sm">
            <caption class="sr-only">Lotes do {{ pack.title }}</caption>
            <thead class="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" class="py-2 pr-4">Lote</th>
                <th scope="col" class="py-2 pr-4">Preço</th>
                <th scope="col" class="py-2 pr-4">Vagas</th>
                <th scope="col" class="py-2 pr-4">Ocupadas</th>
                <th scope="col" class="py-2"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (tier of pack.tiers; track tier.id) {
                <tr class="border-t border-brand-navy/10 align-top">
                  <td class="py-3 pr-4">
                    <span class="font-semibold text-brand-navy">{{ label(tier) }}</span>
                    @if (tier.current) {
                      <ui-badge variant="success" label="Vigente" class="ml-2" />
                    }
                  </td>
                  <td class="py-3 pr-4">{{ price(tier.priceCents) }}</td>
                  <td class="py-3 pr-4">{{ tier.capacity === null ? 'Sem limite' : tier.capacity }}</td>
                  <td class="py-3 pr-4">{{ tier.occupied }}</td>
                  <td class="py-3 text-right">
                    <ui-button variant="outline" size="sm" (click)="start(tier)">Editar</ui-button>
                  </td>
                </tr>

                @if (editingId() === tier.id) {
                  <tr>
                    <td colspan="5" class="pb-4">
                      <form
                        [formGroup]="form"
                        (ngSubmit)="save(tier)"
                        class="grid gap-3 rounded-xl bg-brand-teal/5 p-3 sm:grid-cols-2">
                        <label class="block text-xs text-slate-600">
                          Preço em reais
                          <input type="text" inputmode="decimal" formControlName="price" [class]="fieldClass" />
                        </label>
                        <label class="block text-xs text-slate-600">
                          Vagas {{ isLast(tier) ? '(vazio = sem limite)' : '' }}
                          <input type="text" inputmode="numeric" formControlName="capacity" [class]="fieldClass" />
                        </label>
                        <p class="text-xs text-slate-500 sm:col-span-2">
                          Mudar o preço não altera pedidos já feitos: eles guardam o valor cobrado. As
                          vagas não podem ficar abaixo das {{ tier.occupied }} já ocupadas.
                        </p>
                        @if (formError(); as message) {
                          <p class="text-xs text-state-danger sm:col-span-2" role="alert">{{ message }}</p>
                        }
                        <div class="flex gap-2 sm:col-span-2">
                          <ui-button type="submit" variant="primary" size="sm" [loading]="saving()">Salvar lote</ui-button>
                          <ui-button variant="ghost" size="sm" (click)="cancel()">Cancelar</ui-button>
                        </div>
                      </form>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      } @else if (!error()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Carregando os lotes…</p>
      }
    </ui-card>
  `,
})
export class AdminPacote implements OnInit {
  private readonly bundles = inject(AdminBundlesService);
  private readonly fb = inject(FormBuilder);

  protected readonly fieldClass =
    'mt-1 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';

  private readonly slug = LAUNCH_BUNDLE_COPY.slug;

  protected readonly bundle = signal<AdminBundle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  private readonly lastOrder = computed(() =>
    Math.max(...(this.bundle()?.tiers.map(tier => tier.order) ?? [0])),
  );

  protected readonly form = this.fb.nonNullable.group({ price: [''], capacity: [''] });

  ngOnInit(): void {
    this.reload();
  }

  protected label(tier: AdminBundleTier): string {
    return tierLabel(tier);
  }

  protected price(cents: number): string {
    return formatPrice(cents);
  }

  protected isLast(tier: AdminBundleTier): boolean {
    return tier.order === this.lastOrder();
  }

  protected start(tier: AdminBundleTier): void {
    this.formError.set(null);
    this.editingId.set(tier.id);
    this.form.setValue({
      price: (tier.priceCents / 100).toFixed(2).replace('.', ','),
      capacity: tier.capacity === null ? '' : String(tier.capacity),
    });
  }

  protected cancel(): void {
    this.editingId.set(null);
    this.formError.set(null);
  }

  /**
   * Converte o formulario e envia. Validacao aqui e so de forma (numero
   * legivel); as regras de vagas sao do servidor, que conta as ocupadas.
   */
  protected save(tier: AdminBundleTier): void {
    const { price, capacity } = this.form.getRawValue();
    const priceValue = Number(price.trim().replace(/\./g, '').replace(',', '.'));

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      this.formError.set('Informe um preço maior que zero, como 590,00.');

      return;
    }

    const capacityRaw = capacity.trim();
    const capacityValue = capacityRaw === '' ? null : Number(capacityRaw);

    if (capacityValue !== null && (!Number.isInteger(capacityValue) || capacityValue < 0)) {
      this.formError.set('Informe as vagas como um número inteiro.');

      return;
    }

    const input: UpdateTierInput = { priceCents: Math.round(priceValue * 100), capacity: capacityValue };

    this.saving.set(true);
    this.formError.set(null);
    this.bundles.updateTier(this.slug, tier.id, input).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingId.set(null);
        this.reload();
      },
      error: (message: string) => {
        this.saving.set(false);
        this.formError.set(message);
      },
    });
  }

  private reload(): void {
    this.bundles.load(this.slug).subscribe({
      next: bundle => {
        this.error.set(null);
        this.bundle.set(bundle);
      },
      error: (message: string) => this.error.set(message),
    });
  }
}
