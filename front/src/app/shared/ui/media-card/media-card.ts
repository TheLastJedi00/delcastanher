import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Badge } from '../badge/badge';

export type MediaKind = 'revista' | 'podcast' | 'livro';

/** Player embutido: so o provedor e o id; a URL e montada pelo card. */
export interface MediaEmbed {
  provider: 'youtube' | 'instagram';
  id: string;
}

/**
 * Uma aparicao da secao "Na midia" (Spec 018).
 *
 * `cover` e `url` sao opcionais pelo mesmo motivo do logo da Cronus (Spec 011,
 * decisao 3): sem arte, o card mostra o veiculo escrito; sem link, nao vira
 * link. Quando o material chega, a mudanca e preencher o campo.
 */
export interface MediaAppearance {
  kind: MediaKind;
  title: string;
  /** Veiculo: revista, programa ou editora. */
  outlet: string;
  /** Data como aparece no card ("nº 90 · agosto de 2026"). */
  dateLabel: string;
  /** Data ISO 8601 para os dados estruturados (decisao 8). */
  datePublished: string;
  url?: string;
  /** Texto do link de saida ("Ler matéria", "Assistir no YouTube"...). */
  cta?: string;
  cover?: { src: string; alt: string };
  embed?: MediaEmbed;
}

const KIND_LABEL: Record<MediaKind, string> = {
  revista: 'Revista',
  podcast: 'Podcast',
  livro: 'Livro',
};

/**
 * Template fixo por provedor e formato do id (decisao 3). Nenhuma URL vinda de
 * fora vira `ResourceUrl`: so o id, e so se casar com o formato.
 */
const EMBEDS: Record<MediaEmbed['provider'], { pattern: RegExp; src: (id: string) => string }> = {
  youtube: {
    pattern: /^[\w-]{11}$/,
    src: id => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
  },
  instagram: {
    pattern: /^[\w-]{5,40}$/,
    src: id => `https://www.instagram.com/reel/${id}/embed/`,
  },
};

/**
 * Card de preview de uma aparicao na midia (Spec 018, decisoes 2, 3, 5 e 6).
 *
 * O player e uma fachada: ate o clique so existe a capa local, e nenhuma
 * requisicao vai ao YouTube ou ao Instagram — nem scripts pesando no LCP, nem
 * cookie de terceiro antes do banner. O `<iframe>` so nasce depois do clique,
 * entao tambem nunca sai no HTML prerenderizado.
 *
 * O card nao e um `<a>` inteiro, como o `ui-article-card`: um botao de play e
 * um iframe nao podem viver dentro de um link. O link fica no titulo e no CTA.
 */
@Component({
  selector: 'ui-media-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, Badge],
  host: { class: 'block h-full' },
  template: `
    <article class="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-navy/8 bg-white shadow-card transition-shadow duration-300 hover:shadow-card-hover">
      <!-- Celula de altura fixa: retrato e paisagem convivem em object-contain,
           com a propria peca desfocada preenchendo as sobras (decisao 6). -->
      <div class="relative overflow-hidden bg-brand-navy transition-[height] duration-300" [class]="cellHeight()">
        @if (playing() && embedSrc(); as src) {
          <iframe
            class="absolute inset-0 h-full w-full"
            [src]="src"
            [title]="'Episódio: ' + item().title"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"></iframe>
        } @else {
          @if (item().cover; as cover) {
            <img
              [ngSrc]="cover.src"
              fill
              alt=""
              aria-hidden="true"
              class="scale-110 object-cover opacity-60 blur-2xl" />
            <img [ngSrc]="cover.src" fill [alt]="cover.alt" class="object-contain" />
          } @else {
            <span class="absolute inset-0 flex items-center justify-center px-6 text-center text-xl font-bold text-white/80">
              {{ item().outlet }}
            </span>
          }

          @if (embedSrc()) {
            <button
              type="button"
              class="group absolute inset-0 flex items-center justify-center"
              [attr.aria-label]="'Reproduzir episódio: ' + item().title"
              (click)="playing.set(true)">
              <span class="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-brand-navy shadow-glass-lg transition-transform duration-200 group-hover:scale-110">
                <svg class="ml-1 h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          }
        }
      </div>

      <div class="flex flex-1 flex-col p-6">
        <ui-badge [variant]="item().kind === 'podcast' ? 'teal' : 'navy'" [label]="kindLabel()" class="mb-4 self-start" />

        <h3 class="mb-2 text-lg font-bold leading-snug text-brand-navy">
          @if (item().url; as url) {
            <a [href]="url" target="_blank" rel="noopener" class="transition-colors hover:text-brand-teal-deep">
              {{ item().title }}
            </a>
          } @else {
            {{ item().title }}
          }
        </h3>

        <p class="mb-6 text-sm text-slate-500">{{ item().outlet }} · {{ item().dateLabel }}</p>

        @if (item().url; as url) {
          <a
            [href]="url"
            target="_blank"
            rel="noopener"
            class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-brand-teal-deep transition-colors hover:text-brand-navy">
            {{ item().cta ?? 'Ver mais' }}
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span class="sr-only">(abre em nova aba)</span>
          </a>
        }
      </div>
    </article>
  `,
})
export class MediaCard {
  private readonly sanitizer = inject(DomSanitizer);

  readonly item = input.required<MediaAppearance>();

  protected readonly playing = signal(false);

  protected readonly kindLabel = computed(() => KIND_LABEL[this.item().kind]);

  /**
   * O embed do Instagram e vertical e traz cabecalho proprio: na celula de
   * h-72 o reel ficava cortado com rolagem interna. So ele, e so depois do
   * play, ganha a altura do video 9:16 mais o cabecalho (decisao 3).
   */
  protected readonly cellHeight = computed(() =>
    this.playing() && this.item().embed?.provider === 'instagram' ? 'h-[34rem]' : 'h-72'
  );

  /** `null` quando nao ha embed ou o id nao casa com o formato do provedor. */
  protected readonly embedSrc = computed<SafeResourceUrl | null>(() => {
    const embed = this.item().embed;

    if (!embed) {
      return null;
    }

    const { pattern, src } = EMBEDS[embed.provider];

    if (!pattern.test(embed.id)) {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(src(embed.id));
  });
}
