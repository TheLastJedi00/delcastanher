import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CertificateService } from '../../../core/services/certificate.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { CertificadoDiploma } from '../../../shared/ui/certificado/certificado';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';
import { VERIFICATION_PATH, verificationUrl } from './certificado';

/**
 * Diploma de um modulo (`/ava/certificado/modulo/:moduleId`, Spec 023, Parte
 * D). Ate a Parte D o diploma de modulo so existia como codigo e link para a
 * verificacao publica; agora ele tem a folha impressa, no mesmo modelo do
 * diploma do curso.
 *
 * A emissao continua na trilha, que e onde o aluno conclui o modulo: esta tela
 * so mostra o que ja foi emitido.
 */
@Component({
  selector: 'app-certificado-modulo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackLink, Button, Card, CertificadoDiploma, PageContainer, RouterLink, SectionHeader],
  template: `
    <ui-page-container maxWidth="lg">
      <div class="mb-4 print-hidden">
        <ui-back-link [link]="trilhaLink()" />
      </div>

      <div class="mb-8 print-hidden">
        <ui-section-header
          overline="Certificado"
          level="h1"
          title="Diploma do módulo"
          subtitle="Imprima ou salve em PDF. O código de validação permite que terceiros confiram a autenticidade." />
      </div>

      @if (loading()) {
        <ui-card variant="default" padding="lg" [hover]="false">
          <p class="text-sm text-slate-500">Carregando seu certificado…</p>
        </ui-card>
      } @else if (error()) {
        <ui-card variant="default" padding="lg" [hover]="false">
          <p class="text-sm text-slate-700" role="alert">{{ error() }}</p>
          <div class="mt-4">
            <ui-button variant="outline" (click)="load()">Tentar novamente</ui-button>
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
      } @else {
        <ui-card variant="default" padding="lg" [hover]="false">
          <h2 class="text-xl font-bold text-brand-navy">Diploma ainda não emitido</h2>
          <p class="mt-2 text-sm text-slate-500">
            Conclua todas as aulas do módulo e emita o diploma na trilha.
          </p>
          <div class="mt-6">
            <a [routerLink]="trilhaLink()">
              <ui-button variant="primary">Ir para o módulo</ui-button>
            </a>
          </div>
        </ui-card>
      }
    </ui-page-container>
  `,
})
export class CertificadoModulo {
  private readonly certificates = inject(CertificateService);
  private readonly route = inject(ActivatedRoute);

  private readonly moduleId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('moduleId') ?? '')),
    { initialValue: '' },
  );

  protected readonly verificationPath = VERIFICATION_PATH;
  protected readonly verificationUrl = verificationUrl();

  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly certificate = computed(
    () =>
      this.certificates.moduleCertificates().find(item => item.moduleId === this.moduleId()) ??
      null,
  );

  protected readonly trilhaLink = computed(() => `/ava/trilha/${this.moduleId()}`);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');

    this.certificates.loadModuleCertificates().subscribe({
      next: () => this.loading.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }

  /** Impressao nativa: o "salvar como PDF" e do proprio navegador. */
  protected print(): void {
    window.print();
  }
}
