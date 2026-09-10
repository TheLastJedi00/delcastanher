import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/**
 * Certificado do aluno (`/ava/certificado`). Casca registrada junto das rotas
 * na Fase 3; o diploma e a impressao chegam na Fase 5 da Spec 008.
 */
@Component({
  selector: 'app-certificado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, SectionHeader],
  template: `
    <ui-page-container maxWidth="lg">
      <ui-section-header
        overline="Certificado"
        title="Seu diploma digital"
        subtitle="Conclua a trilha para emitir o certificado." />
    </ui-page-container>
  `,
})
export class Certificado {}
