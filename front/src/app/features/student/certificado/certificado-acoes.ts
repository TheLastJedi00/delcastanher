import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CertificatePdfService,
  certificateFileName,
} from '../../../core/services/certificate-pdf.service';
import { Button } from '../../../shared/ui/button/button';
import { VERIFICATION_PATH } from './verification';

/**
 * Acoes da folha do diploma, iguais no do curso e no de modulo (Spec 024,
 * Task 4.2): baixar o PDF, imprimir e ver a verificacao publica.
 *
 * "Baixar PDF" e o principal: antes o unico botao abria a impressao, e o aluno
 * precisava saber escolher "Salvar como PDF" no navegador.
 */
@Component({
  selector: 'app-certificado-acoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, RouterLink],
  host: { class: 'block print-hidden' },
  template: `
    <div class="flex flex-col gap-3 sm:flex-row">
      <ui-button variant="primary" [loading]="downloading()" (click)="download()">
        Baixar PDF
      </ui-button>
      <ui-button variant="outline" (click)="print()">Imprimir</ui-button>
      <a [routerLink]="verificationPath" [queryParams]="{ codigo: code() }">
        <ui-button variant="ghost">Ver como um recrutador vê</ui-button>
      </a>
    </div>
    @if (error()) {
      <p class="mt-3 text-sm text-state-danger" role="alert">{{ error() }}</p>
    }
  `,
})
export class CertificadoAcoes {
  private readonly pdf = inject(CertificatePdfService);

  /** A folha `ui-certificado` que vira o PDF. */
  readonly sheet = input.required<HTMLElement>();
  readonly code = input.required<string>();

  protected readonly verificationPath = VERIFICATION_PATH;
  protected readonly downloading = signal(false);
  protected readonly error = signal('');

  protected async download(): Promise<void> {
    this.downloading.set(true);
    this.error.set('');

    try {
      await this.pdf.download(this.sheet(), certificateFileName(this.code()));
    } catch {
      this.error.set('Não foi possível gerar o PDF. Tente de novo ou use "Imprimir".');
    } finally {
      this.downloading.set(false);
    }
  }

  /** Impressao nativa, para quem quer o papel. */
  protected print(): void {
    window.print();
  }
}
