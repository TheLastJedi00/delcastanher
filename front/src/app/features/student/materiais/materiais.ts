import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ContentService, MaterialItem, formatFileSize } from '../../../core/services/content.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { MaterialItem as MaterialItemComponent } from '../../../shared/ui/material-item/material-item';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/** Materiais de uma aula, na ordem em que a trilha os apresenta. */
interface LessonGroup {
  key: string;
  moduleOrder: number;
  moduleTitle: string;
  lessonOrder: number;
  lessonTitle: string;
  materials: MaterialItem[];
}

/**
 * Central de materiais do curso.
 *
 * Ate a Spec 010 esta tela tinha a propria lista fixa, diferente da que a
 * trilha exibia para o mesmo curso (decisao 15). As duas passam a ler da API, e
 * o link de download e uma URL assinada de validade curta — nao um arquivo
 * publico no bucket.
 *
 * Desde a Spec 012 o material pertence a uma aula, e nao ao modulo: a lista e
 * agrupada por modulo → aula, que e a mesma hierarquia da trilha. Sem o
 * agrupamento, dezenas de arquivos apareceriam num grid unico sem dizer de
 * qual video cada um veio.
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
          subtitle="Encontre aqui todos os templates e planilhas disponibilizados nas aulas." />
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
            Nenhum material publicado ainda. Assim que uma aula receber anexos, eles aparecem aqui.
          </p>
        } @else {
          @for (group of groups(); track group.key) {
            <section class="mb-8 last:mb-0">
              <h2 class="mb-1 text-sm font-bold uppercase tracking-widest text-brand-teal-deep">
                Módulo {{ group.moduleOrder }} · {{ group.moduleTitle }}
              </h2>
              <h3 class="mb-4 text-base font-semibold text-brand-navy">
                Aula {{ group.lessonOrder }} · {{ group.lessonTitle }}
              </h3>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                @for (material of group.materials; track material.id) {
                  <ui-material-item
                    [fileName]="material.fileName"
                    [fileType]="material.fileType"
                    [fileSize]="sizeLabel(material.sizeBytes)"
                    [moduleLabel]="'Aula ' + material.lessonOrder + ' · Módulo ' + material.moduleOrder"
                    [downloadUrl]="material.downloadUrl" />
                }
              </div>
            </section>
          }
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

  /**
   * Agrupamento por aula. A API ja devolve na ordem modulo → aula → material,
   * entao aqui basta quebrar a lista quando a aula muda: reordenar de novo no
   * cliente abriria espaco para as duas ordens divergirem.
   */
  protected readonly groups = computed<LessonGroup[]>(() => {
    const groups: LessonGroup[] = [];

    for (const material of this.materials()) {
      const last = groups.at(-1);

      if (last?.key === material.lessonId) {
        last.materials.push(material);
        continue;
      }

      groups.push({
        key: material.lessonId,
        moduleOrder: material.moduleOrder,
        moduleTitle: material.moduleTitle,
        lessonOrder: material.lessonOrder,
        lessonTitle: material.lessonTitle,
        materials: [material],
      });
    }

    return groups;
  });

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
