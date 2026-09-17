import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Selo de confianca do checkout (Spec 014, task 7.8).
 *
 * Duas coisas acontecem aqui, e as duas sao item do checklist de qualidade do
 * Mercado Pago:
 *
 * - **O logotipo do Mercado Pago** (boa pratica 13). Quem paga precisa
 *   reconhecer quem processa — o nome do processador na tela reduz abandono e
 *   contestacao por "nao reconheco esta cobranca".
 * - **Os selos de seguranca**, que dizem o que de fato acontece: os dados do
 *   cartao sao digitados dentro dos campos do proprio Mercado Pago e nao
 *   passam por esta plataforma (decisao 8). E uma afirmacao verificavel, e nao
 *   um cadeado decorativo.
 *
 * O logotipo e um arquivo em `public/assets/`, e nao um SVG desenhado aqui:
 * marca de terceiro se usa como o dono a publica. Se o arquivo faltar, o
 * `alt` exibe "Mercado Pago" em texto — a atribuicao continua correta, so
 * perde o desenho.
 */
@Component({
  selector: 'ui-payment-trust',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="rounded-xl border border-brand-navy/10 bg-white/60 px-4 py-3">
      <p class="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
        <span>Pagamento processado por</span>
        <img
          src="assets/mercado-pago.svg"
          alt="Mercado Pago"
          width="110"
          height="24"
          class="h-5 w-auto"
          loading="lazy" />
      </p>

      <ul class="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <li class="flex items-center gap-1">
          <svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Conexão criptografada
        </li>
        <li class="flex items-center gap-1">
          <svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Dados do cartão não passam por esta plataforma
        </li>
      </ul>
    </div>
  `,
})
export class PaymentTrust {}
