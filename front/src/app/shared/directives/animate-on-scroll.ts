import {
  Directive,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
} from '@angular/core';

/**
 * Aplica uma classe de animacao quando o elemento entra no viewport.
 * Usa IntersectionObserver e respeita prefers-reduced-motion — nesse caso o
 * elemento fica visivel imediatamente, sem animar.
 */
@Directive({
  selector: '[animateOnScroll]',
  host: { class: 'opacity-0' },
})
export class AnimateOnScroll implements OnDestroy {
  /** Classe utilitaria de animacao a aplicar (ex.: animate-fade-in-up). */
  readonly animateOnScroll = input('animate-fade-in-up');
  /** Atraso em ms, util para efeito stagger em listas. */
  readonly animateDelay = input(0);

  private readonly host = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement as HTMLElement;

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        // Sem animacao nenhuma: o elemento so deixa de estar oculto.
        el.classList.remove('opacity-0');
        return;
      }

      if (typeof IntersectionObserver === 'undefined') {
        this.reveal(el);
        return;
      }

      this.observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const delay = this.animateDelay();
            if (delay) {
              el.style.animationDelay = `${delay}ms`;
            }
            this.reveal(el);
            this.observer?.disconnect();
          }
        },
        { threshold: 0.1 }
      );

      this.observer.observe(el);
    });
  }

  private reveal(el: HTMLElement) {
    // 'both' e obrigatorio: sem ele o elemento voltaria a ficar visivel durante o
    // animationDelay do stagger, piscando antes da animacao comecar.
    el.style.animationFillMode = 'both';
    el.classList.remove('opacity-0');
    for (const cls of this.animateOnScroll().split(' ').filter(Boolean)) {
      el.classList.add(cls);
    }
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
