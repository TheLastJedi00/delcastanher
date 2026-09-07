import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Card } from '../../../shared/ui/card/card';
import { FileType, MaterialItem } from '../../../shared/ui/material-item/material-item';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

interface Material {
  fileName: string;
  fileType: FileType;
  fileSize: string;
  moduleLabel: string;
}

@Component({
  selector: 'app-materiais',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, BackLink, SectionHeader, Card, MaterialItem],
  template: `
    <ui-page-container maxWidth="lg">
      <div class="mb-6">
        <ui-back-link />
      </div>

      <div class="mb-6">
        <ui-section-header
          overline="Downloads"
          title="Central de Materiais"
          subtitle="Encontre aqui todos os templates e planilhas disponibilizados nos módulos." />
      </div>

      <ui-card variant="default" padding="lg" [hover]="false">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          @for (material of materials; track material.fileName) {
            <ui-material-item
              [fileName]="material.fileName"
              [fileType]="material.fileType"
              [fileSize]="material.fileSize"
              [moduleLabel]="material.moduleLabel" />
          }
        </div>
      </ui-card>
    </ui-page-container>
  `,
})
export class Materiais {
  readonly materials: Material[] = [
    {
      fileName: 'Slides: O RH que sua empresa precisa',
      fileType: 'pdf',
      fileSize: '2.4 MB',
      moduleLabel: 'Módulo 1',
    },
    {
      fileName: 'Planilha de Diagnóstico Organizacional',
      fileType: 'xls',
      fileSize: '850 KB',
      moduleLabel: 'Módulo 2',
    },
  ];
}
