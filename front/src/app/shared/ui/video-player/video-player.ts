import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'ui-video-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="group relative aspect-video w-full overflow-hidden rounded-2xl bg-brand-navy shadow-glass">
      @if (poster()) {
        <img
          [src]="poster()" [alt]="title()"
          class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
      }

      <div
        class="absolute inset-0 bg-gradient-to-t from-brand-navy/90 via-brand-navy/40 to-brand-navy/20"
        aria-hidden="true"></div>

      <button
        type="button"
        (click)="play.emit()"
        class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 text-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal"
        [attr.aria-label]="'Reproduzir: ' + title()">
        <span
          class="flex h-20 w-20 items-center justify-center rounded-full bg-brand-teal/90 shadow-glow-teal transition-transform duration-300 group-hover:scale-110">
          <svg class="ml-1 h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span>
          <span class="block text-xl font-bold tracking-tight">{{ title() }}</span>
          @if (subtitle()) {
            <span class="block text-sm text-white/80">{{ subtitle() }}</span>
          }
        </span>
      </button>
    </div>
  `,
})
export class VideoPlayer {
  /** URL do video (Vimeo/YouTube) — reservado para a integracao futura. */
  readonly src = input('');
  readonly poster = input('');
  readonly title = input('');
  readonly subtitle = input('');

  readonly play = output<void>();
}
