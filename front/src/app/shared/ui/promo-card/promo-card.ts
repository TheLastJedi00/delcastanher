import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { formatBrasiliaShort } from '../../../core/services/brasilia-time';
import { ConsentService } from '../../../core/services/consent.service';
import { countdown } from '../../../core/services/countdown';
import { StoreService } from '../../../core/services/store.service';

/** Prefixo da chave do "fechou o card" na sessao, por campanha. */
const DISMISS_KEY = 'promo-card-dismissed:';

/**
 * Card da campanha de desconto, com a porcentagem e a contagem regressiva
 * (Spec 032, decisao 9).
 *
 * **Visual (pedido do usuario em 15/11/2026, a partir do banner da Black
 * Friday):** preto puro, com o teal da marca em neon e o dourado do banner
 * como acento — titulo condensado com contorno dourado e brilho teal, a
 * porcentagem num selo estourado, a contagem em blocos com borda neon e o
 * botao em pilula dourada. Na ultima hora, o neon vira vermelho. A foto da
 * Lidiane e a `nova_mentora.jpeg` recortada, com o fundo cinza levado ao
 * preto (so os pixels escuros e neutros; rosto, cabelo e roupa intactos), e
 * a borda dela esfuma no preto do card. O unico
 * movimento alem da entrada e o piscar lento das faiscas, desligado com
 * `prefers-reduced-motion`.
 *
 * - **`floating`:** entra pulando no canto inferior, alguns segundos depois
 *   de a pagina abrir — e so com o banner de cookies fechado, que ocupa o
 *   mesmo rodape. Fechado, nao volta na mesma sessao (`sessionStorage`, com
 *   try/catch: sem storage, ele so volta a aparecer).
 * - **`inline`:** na secao de preco, sem fechar.
 *
 * Le a campanha do `StoreService` — a mesma oferta que a pagina ja carrega.
 * `load` faz o card carregar a oferta sozinho, para a pagina que nao a le
 * (a landing). A contagem usa o relogio do servidor (decisao 7) e so roda no
 * navegador; no fim, o card some, e o `StoreService` rele a oferta.
 *
 * Leitor de tela: uma frase estatica com a oferta e o prazo. Titulo, selo e
 * contagem sao escondidos dele (`aria-hidden`), e nada e anunciado a cada
 * segundo.
 */
@Component({
  selector: 'ui-promo-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, RouterLink],
  styles: `
    :host {
      --glow: 40 195 217;
      --gold: #f5c451;
      --gold-light: #ffe9a8;
      --gold-deep: #c8901e;
      display: block;
    }

    .promo {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      border-radius: 1.5rem;
      background: #000;
      color: #fff;
      box-shadow:
        0 0 0 1px rgb(var(--glow) / 0.5),
        0 0 24px rgb(var(--glow) / 0.3),
        0 18px 48px rgb(0 0 0 / 0.45);
    }

    /* Ultima hora: o neon vira vermelho (so a cor do brilho muda). */
    .promo--urgent {
      --glow: 255 77 109;
    }

    /* Brilhos da marca e faiscas: so CSS, nada de imagem. */
    .promo::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      background:
        radial-gradient(1.6px 1.6px at 8% 22%, var(--gold) 60%, #0000 61%),
        radial-gradient(1.2px 1.2px at 22% 78%, rgb(var(--glow)) 60%, #0000 61%),
        radial-gradient(2px 2px at 38% 12%, var(--gold-light) 60%, #0000 61%),
        radial-gradient(1.6px 1.6px at 67% 30%, rgb(var(--glow)) 60%, #0000 61%),
        radial-gradient(2px 2px at 92% 14%, var(--gold) 60%, #0000 61%),
        radial-gradient(circle at 88% 8%, rgb(var(--glow) / 0.3), #0000 46%),
        radial-gradient(circle at 0% 100%, rgb(36 71 121 / 0.6), #0000 52%);
    }

    @media (prefers-reduced-motion: no-preference) {
      .promo::before {
        animation: twinkle 3.2s ease-in-out infinite alternate;
      }
    }

    @keyframes twinkle {
      from {
        opacity: 0.65;
      }
    }

    .promo__title,
    .promo__burst-text,
    .promo__cta {
      font-family: 'Anton', 'Plus Jakarta Sans', system-ui, sans-serif;
      text-transform: uppercase;
    }

    .promo__title {
      letter-spacing: 0.02em;
      line-height: 0.92;
      color: rgb(var(--glow));
      -webkit-text-stroke: 1px var(--gold);
      text-shadow:
        0 0 2px rgb(255 255 255 / 0.5),
        0 0 10px rgb(var(--glow) / 0.9),
        0 0 26px rgb(var(--glow) / 0.6);
    }

    .promo__sub {
      color: rgb(255 255 255 / 0.78);
    }

    /* Selo estourado: a estrela dourada por fora, outra menor por dentro. */
    .promo__burst {
      --burst: polygon(
        50% 0, 58% 9.8%, 69.1% 3.8%, 72.8% 15.9%, 85.4% 14.6%, 84.1% 27.2%, 96.2% 30.9%, 90.2% 42%,
        100% 50%, 90.2% 58%, 96.2% 69.1%, 84.1% 72.8%, 85.4% 85.4%, 72.8% 84.1%, 69.1% 96.2%, 58% 90.2%,
        50% 100%, 42% 90.2%, 30.9% 96.2%, 27.2% 84.1%, 14.6% 85.4%, 15.9% 72.8%, 3.8% 69.1%, 9.8% 58%,
        0 50%, 9.8% 42%, 3.8% 30.9%, 15.9% 27.2%, 14.6% 14.6%, 27.2% 15.9%, 30.9% 3.8%, 42% 9.8%
      );
      flex: none;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      clip-path: var(--burst);
      background: linear-gradient(140deg, var(--gold-light), var(--gold) 45%, var(--gold-deep));
    }

    .promo__burst > * {
      grid-area: 1 / 1;
    }

    .promo__burst-core {
      width: 88%;
      height: 88%;
      clip-path: var(--burst);
      background: radial-gradient(circle at 50% 40%, #2d5a9a, #0b1730 70%);
    }

    .promo__burst-text {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 0.95;
    }

    /* O degrade recortado no texto vai em cada linha: no contêiner flex ele some. */
    .promo__burst-text > span {
      background: linear-gradient(180deg, var(--gold-light), var(--gold) 55%, var(--gold-deep));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      filter: drop-shadow(0 0 6px rgb(245 196 81 / 0.45));
    }

    .promo__unit {
      border-radius: 0.75rem;
      border: 1px solid rgb(var(--glow) / 0.55);
      background: rgb(255 255 255 / 0.04);
      box-shadow:
        inset 0 0 12px rgb(var(--glow) / 0.15),
        0 0 10px rgb(var(--glow) / 0.22);
      text-align: center;
    }

    .promo__digit {
      display: block;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1.15;
      text-shadow: 0 0 8px rgb(var(--glow) / 0.8);
    }

    .promo__unit-label {
      display: block;
      font-size: 11px;
      color: rgb(255 255 255 / 0.65);
    }

    .promo__urgent-note {
      color: rgb(var(--glow));
    }

    .promo__cta {
      display: block;
      border-radius: 9999px;
      border: 1.5px solid var(--gold);
      background: linear-gradient(#151515, #000);
      padding: 0.6rem 1rem;
      text-align: center;
      font-size: 1.05rem;
      letter-spacing: 0.05em;
      color: var(--gold);
      text-shadow: 0 0 8px rgb(245 196 81 / 0.6);
      box-shadow:
        0 0 12px rgb(245 196 81 / 0.45),
        inset 0 0 10px rgb(245 196 81 / 0.15);
    }

    .promo__cta:hover {
      background: var(--gold);
      color: #000;
      text-shadow: none;
    }

    .promo__cta:focus-visible,
    .promo__close:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 3px;
    }

    /* A foto esfuma no preto do card pela esquerda e por baixo. */
    .promo__photo {
      -webkit-mask-image: linear-gradient(to right, #0000, #000 38%), linear-gradient(to top, #0000, #000 32%);
      mask-image: linear-gradient(to right, #0000, #000 38%), linear-gradient(to top, #0000, #000 32%);
      -webkit-mask-composite: source-in;
      mask-composite: intersect;
    }

    /* Na faixa em linha a foto fica no meio: esfuma em volta toda. */
    .promo__photo--soft {
      -webkit-mask-image: radial-gradient(ellipse 48% 60% at 50% 38%, #000 42%, #0000 100%);
      mask-image: radial-gradient(ellipse 48% 60% at 50% 38%, #000 42%, #0000 100%);
    }

    .promo__close {
      color: rgb(255 255 255 / 0.8);
      background: rgb(0 0 0 / 0.45);
    }

    .promo__close:hover {
      color: #fff;
      background: rgb(255 255 255 / 0.1);
    }
  `,
  template: `
    @if (visible(); as promo) {
      @if (variant() === 'floating') {
        <aside
          class="fixed inset-x-4 bottom-4 z-40 animate-promo-bounce-in motion-reduce:animate-fade-in sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[21rem]"
          aria-label="Oferta da campanha"
          data-testid="promo-flutuante">
          <div class="promo p-5" [class.promo--urgent]="urgent()" data-testid="promo-caixa">
            <button
              type="button"
              class="promo__close absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              aria-label="Fechar a oferta"
              data-testid="fechar-promo"
              (click)="dismiss()">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <p class="sr-only">{{ summary() }}</p>

            <div aria-hidden="true">
              <div class="flex items-end gap-2">
                <div class="min-w-0 flex-1 pb-1">
                  <p class="promo__title text-[2.6rem]">{{ promo.name }}</p>
                  <p class="promo__sub mt-2 text-sm">Em toda a loja, até {{ deadline() }}</p>
                </div>
                <div class="relative -mr-5 -mt-5 w-36 shrink-0" data-testid="promo-foto">
                  <img
                    class="promo__photo block h-auto w-full"
                    ngSrc="assets/mentora-black-friday.jpg"
                    width="480"
                    height="538"
                    alt="" />
                  <div class="promo__burst absolute -left-5 bottom-1 w-[5.5rem]">
                    <span class="promo__burst-core"></span>
                    <span class="promo__burst-text">
                      <span class="text-2xl">{{ promo.percentOff }}%</span>
                      <span class="text-xs">off</span>
                    </span>
                  </div>
                </div>
              </div>

              @if (remaining(); as left) {
                <div class="mt-4 grid grid-cols-4 gap-1.5" data-testid="contagem">
                  @for (unit of units(); track unit.label) {
                    <div class="promo__unit px-1 py-1.5">
                      <span class="promo__digit text-xl">{{ unit.value }}</span>
                      <span class="promo__unit-label">{{ unit.label }}</span>
                    </div>
                  }
                </div>
                @if (left.lastHour) {
                  <p class="promo__urgent-note mt-2 text-xs font-semibold">Acaba em menos de 1 hora</p>
                }
              }
            </div>

            <a class="promo__cta mt-4" [routerLink]="link()" [fragment]="fragment() ?? undefined">Quero minha oferta</a>
          </div>
        </aside>
      } @else {
        <section
          class="promo p-5 md:flex md:items-center md:gap-6 md:p-6"
          [class.promo--urgent]="urgent()"
          aria-label="Oferta da campanha"
          data-testid="promo-em-linha">
          <p class="sr-only">{{ summary() }}</p>

          <div class="flex items-center gap-4" aria-hidden="true">
            <div class="promo__burst w-24 md:w-28">
              <span class="promo__burst-core"></span>
              <span class="promo__burst-text">
                <span class="text-[1.7rem] md:text-[2rem]">{{ promo.percentOff }}%</span>
                <span class="text-sm">off</span>
              </span>
            </div>
            <div class="min-w-0">
              <p class="promo__title text-4xl md:text-5xl">{{ promo.name }}</p>
              <p class="promo__sub mt-1 text-sm">Em toda a loja, até {{ deadline() }}</p>
            </div>
          </div>

          <!-- No celular a faixa e estreita: a foto entra a partir do md. -->
          <img
            class="promo__photo--soft -my-6 hidden h-[10rem] w-auto self-end md:ml-auto md:block"
            ngSrc="assets/mentora-black-friday.jpg"
            width="480"
            height="538"
            alt=""
            aria-hidden="true"
            data-testid="promo-foto" />

          @if (remaining(); as left) {
            <div class="mt-4 md:mt-0" aria-hidden="true">
              <div class="grid grid-cols-4 gap-1.5 md:w-72" data-testid="contagem">
                @for (unit of units(); track unit.label) {
                  <div class="promo__unit px-1 py-1.5">
                    <span class="promo__digit text-2xl">{{ unit.value }}</span>
                    <span class="promo__unit-label">{{ unit.label }}</span>
                  </div>
                }
              </div>
              @if (left.lastHour) {
                <p class="promo__urgent-note mt-2 text-xs font-semibold md:text-right">Acaba em menos de 1 hora</p>
              }
            </div>
          }
        </section>
      }
    }
  `,
})
export class PromoCard {
  private readonly store = inject(StoreService);
  private readonly consent = inject(ConsentService);

  readonly variant = input<'floating' | 'inline'>('inline');
  /** Destino do "Quero minha oferta" (so no flutuante). */
  readonly link = input<string[]>(['/planos']);
  readonly fragment = input<string | null>('pacote');
  /** Espera antes de o flutuante entrar, para nao competir com a primeira dobra. */
  readonly delayMs = input(2500);
  /** Carrega a oferta, na pagina que nao a le por conta propria. */
  readonly load = input(false);

  protected readonly promotion = this.store.promotion;
  protected readonly remaining = countdown(
    computed(() => this.promotion()?.endsAt ?? null),
    this.store.clockOffsetMs,
  );

  /** O relogio ja rodou: daqui em diante, contagem nula e "acabou". */
  private readonly started = signal(false);
  /** O flutuante ja passou da espera. */
  private readonly delayPassed = signal(false);
  /** Fechado nesta tela. */
  private readonly closed = signal(false);

  protected readonly visible = computed(() => {
    const promotion = this.promotion();

    if (!promotion || (this.started() && this.remaining() === null)) {
      return null;
    }

    if (this.variant() !== 'floating') {
      return promotion;
    }

    // O banner de cookies tambem fica preso no rodape: o card espera a decisao,
    // e entra pulando depois dela, sem os dois se sobreporem no celular.
    if (this.consent.bannerVisible()) {
      return null;
    }

    // Lido por campanha, e so quando ela chega: a oferta pode vir depois da espera.
    return this.delayPassed() && !this.closed() && !wasDismissed(promotion.endsAt) ? promotion : null;
  });

  protected readonly deadline = computed(() => {
    const promotion = this.promotion();

    return promotion ? formatBrasiliaShort(promotion.endsAt) : '';
  });

  protected readonly summary = computed(() => {
    const promotion = this.promotion();

    return promotion
      ? `Oferta de ${promotion.name}: ${promotion.percentOff}% de desconto em toda a loja até ${this.deadline()}.`
      : '';
  });

  protected readonly units = computed(() => {
    const left = this.remaining();
    const pad = (value: number) => String(value).padStart(2, '0');

    return left
      ? [
          { value: pad(left.days), label: left.days === 1 ? 'dia' : 'dias' },
          { value: pad(left.hours), label: 'h' },
          { value: pad(left.minutes), label: 'min' },
          { value: pad(left.seconds), label: 's' },
        ]
      : [];
  });

  /** Ultima hora: o neon vira vermelho. */
  protected readonly urgent = computed(() => this.remaining()?.lastHour ?? false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.started.set(true);

      if (this.load() && this.store.offer() === null) {
        this.store.loadOffer().subscribe({ error: () => undefined });
      }

      if (this.variant() !== 'floating') {
        return;
      }

      const timer = setTimeout(() => this.delayPassed.set(true), this.delayMs());

      destroyRef.onDestroy(() => clearTimeout(timer));
    });
  }

  protected dismiss(): void {
    this.closed.set(true);

    try {
      sessionStorage.setItem(`${DISMISS_KEY}${this.promotion()?.endsAt ?? ''}`, '1');
    } catch {
      // Sem storage (aba privada, bloqueio): o card so volta a aparecer.
    }
  }
}

/** Fechado nesta sessao? Por campanha: fechar a Black Friday nao esconde a proxima. */
function wasDismissed(endsAt: string): boolean {
  try {
    return sessionStorage.getItem(`${DISMISS_KEY}${endsAt}`) === '1';
  } catch {
    return false;
  }
}
