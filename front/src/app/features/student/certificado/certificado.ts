import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PLACEHOLDER } from '../../../core/mocks/placeholders';
import { CertificateService } from '../../../core/services/certificate.service';
import { ProgressService } from '../../../core/services/progress.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { PlaceholderText } from '../../../shared/ui/placeholder-text/placeholder-text';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/** Endereco que o terceiro digita para conferir o diploma. */
const VERIFICATION_PATH = '/certificado/verificar';

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
    PageContainer,
    PlaceholderText,
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
        <article
          class="print-area rounded-3xl border-4 border-brand-teal/30 bg-white p-6 text-center shadow-card md:p-12"
          aria-label="Certificado de conclusão">
          <p class="text-xs font-bold uppercase tracking-[0.3em] text-brand-teal-deep">
            Certificado de Conclusão
          </p>

          <p class="mt-8 text-sm text-slate-500">Certificamos que</p>
          <h2 class="mt-2 text-2xl font-bold tracking-tight text-brand-navy md:text-4xl">
            {{ diploma.studentName }}
          </h2>

          <p class="mt-6 text-sm text-slate-500">concluiu o curso</p>
          <p class="mt-2 text-lg font-semibold text-brand-navy md:text-2xl">
            {{ diploma.courseTitle }}
          </p>

          <div class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-10">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                Carga horária
              </p>
              <p class="mt-1 font-semibold text-brand-navy">
                <ui-placeholder-text [value]="workload()" />
              </p>
            </div>
            <div>
              <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                Data de emissão
              </p>
              <p class="mt-1 font-semibold text-brand-navy">{{ issuedAt() }}</p>
            </div>
          </div>

          <div class="mx-auto mt-10 max-w-xs">
            <!--
              A rubrica digitalizada e de uma pessoa real e ainda nao foi
              enviada; ate la o campo aparece como pendente, no mesmo
              tratamento dos demais placeholders comerciais.
            -->
            <div class="flex h-12 items-end justify-center">
              <ui-placeholder-text [value]="signature" />
            </div>
            <div class="mt-2 border-t border-brand-navy/30 pt-2">
              <p class="text-sm font-semibold text-brand-navy">Coordenação do curso</p>
              <p class="text-xs text-slate-500">Delcastanher</p>
            </div>
          </div>

          <div class="mt-10 border-t border-brand-navy/10 pt-6">
            <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Código de validação
            </p>
            <p class="mt-1 text-lg font-bold tracking-[0.2em] text-brand-navy tabular-nums">
              {{ diploma.code }}
            </p>
            <p class="mt-2 text-xs leading-relaxed text-slate-500">
              Confira a autenticidade em {{ verificationUrl() }}
            </p>
            <p class="mt-2 break-all text-[10px] leading-relaxed text-slate-400">
              Hash: {{ diploma.hash }}
            </p>
          </div>
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

  /** Carga horaria ainda placeholder no comercial: nulo vira "a definir". */
  protected readonly workload = computed(() => {
    const hours = this.certificate()?.workloadHours;

    return hours === null || hours === undefined ? PLACEHOLDER.workload : `${hours} horas`;
  });

  protected readonly signature = PLACEHOLDER.signature;

  protected readonly issuedAt = computed(() => {
    const issued = this.certificate()?.issuedAt;

    return issued ? new Date(issued).toLocaleDateString('pt-BR') : '';
  });

  protected readonly verificationUrl = computed(() =>
    typeof location === 'undefined'
      ? VERIFICATION_PATH
      : `${location.host}${VERIFICATION_PATH}`,
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
