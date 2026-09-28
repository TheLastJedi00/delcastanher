import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { tierLabel } from '../../../core/mocks/plans.mock';
import { OfferTier, formatPrice } from '../../../core/services/store.service';
import { Badge } from '../badge/badge';

/**
 * Bloco de preco do pacote: lote vigente em selo, ancora riscada, preco e
 * parcelamento (Spec 019, decisoes 4, 9 e 10). Usado no `/planos` e na loja,
 * para os dois dizerem o mesmo preco do mesmo jeito.
 *
 * - **Carregando:** esqueleto com a altura do bloco pronto, para o preco
 *   chegar sem empurrar a pagina.
 * - **Sem lote** (a oferta falhou): "Consulte o valor na loja", sem inventar
 *   numero.
 * - **Parcelamento:** "em ate 12x no cartao", e nunca o valor da parcela — com
 *   juros do comprador, quem sabe a parcela e o Mercado Pago, no checkout.
 */
@Component({
  selector: 'ui-bundle-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge],
  host: { class: 'block' },
  template: `
    @if (loading()) {
      <div class="min-h-[8.5rem] animate-pulse" aria-busy="true" aria-label="Carregando o preço">
        <div class="h-6 w-36 rounded-full bg-slate-200"></div>
        <div class="mt-3 h-4 w-56 rounded bg-slate-200"></div>
        <div class="mt-3 h-10 w-40 rounded bg-slate-200"></div>
        <div class="mt-2 h-4 w-32 rounded bg-slate-200"></div>
      </div>
    } @else if (tier(); as current) {
      <div class="min-h-[8.5rem]">
        <ui-badge variant="teal" [label]="label()" />

        @if (anchorCents() !== null) {
          <p class="mt-3 text-sm text-slate-500">
            Valor dos módulos separadamente:
            <s class="whitespace-nowrap">{{ price(anchorCents()) }}</s>
          </p>
        }

        <p class="mt-2 text-4xl font-extrabold tracking-tight text-brand-navy">
          {{ price(current.priceCents) }}
        </p>
        <p class="mt-1 text-sm text-slate-600">ou em até {{ maxInstallments() }}x no cartão</p>
      </div>
    } @else {
      <p class="min-h-[8.5rem] text-base font-semibold text-brand-navy">Consulte o valor na loja</p>
    }
  `,
})
export class BundlePrice {
  readonly tier = input<OfferTier | null>(null);
  /** Soma dos precos avulsos; nula esconde a ancora. */
  readonly anchorCents = input<number | null>(null);
  readonly loading = input(false);
  readonly maxInstallments = input(12);

  protected readonly label = computed(() => {
    const tier = this.tier();

    return tier ? tierLabel(tier) : '';
  });

  protected price(cents: number | null): string {
    return formatPrice(cents);
  }
}
