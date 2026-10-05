import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CertificateService } from '../../../core/services/certificate.service';
import { ProgressService } from '../../../core/services/progress.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { CertificadoDiploma } from '../../../shared/ui/certificado/certificado';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/** Endereco que o terceiro digita para conferir o diploma. */
export const VERIFICATION_PATH = '/certificado/verificar';

/** Endereco da verificacao com o host, como sai impresso no diploma. */
export function verificationUrl(): string {
  return typeof location === 'undefined' ? VERIFICATION_PATH : `${location.host}${VERIFICATION_PATH}`;
}

/**
 * Diploma digital do aluno (`/ava/certificado`).
 *
 * Tres estados: trilha incompleta (mostra o que falta), trilha concluida sem
 * certificado (oferece a emissao) e certificado emitido (diploma + impressao).
 * Nenhum dado do diploma e calculado aqui — codigo, hash e data vem da API.
 */
@Component({
  selector: 'app-certificado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackLink,
    Button,
    Card,
    CertificadoDiploma,
    PageContainer,
    ProgressBar,
    RouterLink,
    SectionHeader,
  ],
  template: `
    <ui-page-container maxWidth="lg">
      <div class="mb-4 print-hidden">
        <ui-back-link link="/ava" />
      </div>

      <div class="mb-8 print-hidden">
        <ui-section-header
          overline="Certificado"
          level="h1"
          title="Seu diploma digital"
          [subtitle]="subtitle()" />
      </div>

      @if (loading()) {
        <ui-card variant="default" padding="lg" [hover]="false">
          <p class="text-sm text-slate-500">Carregando seu certificado…</p>
        </ui-card>
      } @else if (error()) {
        <ui-card variant="default" padding="lg" [hover]="false">
          <p class="text-sm text-slate-700" role="alert">{{ error() }}</p>
          <div class="mt-4">
            <ui-button variant="outline" (click)="reload()">Tentar novamente</ui-button>
          </div>
        </ui-card>
      } @else if (certificate(); as diploma) {
        <!-- Bloco impresso: tudo fora de .print-area some no papel. -->
        <article class="print-area overflow-hidden rounded-2xl shadow-card">
          <ui-certificado [data]="diploma" [verificationUrl]="verificationUrl" />
        </article>

        <div class="mt-8 flex flex-col gap-3 sm:flex-row print-hidden">
          <ui-button variant="primary" (click)="print()">Baixar / imprimir</ui-button>
          <a [routerLink]="verificationPath" [queryParams]="{ codigo: diploma.code }">
            <ui-button variant="outline">Ver como um recrutador vê</ui-button>
          </a>
        </div>
      } @else if (courseCompleted()) {
        <ui-card variant="default" padding="lg" [hover]="false">
          <h2 class="text-xl font-bold text-brand-navy">Trilha concluída</h2>
          <p class="mt-2 text-sm text-slate-500">
            Você concluiu todos os {{ totalCount() }} módulos. Emita seu certificado para
            visualizar, imprimir e compartilhar o código de validação.
          </p>
          <div class="mt-6">
            <ui-button variant="primary" [loading]="issuing()" (click)="issue()">
              Emitir certificado
            </ui-button>
          </div>
        </ui-card>
      } @else {
        <ui-card variant="default" padding="lg" [hover]="false">
          <h2 class="text-xl font-bold text-brand-navy">Seu certificado ainda não está liberado</h2>
          <p class="mt-2 text-sm text-slate-500">{{ remainingLabel() }}</p>

          <div class="mt-6 max-w-md">
            <ui-progress-bar
              [value]="percentage()"
              variant="gradient"
              size="md"
              [showLabel]="true"
              label="Progresso no curso" />
          </div>

          <div class="mt-6">
            <a [routerLink]="resumeLink()">
              <ui-button variant="primary">Continuar estudando</ui-button>
            </a>
          </div>
        </ui-card>
      }
    </ui-page-container>
  `,
})
export class Certificado {
  private readonly certificates = inject(CertificateService);
  private readonly progressService = inject(ProgressService);

  protected readonly verificationPath = VERIFICATION_PATH;
  protected readonly verificationUrl = verificationUrl();

  protected readonly loading = signal(true);
  protected readonly issuing = signal(false);
  protected readonly error = signal('');

  protected readonly certificate = this.certificates.certificate;
  protected readonly courseCompleted = this.progressService.courseCompleted;
  protected readonly percentage = this.progressService.percentage;
  protected readonly totalCount = this.progressService.totalCount;

  protected readonly subtitle = computed(() =>
    this.certificate()
      ? 'Imprima ou salve em PDF. O código de validação permite que terceiros confiram a autenticidade.'
      : 'Conclua todos os módulos da trilha para emitir seu certificado.',
  );

  protected readonly remainingLabel = computed(() => {
    const remaining = this.progressService.totalCount() - this.progressService.completedCount();

    return remaining === 1
      ? 'Falta 1 módulo para você concluir a trilha.'
      : `Faltam ${remaining} módulos para você concluir a trilha.`;
  });

  protected readonly resumeLink = computed(() => {
    const next = this.progressService.nextModule();

    return next ? `/ava/trilha/${next.id}` : '/ava/trilha';
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set('');

    // Progresso e certificado sao independentes: o primeiro decide o estado da
    // tela, o segundo traz o diploma se ja existir.
    this.progressService.load().subscribe({
      next: () => this.loadCertificate(),
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }

  protected issue(): void {
    this.issuing.set(true);
    this.error.set('');

    this.certificates.issue().subscribe({
      next: () => this.issuing.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.issuing.set(false);
      },
    });
  }

  /** Impressao nativa: o "salvar como PDF" e do proprio navegador. */
  protected print(): void {
    window.print();
  }

  private loadCertificate(): void {
    this.certificates.load().subscribe({
      next: () => this.loading.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }
}
