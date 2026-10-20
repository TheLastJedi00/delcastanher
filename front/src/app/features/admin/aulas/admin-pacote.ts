import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { LAUNCH_BUNDLE_COPY } from '../../../core/mocks/plans.mock';
import { AdminBundle, AdminBundleTier, AdminBundlesService } from '../../../core/services/admin-bundles.service';
import { formatPrice } from '../../../core/services/store.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';

/**
 * Bloco "Pacote completo" da Gestao de Aulas (Spec 019, decisao 13; Spec 027,
 * decisao 4): o preco unico, editavel, e os lotes da Spec 019 como historico.
 *
 * O lote que vende e o ultimo, na ordem — o mesmo que o servidor aceita
 * editar. Os anteriores (o Lote Fundador) foram encerrados e aparecem so para
 * leitura, com o que venderam. Vagas nao sao mais editaveis.
 *
 * Mora num componente proprio, e nao dentro do `AdminAulas`: aquela aba ja e
 * grande, e o pacote e decisao comercial, nao conteudo.
 */
@Component({
  selector: 'app-admin-pacote',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, ReactiveFormsModule],
  template: `
    <ui-card variant="default" padding="lg" [hover]="false">
      <h3 class="text-lg font-semibold text-brand-navy">Pacote completo</h3>
      <p class="mt-1 text-sm text-slate-600">
        Os 12 módulos num item só, com preço único. Mudar o preço não altera pedidos já feitos: eles
        guardam o valor cobrado.
      </p>

      @if (error(); as message) {
        <p class="mt-4 text-sm text-state-danger" role="alert">{{ message }}</p>
      }

      @if (bundle(); as pack) {
        @if (selling(); as tier) {
          <div class="mt-5 flex flex-wrap items-center justify-between gap-3" data-testid="preco-unico">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Preço</p>
              <p class="text-2xl font-extrabold text-brand-navy">{{ price(tier.priceCents) }}</p>
              <p class="text-xs text-slate-500">{{ sold(tier.occupied) }}</p>
            </div>
            @if (!editing()) {
              <ui-button variant="outline" size="sm" (click)="start(tier)">Editar preço</ui-button>
            }
          </div>

          @if (editing()) {
            <form
              [formGroup]="form"
              (ngSubmit)="save(tier)"
              class="mt-4 grid gap-3 rounded-xl bg-brand-teal/5 p-3 sm:max-w-sm">
              <label class="block text-xs text-slate-600">
                Preço em reais
                <input type="text" inputmode="decimal" formControlName="price" [class]="fieldClass" />
              </label>
              @if (formError(); as message) {
                <p class="text-xs text-state-danger" role="alert">{{ message }}</p>
              }
              <div class="flex gap-2">
                <ui-button type="submit" variant="primary" size="sm" [loading]="saving()">Salvar preço</ui-button>
                <ui-button variant="ghost" size="sm" (click)="cancel()">Cancelar</ui-button>
              </div>
            </form>
          }
        }

        @if (closed().length) {
          <div class="mt-8 overflow-x-auto">
            <table class="w-full min-w-[24rem] text-left text-sm">
              <caption class="mb-2 text-left text-sm font-semibold text-brand-navy">Lotes encerrados</caption>
              <thead class="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" class="py-2 pr-4">Lote</th>
                  <th scope="col" class="py-2 pr-4">Preço</th>
                  <th scope="col" class="py-2">Vendidos</th>
                </tr>
              </thead>
              <tbody>
                @for (tier of closed(); track tier.id) {
                  <tr class="border-t border-brand-navy/10">
                    <td class="py-3 pr-4 font-semibold text-brand-navy">{{ tier.name }}</td>
                    <td class="py-3 pr-4">{{ price(tier.priceCents) }}</td>
                    <td class="py-3">{{ tier.occupied }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else if (!error()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Carregando o pacote…</p>
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
  protected readonly editing = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  private readonly ordered = computed(() => [...(this.bundle()?.tiers ?? [])].sort((a, b) => a.order - b.order));

  /** O lote que vende: o ultimo, o unico que o servidor aceita editar. */
  protected readonly selling = computed(() => this.ordered().at(-1) ?? null);

  /** Os anteriores: historico da Spec 019, so leitura. */
  protected readonly closed = computed(() => this.ordered().slice(0, -1));

  protected readonly form = this.fb.nonNullable.group({ price: [''] });

  ngOnInit(): void {
    this.reload();
  }

  protected price(cents: number): string {
    return formatPrice(cents);
  }

  protected sold(count: number): string {
    return count === 1 ? '1 vendido' : `${count} vendidos`;
  }

  protected start(tier: AdminBundleTier): void {
    this.formError.set(null);
    this.editing.set(true);
    this.form.setValue({ price: (tier.priceCents / 100).toFixed(2).replace('.', ',') });
  }

  protected cancel(): void {
    this.editing.set(false);
    this.formError.set(null);
  }

  /** Converte o preco em centavos e envia. As regras sao do servidor. */
  protected save(tier: AdminBundleTier): void {
    const priceValue = Number(this.form.getRawValue().price.trim().replace(/\./g, '').replace(',', '.'));

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      this.formError.set('Informe um preço maior que zero, como 989,00.');

      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.bundles.updateTier(this.slug, tier.id, { priceCents: Math.round(priceValue * 100) }).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
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
