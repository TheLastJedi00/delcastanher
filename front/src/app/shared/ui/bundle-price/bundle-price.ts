import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OfferTier, PublicPromotion, formatPrice } from '../../../core/services/store.service';
import { SalePrice } from '../sale-price/sale-price';

/**
 * Bloco de preco do pacote: ancora riscada, preco e parcelamento (Spec 019,
 * decisoes 4, 9 e 10). Usado no `/planos`, na pagina do curso e na loja, para
 * todos dizerem o mesmo preco do mesmo jeito.
 *
 * - **Sem selo de lote** (Spec 027, decisao 6): o pacote tem preco unico, e o
 *   nome do lote nao diz nada a quem compra.
 * - **Carregando:** esqueleto com a altura do bloco pronto, para o preco
 *   chegar sem empurrar a pagina.
 * - **Sem lote** (a oferta falhou): "Consulte o valor na loja", sem inventar
 *   numero.
 * - **Parcelamento:** "em ate 12x no cartao", e nunca o valor da parcela — com
 *   juros do comprador, quem sabe a parcela e o Mercado Pago, no checkout.
 * - **Em campanha** (Spec 032, decisao 8): a ancora dos modulos separados sai,
 *   e o riscado passa a ser o preco cheio do pacote, com o selo e o prazo.
 *   Dois precos riscados competindo confundiriam o "de" com o "por".
 */
@Component({
  selector: 'ui-bundle-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [SalePrice],
  template: `
    @if (loading()) {
      <div class="min-h-[6.5rem] animate-pulse" aria-busy="true" aria-label="Carregando o preço">
        <div class="h-4 w-56 rounded bg-slate-200"></div>
        <div class="mt-3 h-10 w-40 rounded bg-slate-200"></div>
        <div class="mt-2 h-4 w-32 rounded bg-slate-200"></div>
      </div>
    } @else if (tier(); as current) {
      <div class="min-h-[6.5rem]">
        @if (onSale(); as promo) {
          <ui-sale-price
            class="mt-2"
            size="lg"
            [priceCents]="current.priceCents"
            [listPriceCents]="current.listPriceCents"
            [percentOff]="promo.percentOff"
            [endsAt]="promo.endsAt" />
          <p class="mt-1 text-sm text-slate-600">ou em até {{ maxInstallments() }}x no cartão</p>
        } @else {
          @if (anchorCents() !== null) {
            <p class="text-sm text-slate-500">
              Valor dos módulos separadamente:
              <s class="whitespace-nowrap">{{ price(anchorCents()) }}</s>
            </p>
          }

          <p class="mt-2 text-4xl font-extrabold tracking-tight text-brand-navy">
            {{ price(current.priceCents) }}
          </p>
          <p class="mt-1 text-sm text-slate-600">ou em até {{ maxInstallments() }}x no cartão</p>
        }
      </div>
    } @else {
      <p class="min-h-[6.5rem] text-base font-semibold text-brand-navy">Consulte o valor na loja</p>
    }
  `,
})
export class BundlePrice {
  readonly tier = input<OfferTier | null>(null);
  /** Soma dos precos avulsos; nula esconde a ancora. */
  readonly anchorCents = input<number | null>(null);
  readonly loading = input(false);
  readonly maxInstallments = input(12);
  /** Campanha no ar (Spec 032); nula mostra o preco como antes. */
  readonly promotion = input<PublicPromotion | null>(null);

  /** A campanha, so quando o lote de fato esta com desconto. */
  protected readonly onSale = computed(() => {
    const promotion = this.promotion();
    const tier = this.tier();

    return promotion && tier && tier.listPriceCents > tier.priceCents ? promotion : null;
  });

  protected price(cents: number | null): string {
    return formatPrice(cents);
  }
}
