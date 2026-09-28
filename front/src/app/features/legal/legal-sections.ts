import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlaceholderText } from '../../shared/ui/placeholder-text/placeholder-text';
import { LegalSection } from './legal-section';

/**
 * Corpo dos documentos legais: um `<h2>` por clausula e os paragrafos e
 * listas dela.
 *
 * Separado da `LegalPage` para servir tambem a pre-visualizacao do painel
 * (Spec 022, decisao 1): a pagina publica e o editor renderizam o texto pelo
 * mesmo componente, e o que a pessoa ve antes de publicar e o que o aluno le.
 * Todo texto entra por interpolacao, nunca por `innerHTML`.
 */
@Component({
  selector: 'app-legal-sections',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceholderText],
  host: { class: 'block' },
  template: `
    <div class="space-y-10">
      <!-- Por indice, e nao por titulo: na pre-visualizacao do painel dois
           titulos iguais sao um rascunho possivel, e nao um erro. -->
      @for (section of sections(); track $index) {
        <section>
          @if (section.title) {
            <h2 class="mb-3 text-xl font-bold tracking-tight text-brand-navy">
              {{ section.title }}
            </h2>
          }

          @if (section.body; as body) {
            <div class="space-y-3">
              @for (block of body; track $index) {
                @switch (block.kind) {
                  @case ('paragraph') {
                    <p class="text-base leading-relaxed text-slate-600">{{ block.text }}</p>
                  }
                  @case ('list') {
                    <ul class="list-disc space-y-1 pl-5 text-base leading-relaxed text-slate-600">
                      @for (item of block.items; track $index) {
                        <li>{{ item }}</li>
                      }
                    </ul>
                  }
                }
              }
            </div>
          } @else {
            <ui-placeholder-text [value]="placeholder()" />

            <p class="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              A cláusula deve cobrir
            </p>
            <ul class="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
              @for (topic of section.topics ?? []; track topic) {
                <li>{{ topic }}</li>
              }
            </ul>
          }
        </section>
      }
    </div>
  `,
})
export class LegalSections {
  readonly sections = input.required<readonly LegalSection[]>();
  /** Marcador da clausula ainda em roteiro. Sai na Fase 3 da Spec 022. */
  readonly placeholder = input('');
}
