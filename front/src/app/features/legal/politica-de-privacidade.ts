import { ChangeDetectionStrategy, Component } from '@angular/core';
import { legalDocumentState } from './legal-document-state';
import { LegalPage } from './legal-page';

/**
 * Politica de Privacidade (Spec 015; texto no banco desde a Spec 022).
 *
 * As secoes vem da versao publicada pelo painel. A primeira versao e a carga
 * inicial da Spec 022 (decisao 10): a transcricao literal do texto entregue
 * pelo juridico em 13/09/2026, com as duas intervencoes da Spec 015 — o
 * contato da secao 10 preenchido, o Encarregado omitido e a secao 15 de
 * complemento operacional.
 *
 * A Declaracao de Ciencia fecha o documento e nao e clausula: fica aqui, em
 * caixa propria, e so aparece junto do texto publicado.
 */
@Component({
  selector: 'app-politica-de-privacidade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Política de Privacidade e Proteção de Dados – LGPD"
      summary="Como a Delcastanher coleta, utiliza, armazena, compartilha e protege dados pessoais, e quais direitos você pode exercer sobre eles."
      [state]="state()"
      unpublishedNotice="A Política de Privacidade está em preparação e será publicada nesta página.">
      <!-- Fecha o documento e nao e clausula: vai fora da lista, em caixa
           propria, para nao se confundir com as secoes numeradas. -->
      @if (state().status === 'ready') {
        <div class="rounded-xl border border-brand-navy/10 bg-white p-5 shadow-card">
          <p class="mb-2 text-sm font-bold uppercase tracking-wider text-brand-navy">
            Declaração de ciência
          </p>
          <p class="text-base leading-relaxed text-slate-600">
            Ao utilizar o site e, quando aplicável, ao fornecer seus dados pessoais, o usuário
            declara ter tido acesso a esta Política de Privacidade e estar ciente das condições nela
            descritas, sem prejuízo dos direitos assegurados pela legislação aplicável.
          </p>
        </div>
      }
    </app-legal-page>
  `,
})
export class PoliticaDePrivacidade {
  protected readonly state = legalDocumentState('PRIVACY');
}
