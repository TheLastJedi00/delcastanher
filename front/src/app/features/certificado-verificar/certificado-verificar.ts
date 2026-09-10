import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

/**
 * Portal publico de validacao (`/certificado/verificar`). Casca registrada
 * junto das rotas na Fase 3; o formulario e os tres estados de retorno chegam
 * na Fase 6 da Spec 008.
 */
@Component({
  selector: 'app-certificado-verificar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, SectionHeader],
  template: `
    <ui-page-container maxWidth="md">
      <ui-section-header
        overline="Validação de certificado"
        title="Confira a autenticidade de um certificado"
        subtitle="Informe o código impresso no diploma." />
    </ui-page-container>
  `,
})
export class CertificadoVerificar {}
