import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface MarqueePartner {
  /** Nome da empresa: vira o `alt` da imagem, ou o proprio texto exibido. */
  name: string;
  /**
   * Ausente quando a empresa ainda nao tem arquivo de logo — nesse caso o nome
   * entra escrito, no tratamento que a secao usava antes dos logos existirem.
   * `width`/`height` sao as dimensoes intrinsecas do arquivo, exigidas pelo
   * NgOptimizedImage para reservar o espaco antes de a imagem chegar.
   */
  logo?: { src: string; width: number; height: number };
}

/**
 * Faixa de parceiros em carrossel continuo (Spec 011).
 *
 * A trilha e renderizada duas vezes e desliza -50%: ao fim do ciclo a copia
 * esta exatamente sobre a original, entao o loop nao tem salto. E CSS puro —
 * o projeto nao carrega nenhuma biblioteca de UI e uma faixa de logos nao
 * justificaria a primeira. Tambem nao toca em `window`, entao atravessa o SSR.
 */
@Component({
  selector: 'ui-logo-marquee',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage],
  host: { class: 'block' },
  template: `
    <div class="marquee" [style.--marquee-duration]="duration()">
      <div class="marquee__track">
        @for (group of [0, 1]; track group) {
          <!-- A segunda copia e decorativa: o leitor de tela ja leu a primeira. -->
          <ul class="marquee__group" [attr.aria-hidden]="group === 1 ? 'true' : null">
            @for (partner of partners(); track partner.name) {
              <li class="flex h-16 w-36 shrink-0 items-center justify-center md:w-44">
                @if (partner.logo; as logo) {
                  <img
                    [ngSrc]="logo.src"
                    [width]="logo.width"
                    [height]="logo.height"
                    [alt]="group === 1 ? '' : partner.name"
                    class="max-h-full max-w-full object-contain opacity-60 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0" />
                } @else {
                  <span
                    class="text-center text-xl font-black uppercase leading-tight text-brand-navy/30 transition-colors duration-300 hover:text-brand-navy">
                    {{ partner.name }}
                  </span>
                }
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
})
export class LogoMarquee {
  readonly partners = input<MarqueePartner[]>([]);
  /** Segundos para a trilha percorrer um ciclo inteiro. */
  readonly seconds = input(40);

  protected readonly duration = computed(() => `${this.seconds()}s`);
}
