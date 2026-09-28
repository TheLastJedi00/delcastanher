import { Injectable, PLATFORM_ID, afterNextRender, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LegalDocumentsService } from './legal-documents.service';

const STORAGE_KEY = 'delcastanher.consent';

export type ConsentChoice = 'accepted' | 'rejected';

export interface ConsentRecord {
  choice: ConsentChoice;
  /** ISO 8601 do momento da escolha — e a prova de consentimento (Art. 8o). */
  decidedAt: string;
  /**
   * Versao da politica vigente quando a escolha foi feita. Nula so enquanto a
   * API nao respondeu: a versao e anotada quando chega, e se nunca chegar a
   * escolha vale nesta visita e o banner pergunta de novo na proxima.
   */
  policyVersion: string | null;
}

/**
 * Unica fonte de verdade do consentimento de cookies (Spec 009, decisoes 9 e 10).
 *
 * O servico nao carrega nem dispara nada por conta propria: ele apenas registra
 * a escolha do titular de forma auditavel (escolha + data + versao) e expoe
 * `analyticsAllowed`, que e o portao que o `AnalyticsService` consulta antes de
 * qualquer evento.
 *
 * **A versao da politica vem da API** desde a Spec 022 (decisao 8), e nao mais
 * de uma constante: publicar uma nova versao no painel reabre o banner sem
 * deploy. Quando a versao muda, o consentimento gravado sob a anterior deixa de
 * valer — um aceite de 2026 nao segue valendo para uma politica de 2028 que o
 * titular nunca leu.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  /**
   * O prerender roda este servico no Node, onde `localStorage` nao existe.
   * No servidor nao ha titular nem escolha: o estado nasce vazio e o banner so
   * aparece depois da hidratacao, no navegador de quem esta visitando.
   */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** O que esta gravado no navegador, de qualquer versao. */
  private readonly stored = signal<ConsentRecord | null>(this.readStoredRecord());

  /**
   * Versao vigente segundo a API. `undefined` enquanto ela nao responde — ou
   * se falhar —, e nesse meio tempo vale o registro gravado: quem ja decidiu
   * nao ve o banner aparecer e sumir, e falha de rede nao vira nem
   * "consentimento presumido" nem banner em laco (decisao 8).
   */
  private readonly currentVersion = signal<string | null | undefined>(undefined);

  /**
   * Reabertura manual pelo rodape (decisao 10): revogar precisa ser tao facil
   * quanto aceitar, entao o banner volta mesmo havendo escolha registrada.
   */
  private readonly reopened = signal(false);
  /** `afterNextRender` so roda no navegador: no servidor isto fica falso. */
  private readonly hydrated = signal(false);

  /** A escolha gravada que vale para a versao vigente. */
  private readonly record = computed(() => {
    const stored = this.stored();
    const version = this.currentVersion();

    if (!stored || version === undefined) {
      return stored;
    }

    // Consentimento dado sob politica anterior nao vale para a atual.
    return stored.policyVersion === version ? stored : null;
  });

  private readonly legal = inject(LegalDocumentsService);
  private versionRequested = false;
  /** A escolha desta visita gravada antes de a versao chegar. */
  private unversioned: ConsentRecord | null = null;

  constructor() {
    afterNextRender(() => this.hydrated.set(true));

    // So pergunta a versao quando ela importa: para validar uma escolha ja
    // gravada. Quem nunca decidiu ve o banner de qualquer jeito, e a versao so
    // e buscada quando a pessoa decidir (`persist`).
    if (this.stored()) {
      this.loadVersion();
    }
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
      policyVersion: this.currentVersion() ?? null,
    };

    this.save(record);
    this.reopened.set(false);

    if (record.policyVersion === null) {
      this.unversioned = record;
      this.loadVersion();
    }
  }

  /**
   * Busca a versao vigente, uma vez por visita, direto na rede. Se a escolha
   * foi gravada antes de a versao chegar, a versao e anotada nela — e so nela:
   * uma escolha de outra versao continua sendo de outra versao.
   */
  private loadVersion(): void {
    if (!this.isBrowser || this.versionRequested) {
      return;
    }

    this.versionRequested = true;
    this.legal.policyStatus(true).subscribe({
      next: ({ version }) => {
        const stored = this.stored();

        // So a escolha feita nesta visita, antes de a versao chegar. Um
        // registro sem versao de uma visita anterior nao se sabe sob qual
        // texto foi dado, e continua sem valer.
        if (stored && stored === this.unversioned && version !== null) {
          this.save({ ...stored, policyVersion: version });
        }

        this.unversioned = null;

        this.currentVersion.set(version);
      },
      error: () => undefined,
    });
  }

  private save(record: ConsentRecord): void {
    this.stored.set(record);

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

      return parsed;
    } catch {
      return null;
    }
  }
}
