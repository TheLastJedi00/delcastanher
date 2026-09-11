import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AnalyticsService } from './analytics.service';
import { CONSENT_POLICY_VERSION, ConsentService } from './consent.service';

const CONSENT_KEY = 'delcastanher.consent';

interface DataLayerWindow extends Window {
  dataLayer?: Record<string, unknown>[];
}

/** Eventos da aplicacao, sem a entrada de inicializacao do proprio container. */
function trackedEvents(): Record<string, unknown>[] {
  const entries = (window as DataLayerWindow).dataLayer ?? [];

  return entries.filter(entry => entry['event'] !== 'gtm.js');
}

function gtmScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll('script')).filter(script =>
    script.src.includes('googletagmanager.com')
  );
}

/** Instancia limpa; o `tick` roda o effect que observa o consentimento. */
function create(): { analytics: AnalyticsService; consent: ConsentService } {
  TestBed.resetTestingModule();

  const analytics = TestBed.inject(AnalyticsService);
  const consent = TestBed.inject(ConsentService);

  TestBed.inject(ApplicationRef).tick();

  return { analytics, consent };
}

function tick(): void {
  TestBed.inject(ApplicationRef).tick();
}

function storeAcceptedConsent(): void {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({
      choice: 'accepted',
      decidedAt: new Date().toISOString(),
      policyVersion: CONSENT_POLICY_VERSION,
    })
  );
}

describe('AnalyticsService', () => {
  beforeEach(() => {
    localStorage.removeItem(CONSENT_KEY);
    delete (window as DataLayerWindow).dataLayer;
    gtmScripts().forEach(script => script.remove());
  });

  afterAll(() => localStorage.removeItem(CONSENT_KEY));

  describe('com ID de container vazio (estado desta spec)', () => {
    it('nasce vazio no environment versionado', () => {
      expect(environment.gtmId).toBe('');
    });

    it('nao injeta script de terceiro nem escreve no dataLayer, mesmo com aceite', () => {
      const { analytics, consent } = create();

      consent.accept();
      tick();
      analytics.track('page_view', { page_path: '/' });

      expect(gtmScripts().length).toBe(0);
      expect(trackedEvents().length).toBe(0);
    });
  });

  describe('portao de consentimento', () => {
    const original = environment.gtmId;

    // Os cenarios abaixo sao sobre o portao, nao sobre o ID: com um container
    // configurado da para observar o que chega — ou nao chega — ao dataLayer.
    beforeEach(() => (environment.gtmId = 'GTM-TESTE'));
    afterEach(() => (environment.gtmId = original));

    it('nao escreve no dataLayer enquanto nao ha decisao', () => {
      const { analytics } = create();

      analytics.track('view_course', { course_slug: 'imersao-rh' });

      expect(trackedEvents().length).toBe(0);
      expect(gtmScripts().length).toBe(0);
    });

    it('libera a fila na ordem original quando o titular aceita', () => {
      const { analytics, consent } = create();

      analytics.track('page_view', { page_path: '/' });
      analytics.track('view_course', { course_slug: 'imersao-rh' });

      expect(trackedEvents().length).toBe(0);

      consent.accept();
      tick();

      const events = trackedEvents();

      expect(events.map(entry => entry['event'])).toEqual(['page_view', 'view_course']);
      expect(events[1]['course_slug']).toBe('imersao-rh');
    });

    it('carrega o container somente apos o aceite', () => {
      const { consent } = create();

      expect(gtmScripts().length).toBe(0);

      consent.accept();
      tick();

      expect(gtmScripts().length).toBe(1);
    });

    it('descarta a fila e para de registrar quando o titular recusa', () => {
      const { analytics, consent } = create();

      analytics.track('page_view', { page_path: '/' });

      consent.reject();
      tick();

      analytics.track('view_course', { course_slug: 'imersao-rh' });

      expect(trackedEvents().length).toBe(0);
      expect(gtmScripts().length).toBe(0);
    });

    it('envia direto quando o aceite ja existia desde o inicio da sessao', () => {
      storeAcceptedConsent();

      const { analytics, consent } = create();

      expect(consent.analyticsAllowed()).toBeTrue();

      analytics.track('purchase', { transaction_id: 'MOCK-1', mocked: true });

      const events = trackedEvents();

      expect(events.length).toBe(1);
      expect(events[0]['mocked']).toBeTrue();
    });
  });
});
