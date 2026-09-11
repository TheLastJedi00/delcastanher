import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ContentService, MaterialItem, formatFileSize } from '../../../core/services/content.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { MaterialItem as MaterialItemComponent } from '../../../shared/ui/material-item/material-item';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/**
 * Central de materiais do curso.
 *
 * Ate a Spec 010 esta tela tinha a propria lista fixa, diferente da que a
 * trilha exibia para o mesmo curso (decisao 15). As duas passam a ler da API, e
 * o link de download e uma URL assinada de validade curta — nao um arquivo
 * publico no bucket.
 */
@Component({
  selector: 'app-materiais',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, BackLink, Button, SectionHeader, Card, MaterialItemComponent],
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
        @if (loading()) {
          <p class="text-sm text-slate-500">Carregando seus materiais…</p>
        } @else if (error()) {
          <p class="text-sm text-slate-700" role="alert">{{ error() }}</p>
          <div class="mt-4">
            <ui-button variant="outline" (click)="reload()">Tentar novamente</ui-button>
          </div>
        } @else if (materials().length === 0) {
          <p class="text-sm text-slate-500">
            Nenhum material publicado ainda. Assim que um módulo receber anexos, eles aparecem aqui.
          </p>
        } @else {
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            @for (material of materials(); track material.id) {
              <ui-material-item
                [fileName]="material.fileName"
                [fileType]="material.fileType"
                [fileSize]="sizeLabel(material.sizeBytes)"
                [moduleLabel]="'Módulo ' + material.moduleOrder"
                [downloadUrl]="material.downloadUrl" />
            }
          </div>
        }
      </ui-card>
    </ui-page-container>
  `,
})
export class Materiais {
  private readonly content = inject(ContentService);

  protected readonly materials = signal<MaterialItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.reload();
  }

  protected sizeLabel(bytes: number): string {
    return formatFileSize(bytes);
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set('');

    this.content.allMaterials().subscribe({
      next: materials => {
        this.materials.set(materials);
        this.loading.set(false);
      },
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }
}
