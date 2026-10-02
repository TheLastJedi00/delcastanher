import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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

          <div class="space-y-3">
            @for (block of section.body; track $index) {
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
        </section>
      }
    </div>
  `,
})
export class LegalSections {
  readonly sections = input.required<readonly LegalSection[]>();
}
