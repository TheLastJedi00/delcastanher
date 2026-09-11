import { isPlatformBrowser } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/** Como o player deve se comportar agora. */
export type PlayerState = 'idle' | 'loading' | 'ready' | 'unavailable';

@Component({
  selector: 'ui-video-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `<mux-player>` e um web component, nao um componente Angular: sem isto o
  // compilador recusaria a tag e os atributos desconhecidos.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'block' },
  template: `
    <div class="group relative aspect-video w-full overflow-hidden rounded-2xl bg-brand-navy shadow-glass">
      @if (playing() && elementLoaded()) {
        <mux-player
          class="absolute inset-0 h-full w-full"
          [attr.playback-id]="playbackId()"
          [attr.playback-token]="playbackToken()"
          [attr.poster]="poster() || null"
          [attr.metadata-video-title]="title()"
          [attr.stream-type]="'on-demand'"
          [attr.accent-color]="accentColor"
          autoplay
          disable-tracking
          disable-cookies
          (ended)="ended.emit()"></mux-player>
      } @else {
        @if (poster()) {
          <img
            [src]="poster()" [alt]="title()"
            class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        }

        <div
          class="absolute inset-0 bg-gradient-to-t from-brand-navy/90 via-brand-navy/40 to-brand-navy/20"
          aria-hidden="true"></div>

        @if (state() === 'ready') {
          <button
            type="button"
            (click)="start()"
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
        } @else {
          <!--
            Sem video ou ainda processando: o visual e o mesmo, sem o botao —
            um play que so leva a erro e pior do que play nenhum.
          -->
          <div
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white"
            aria-live="polite">
            <span class="block text-xl font-bold tracking-tight">{{ title() }}</span>
            <span class="block text-sm text-white/80">{{ statusMessage() }}</span>
          </div>
        }
      }
    </div>
  `,
})
export class VideoPlayer {
  /**
   * O prerender da Spec 009 roda no Node, onde nao existe `customElements`.
   * O import do player e dinamico e so acontece no navegador — o modulo
   * registra o elemento no momento em que e carregado.
   */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Id de reproducao do asset no Mux. */
  readonly playbackId = input<string | null>(null);

  /**
   * JWT curto que autoriza a reproducao. Os assets tem policy `signed`: sem
   * ele o `playbackId` sozinho nao reproduz nada (Spec 010, decisao 6).
   */
  readonly playbackToken = input<string | null>(null);

  readonly poster = input('');
  readonly title = input('');
  readonly subtitle = input('');

  /** Estado externo: a trilha sabe se o modulo tem video e se ele esta pronto. */
  readonly state = input<PlayerState>('ready');

  readonly play = output<void>();
  readonly ended = output<void>();

  protected readonly accentColor = '#0f766e';

  protected readonly playing = signal(false);
  protected readonly elementLoaded = signal(false);

  protected readonly statusMessage = computed(() => {
    switch (this.state()) {
      case 'loading':
        return 'Preparando o vídeo…';
      case 'unavailable':
        return 'O vídeo desta aula ainda não está disponível.';
      default:
        return '';
    }
  });

  constructor() {
    // Trocar de modulo volta ao poster: o player montado continuaria exibindo
    // o quadro da aula anterior ate o novo token chegar.
    effect(() => {
      this.playbackId();
      this.playing.set(false);
    });
  }

  protected start(): void {
    this.play.emit();

    if (!this.isBrowser || !this.playbackId() || !this.playbackToken()) {
      return;
    }

    this.playing.set(true);

    if (this.elementLoaded()) {
      return;
    }

    // Mux Data desligado (Spec 010, decisao 9): o player traz telemetria de
    // audiencia que grava identificador no navegador, e a Spec 009 (decisao 4)
    // condicionou todo terceiro ao aceite — a area logada nao tem banner
    // proprio. Sem env key de Data e com `disable-tracking`, nenhum cookie de
    // terceiro e gravado. Ligar isso e decisao de outra spec, com base legal
    // declarada na Politica de Cookies.
    void import('@mux/mux-player')
      .then(() => this.elementLoaded.set(true))
      .catch(() => {
        this.playing.set(false);
        this.elementLoaded.set(false);
      });
  }
}
