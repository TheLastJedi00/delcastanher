import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { isYoutubeId, youtubeEmbedUrl } from './youtube';

/**
 * Fachada de um video do YouTube em 16:9 (Spec 023, decisao C2), no padrao
 * do card "Na midia" (Spec 018, decisao 5).
 *
 * Ate o clique so existe o poster **local**: nenhuma requisicao vai ao
 * YouTube, nem a thumbnail do `ytimg`. O `<iframe>` nasce no clique, entao
 * tambem nunca sai no HTML prerenderizado. Id fora do formato nao vira
 * player: fica so o poster, sem botao.
 */
@Component({
  selector: 'ui-youtube-facade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage],
  host: { class: 'block' },
  template: `
    <div class="relative aspect-video w-full overflow-hidden rounded-2xl bg-brand-navy shadow-glass-lg">
      @if (playing() && src(); as url) {
        <iframe
          class="absolute inset-0 h-full w-full"
          [src]="url"
          [title]="title()"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"></iframe>
      } @else {
        <img [ngSrc]="poster()" fill alt="" class="object-cover" />

        @if (src()) {
          <button
            type="button"
            class="group absolute inset-0 flex items-center justify-center bg-brand-navy/10 transition-colors hover:bg-brand-navy/20"
            [attr.aria-label]="'Reproduzir: ' + title()"
            (click)="playing.set(true)">
            <span class="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 text-brand-navy shadow-glass-lg transition-transform duration-200 group-hover:scale-110">
              <svg class="ml-1 h-9 w-9" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        }
      }
    </div>
  `,
})
export class YoutubeFacade {
  private readonly sanitizer = inject(DomSanitizer);

  /** Id de 11 caracteres do video. */
  readonly id = input.required<string>();
  /** Nome do video: vai no `aria-label` do botao e no `title` do iframe. */
  readonly title = input.required<string>();
  /** Caminho do poster local, em `public/assets/`. */
  readonly poster = input.required<string>();

  protected readonly playing = signal(false);

  protected readonly src = computed<SafeResourceUrl | null>(() =>
    isYoutubeId(this.id())
      ? this.sanitizer.bypassSecurityTrustResourceUrl(youtubeEmbedUrl(this.id(), { related: false }))
      : null,
  );
}
