import { DestroyRef, PLATFORM_ID, Signal, afterNextRender, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** O que falta, em partes, para a contagem regressiva (Spec 032, decisao 9). */
export interface Remaining {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Menos de 1 hora: o card muda de cor para reforcar a urgencia. */
  lastHour: boolean;
}

const HOUR = 60 * 60 * 1000;

/** Divide o que falta em dias, horas, minutos e segundos. Nulo quando acabou. */
export function splitRemaining(ms: number): Remaining | null {
  if (ms <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(ms / 1000);

  return {
    totalMs: ms,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    lastHour: ms < HOUR,
  };
}

/**
 * Contagem regressiva ate `endsAt`, pelo relogio do **servidor** (Spec 032,
 * decisao 7): `offsetMs` e a diferenca entre o servidor e o aparelho, e e
 * somada ao `Date.now()` a cada segundo.
 *
 * So roda no navegador: no SSR o signal fica nulo (nada de relogio no HTML
 * prerenderizado, que divergiria na hidratacao). O intervalo e limpo com o
 * componente. Chamar em contexto de injecao (campo ou construtor).
 */
export function countdown(endsAt: Signal<string | null>, offsetMs: Signal<number>): Signal<Remaining | null> {
  const now = signal<number | null>(null);
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  const destroyRef = inject(DestroyRef);

  if (browser) {
    afterNextRender(() => {
      now.set(Date.now());
      const timer = setInterval(() => now.set(Date.now()), 1000);

      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  return computed(() => {
    const current = now();
    const end = endsAt();

    return current === null || end === null ? null : splitRemaining(Date.parse(end) - (current + offsetMs()));
  });
}
