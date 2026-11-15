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
 * - **`floating`:** entra pulando no canto inferior, alguns segundos depois
 *   de a pagina abrir — e so com o banner de cookies fechado, que ocupa o
 *   mesmo rodape. Fechado, nao volta na mesma sessao (`sessionStorage`,
 *   com try/catch: sem storage, ele so volta a aparecer).
 * - **`inline`:** na secao de preco, sem fechar.
 *
 * Le a campanha do `StoreService` — a mesma oferta que a pagina ja carrega.
 * `load` faz o card carregar a oferta sozinho, para a pagina que nao a le
 * (a landing). A contagem usa o relogio do servidor (decisao 7) e so roda no
 * navegador; no fim, o card some, e o `StoreService` rele a oferta.
 *
 * Leitor de tela: uma frase estatica com a oferta e o prazo. A contagem e
 * escondida dele (`aria-hidden`), e nunca anunciada a cada segundo.
 */
@Component({
  selector: 'ui-promo-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (visible(); as promo) {
      @if (variant() === 'floating') {
        <aside
          class="fixed inset-x-4 bottom-4 z-40 animate-promo-bounce-in motion-reduce:animate-fade-in sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-80"
          aria-label="Oferta da campanha"
          data-testid="promo-flutuante">
          <div
            class="relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-glass-lg ring-1 ring-white/10"
            [class]="tone()">
            <button
              type="button"
              class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Fechar a oferta"
              data-testid="fechar-promo"
              (click)="dismiss()">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <p class="sr-only">{{ summary() }}</p>

            <div aria-hidden="true">
              <p class="pr-8 text-sm font-semibold" [class]="nameTone()">{{ promo.name }}</p>
              <p class="mt-1 text-5xl font-extrabold leading-none tracking-tight tabular-nums">−{{ promo.percentOff }}%</p>
              <p class="mt-1 text-sm text-white/80">de desconto em toda a loja</p>

              @if (remaining(); as left) {
                <div class="mt-4 grid grid-cols-4 gap-1.5" data-testid="contagem">
                  @for (unit of units(); track unit.label) {
                    <div class="rounded-xl bg-white/10 px-1 py-1.5 text-center">
                      <span class="block text-xl font-bold leading-tight tabular-nums">{{ unit.value }}</span>
                      <span class="block text-[11px] text-white/70">{{ unit.label }}</span>
                    </div>
                  }
                </div>
                @if (left.lastHour) {
                  <p class="mt-2 text-xs font-semibold">Acaba em menos de 1 hora</p>
                }
              }
            </div>

            <a
              [routerLink]="link()"
              [fragment]="fragment() ?? undefined"
              class="mt-4 block rounded-xl bg-white px-4 py-2.5 text-center text-sm font-bold text-brand-navy transition-colors hover:bg-brand-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy">
              Ver a oferta
            </a>
          </div>
        </aside>
      } @else {
        <section
          class="overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-glass md:flex md:items-center md:gap-8 md:p-6"
          [class]="tone()"
          aria-label="Oferta da campanha"
          data-testid="promo-em-linha">
          <p class="sr-only">{{ summary() }}</p>

          <div class="flex items-end gap-4" aria-hidden="true">
            <p class="text-5xl font-extrabold leading-none tracking-tight tabular-nums md:text-6xl">−{{ promo.percentOff }}%</p>
            <div class="pb-1">
              <p class="text-sm font-semibold" [class]="nameTone()">{{ promo.name }}</p>
              <p class="text-sm text-white/85">em toda a loja, até {{ deadline() }}</p>
            </div>
          </div>

          @if (remaining(); as left) {
            <div class="mt-4 md:ml-auto md:mt-0" aria-hidden="true">
              <div class="grid grid-cols-4 gap-1.5 md:w-72" data-testid="contagem">
                @for (unit of units(); track unit.label) {
                  <div class="rounded-xl bg-white/10 px-1 py-1.5 text-center">
                    <span class="block text-2xl font-bold leading-tight tabular-nums">{{ unit.value }}</span>
                    <span class="block text-[11px] text-white/70">{{ unit.label }}</span>
                  </div>
                }
              </div>
              @if (left.lastHour) {
                <p class="mt-2 text-xs font-semibold md:text-right">Acaba em menos de 1 hora</p>
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
  /** Destino do "Ver a oferta" (so no flutuante). */
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

  /** Ultima hora: o card sai do navy para o vermelho da urgencia. */
  protected readonly tone = computed(() =>
    this.remaining()?.lastHour ? 'from-[#7F1D1D] to-state-danger' : 'from-brand-navy to-brand-navy-light',
  );

  /** O azul-claro do nome some no vermelho: na ultima hora, branco. */
  protected readonly nameTone = computed(() => (this.remaining()?.lastHour ? 'text-white' : 'text-brand-teal-light'));

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
