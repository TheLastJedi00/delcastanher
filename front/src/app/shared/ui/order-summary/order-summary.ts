import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlaceholderText } from '../placeholder-text/placeholder-text';

/**
 * Resumo do pedido do checkout: o que esta sendo comprado e por quanto.
 *
 * O preco chega do mock e pode ainda ser `[PREÇO]`. Nesse caso quem renderiza
 * e o `ui-placeholder-text`, com o mesmo tratamento de "pendente" do resto do
 * funil — o visitante nunca ve o marcador cru nem um valor fabricado
 * (decisao 5 da Spec 007).
 */
@Component({
  selector: 'ui-order-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderText],
  host: { class: 'block' },
  template: `
    <section
      class="rounded-2xl border border-brand-navy/8 bg-white p-6 shadow-card"
      aria-labelledby="order-summary-title">
      <h2
        id="order-summary-title"
        class="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-brand-teal-deep">
        Resumo do pedido
      </h2>

      @if (kind()) {
        <p class="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {{ kind() }}
        </p>
      }

      <h3 class="text-lg font-extrabold leading-tight tracking-tight text-brand-navy">
        {{ name() }}
      </h3>

      @if (summary()) {
        <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ summary() }}</p>
      }

      <dl class="mt-5 border-t border-brand-navy/8 pt-5">
        <dt class="text-sm text-slate-500">Total</dt>
        <dd class="mt-1 text-3xl font-extrabold tracking-tight text-brand-navy">
          <ui-placeholder-text [value]="price()" />
        </dd>

        @if (priceNote()) {
          <dd class="mt-2 text-sm text-slate-500">
            <ui-placeholder-text [value]="priceNote()" />
          </dd>
        }
      </dl>

      @if (method()) {
        <p class="mt-5 flex flex-wrap items-center gap-2 border-t border-brand-navy/8 pt-5 text-sm text-slate-500">
          <span>Forma de pagamento:</span>
          <span class="font-bold text-brand-navy">{{ method() }}</span>
        </p>
      }
    </section>
  `,
})
export class OrderSummary {
  readonly name = input('');
  readonly summary = input('');
  /** Aceita placeholder (`[PREÇO]`) — o template da o tratamento de pendente. */
  readonly price = input('');
  readonly priceNote = input('');
  /** Rotulo do tipo de produto (ex.: "Curso"), opcional. */
  readonly kind = input('');
  /** Metodo escolhido, exibido apenas nas telas de resultado. */
  readonly method = input('');
}
