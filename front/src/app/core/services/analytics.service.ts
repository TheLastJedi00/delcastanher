import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ConsentService } from './consent.service';

/** Eventos padronizados desta spec. A lista fechada evita nome digitado errado. */
export type AnalyticsEventName =
  | 'page_view'
  | 'view_course'
  | 'begin_checkout'
  | 'purchase'
  | 'generate_lead'
  | 'lesson_started';

export type AnalyticsPayload = Record<string, unknown>;

interface QueuedEvent {
  name: AnalyticsEventName;
  payload: AnalyticsPayload;
}

/** `window` com o dataLayer que o GTM consome. */
interface DataLayerWindow extends Window {
  dataLayer?: AnalyticsPayload[];
}

/** Teto da fila: sessao longa sem decisao nao pode virar vazamento de memoria. */
const MAX_QUEUED_EVENTS = 50;

/**
 * Camada de eventos da plataforma (Spec 009, decisoes 4, 5 e 6).
 *
 * Duas regras que o servico existe para garantir, e que nenhum componente
 * precisa lembrar:
 *
 * 1. **Nada sai antes do consentimento.** Enquanto o titular nao decide, os
 *    eventos ficam em fila na memoria — a navegacao inicial e justamente onde
 *    esta o `page_view` mais valioso. No aceite a fila e liberada na ordem; na
 *    recusa ela e descartada e o servico vira no-op pelo resto da sessao.
 * 2. **Sem ID configurado, nada e carregado.** Com `gtmId` vazio o container
 *    nunca e injetado e o evento so aparece no console em desenvolvimento.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly consent = inject(ConsentService);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private queue: QueuedEvent[] = [];
  private containerLoaded = false;
  /** Recusa e definitiva na sessao: nem enfileira mais. */
  private rejected = false;

  constructor() {
    effect(() => {
      if (this.consent.analyticsAllowed()) {
        this.release();

        return;
      }

      // `hasDecision` sem `analyticsAllowed` so pode ser recusa.
      if (this.consent.hasDecision()) {
        this.discard();
      }
    });
  }

  /**
   * Registra um evento. O chamador nunca precisa checar consentimento: quem
   * decide entre enviar, enfileirar e descartar e este metodo.
   */
  track(name: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
    if (this.rejected) {
      return;
    }

    if (!this.consent.analyticsAllowed()) {
      this.enqueue({ name, payload });

      return;
    }

    this.send(name, payload);
  }

  private enqueue(event: QueuedEvent): void {
    if (this.queue.length >= MAX_QUEUED_EVENTS) {
      this.queue.shift();
    }

    this.queue.push(event);
  }

  private release(): void {
    const pending = this.queue;
    this.queue = [];

    this.loadContainer();

    for (const event of pending) {
      this.send(event.name, event.payload);
    }
  }

  private discard(): void {
    this.rejected = true;
    this.queue = [];
  }

  private send(name: AnalyticsEventName, payload: AnalyticsPayload): void {
    if (!environment.gtmId) {
      // Sem container configurado o evento nao tem para onde ir. Em
      // desenvolvimento ele vira log, que e o que permite conferir a
      // instrumentacao inteira sem uma propriedade real.
      if (!environment.production) {
        console.debug('[analytics]', name, payload);
      }

      return;
    }

    if (!this.isBrowser) {
      return;
    }

    this.loadContainer();

    const target = this.document.defaultView as DataLayerWindow | null;

    target?.dataLayer?.push({ event: name, ...payload });
  }

  /**
   * Injeta o container do GTM — apenas no navegador, apenas com ID configurado
   * e apenas depois do aceite. Script carregado ja grava cookie, entao
   * carregar "por precaucao" antes da decisao ja seria tratamento sem base
   * legal (decisao 4).
   */
  private loadContainer(): void {
    if (this.containerLoaded || !this.isBrowser || !environment.gtmId) {
      return;
    }

    if (!this.consent.analyticsAllowed()) {
      return;
    }

    const target = this.document.defaultView as DataLayerWindow | null;

    if (!target) {
      return;
    }

    this.containerLoaded = true;
    target.dataLayer = target.dataLayer ?? [];
    target.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

    const script = this.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${environment.gtmId}`;
    this.document.head.appendChild(script);
  }
}
