import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatBrasiliaShort } from '../../../core/services/brasilia-time';
import { formatPrice } from '../../../core/services/store.service';

const SIZES = {
  sm: { price: 'text-base font-semibold', list: 'text-xs', badge: 'text-[10px] px-1.5 py-0.5' },
  md: { price: 'text-xl font-semibold', list: 'text-sm', badge: 'text-xs px-2 py-0.5' },
  lg: { price: 'text-4xl font-extrabold tracking-tight', list: 'text-base', badge: 'text-sm px-2.5 py-1' },
} as const;

/**
 * Preco com o desconto da campanha (Spec 032, decisao 8): o cheio riscado, o
 * novo e o selo da porcentagem, com o prazo da oferta.
 *
 * - **O riscado e sempre o `listPriceCents` da API**, o preco real praticado
 *   antes — nunca um numero da tela (o "de" que nunca foi cobrado e
 *   propaganda enganosa).
 * - **Leitor de tela:** o `<s>` e so visual. Uma frase completa ("Preço
 *   anterior: ... Preço com desconto: ...") vai para o leitor, e a parte
 *   visual fica escondida dele.
 * - **Sem campanha** (ou sem diferenca de preco), so o preco, como antes.
 */
@Component({
  selector: 'ui-sale-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (onSale()) {
      <span class="sr-only">
        Preço anterior: {{ list() }}. Preço com desconto: {{ current() }}, {{ percentOff() }}% de desconto.
      </span>
      <span
        aria-hidden="true"
        class="flex flex-wrap items-baseline gap-x-2 gap-y-1"
        [class.justify-end]="align() === 'end'"
        data-testid="preco-promocional">
        <s class="whitespace-nowrap text-slate-500" [class]="sizes().list">{{ list() }}</s>
        <span class="whitespace-nowrap text-brand-navy" [class]="sizes().price">{{ current() }}</span>
        <span
          class="self-center whitespace-nowrap rounded-full bg-state-danger font-bold text-white"
          [class]="sizes().badge">
          −{{ percentOff() }}%
        </span>
      </span>
      @if (deadline(); as until) {
        <span class="mt-1 block text-xs font-medium text-state-danger" [class.text-right]="align() === 'end'">
          Oferta válida até {{ until }}
        </span>
      }
    } @else {
      <span class="whitespace-nowrap text-brand-navy" [class]="sizes().price">{{ current() }}</span>
    }
  `,
})
export class SalePrice {
  /** Preco cobrado: com desconto em campanha. Nulo e "A definir". */
  readonly priceCents = input.required<number | null>();
  /** Preco cheio, o riscado. */
  readonly listPriceCents = input<number | null>(null);
  readonly percentOff = input<number | null>(null);
  /** Fim da campanha (ISO). Nulo esconde o prazo. */
  readonly endsAt = input<string | null>(null);
  readonly size = input<keyof typeof SIZES>('md');
  readonly align = input<'start' | 'end'>('start');

  protected readonly sizes = computed(() => SIZES[this.size()]);
  protected readonly current = computed(() => formatPrice(this.priceCents()));
  protected readonly list = computed(() => formatPrice(this.listPriceCents()));
  protected readonly onSale = computed(() => {
    const price = this.priceCents();
    const list = this.listPriceCents();

    return !!this.percentOff() && price !== null && list !== null && list > price;
  });
  protected readonly deadline = computed(() => {
    const endsAt = this.endsAt();

    return endsAt ? formatBrasiliaShort(endsAt) : null;
  });
}
