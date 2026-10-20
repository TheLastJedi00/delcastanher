import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OfferTier, formatPrice } from '../../../core/services/store.service';

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
 */
@Component({
  selector: 'ui-bundle-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (loading()) {
      <div class="min-h-[6.5rem] animate-pulse" aria-busy="true" aria-label="Carregando o preço">
        <div class="h-4 w-56 rounded bg-slate-200"></div>
        <div class="mt-3 h-10 w-40 rounded bg-slate-200"></div>
        <div class="mt-2 h-4 w-32 rounded bg-slate-200"></div>
      </div>
    } @else if (tier(); as current) {
      <div class="min-h-[6.5rem]">
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

  protected price(cents: number | null): string {
    return formatPrice(cents);
  }
}
