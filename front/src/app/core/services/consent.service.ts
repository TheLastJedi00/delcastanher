import { Injectable, PLATFORM_ID, afterNextRender, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'delcastanher.consent';

/**
 * Versao vigente das politicas apresentadas no banner.
 *
 * Quando o texto legal mudar de forma relevante, esta constante sobe: o
 * consentimento gravado sob a versao anterior deixa de valer e o banner volta
 * a aparecer. Sem isso, um aceite de 2026 seguiria valendo para uma politica
 * de 2028 que o titular nunca leu.
 */
export const CONSENT_POLICY_VERSION = '2026-09-10';

export type ConsentChoice = 'accepted' | 'rejected';

export interface ConsentRecord {
  choice: ConsentChoice;
  /** ISO 8601 do momento da escolha — e a prova de consentimento (Art. 8o). */
  decidedAt: string;
  /** Versao da politica vigente quando a escolha foi feita. */
  policyVersion: string;
}

/**
 * Unica fonte de verdade do consentimento de cookies (Spec 009, decisoes 9 e 10).
 *
 * O servico nao carrega nem dispara nada por conta propria: ele apenas registra
 * a escolha do titular de forma auditavel (escolha + data + versao) e expoe
 * `analyticsAllowed`, que e o portao que o `AnalyticsService` consulta antes de
 * qualquer evento.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  /**
   * O prerender roda este servico no Node, onde `localStorage` nao existe.
   * No servidor nao ha titular nem escolha: o estado nasce vazio e o banner so
   * aparece depois da hidratacao, no navegador de quem esta visitando.
   */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly record = signal<ConsentRecord | null>(this.readStoredRecord());
  /**
   * Reabertura manual pelo rodape (decisao 10): revogar precisa ser tao facil
   * quanto aceitar, entao o banner volta mesmo havendo escolha registrada.
   */
  private readonly reopened = signal(false);
  /** `afterNextRender` so roda no navegador: no servidor isto fica falso. */
  private readonly hydrated = signal(false);

  constructor() {
    afterNextRender(() => this.hydrated.set(true));
  }

  /** Escolha vigente, ou `null` quando nao ha nenhuma valida para esta versao. */
  readonly choice = computed(() => this.record()?.choice ?? null);

  /** Registro completo, para exibir data e versao em tela de preferencias. */
  readonly current = computed(() => this.record());

  readonly hasDecision = computed(() => this.record() !== null);

  /** Portao consultado pelo AnalyticsService antes de qualquer disparo. */
  readonly analyticsAllowed = computed(() => this.record()?.choice === 'accepted');

  /**
   * O banner aparece sem escolha valida, ou quando o titular pede para rever.
   *
   * So depois da hidratacao: o HTML prerenderizado e o mesmo para todo mundo e
   * nao tem como saber o que ha no `localStorage` de quem esta visitando. Se o
   * banner saisse no prerender, quem ja decidiu o veria piscar em toda visita.
   */
  readonly bannerVisible = computed(
    () => this.hydrated() && (this.reopened() || !this.hasDecision())
  );

  accept(): void {
    this.persist('accepted');
  }

  reject(): void {
    this.persist('rejected');
  }

  /** Reabre o banner a partir do rodape, sem apagar a escolha atual. */
  reopen(): void {
    this.reopened.set(true);
  }

  private persist(choice: ConsentChoice): void {
    const record: ConsentRecord = {
      choice,
      decidedAt: new Date().toISOString(),
      policyVersion: CONSENT_POLICY_VERSION,
    };

    this.record.set(record);
    this.reopened.set(false);

    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Navegador com armazenamento bloqueado: a escolha vale para a sessao em
      // memoria e o banner reaparece na proxima visita. Perder o registro e
      // aceitavel; disparar evento sem ter onde provar o aceite nao e.
    }
  }

  private readStoredRecord(): ConsentRecord | null {
    if (!this.isBrowser) {
      return null;
    }

    let raw: string | null = null;

    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as ConsentRecord;

      if (parsed?.choice !== 'accepted' && parsed?.choice !== 'rejected') {
        return null;
      }

      // Consentimento dado sob politica anterior nao vale para a atual.
      if (parsed.policyVersion !== CONSENT_POLICY_VERSION) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }
}
