import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CONSENT_POLICY_VERSION } from '../../core/services/consent.service';
import { LegalPage, LegalPageState } from './legal-page';
import { PRIVACY_SECTIONS } from './politica-de-privacidade.sections';

/**
 * Politica de Privacidade — documento em vigor (Spec 015).
 *
 * As secoes 1 a 14 e a Declaracao de Ciencia sao a transcricao **literal** do
 * texto entregue pelo juridico em 13/09/2026, guardado em
 * `.specs/015 - Juridico/notas-originais.md`. Nenhuma frase foi reescrita,
 * encurtada ou reordenada, e a numeracao e a do documento — nao a das dez
 * clausulas que a Spec 009 tinha desenhado como roteiro. Aquele roteiro
 * cumpriu o papel dele; agora quem manda e o texto revisado (decisao 1).
 *
 * Duas intervencoes, ambas deliberadas:
 *
 * - A secao 10 chegou com `[e-mail para assuntos de privacidade/LGPD]`,
 *   `[nome, se aplicavel]` e `[numero]` nao preenchidos. E-mail e telefone
 *   saem de `company-info.ts`; o Encarregado e **omitido** em vez de
 *   inventado, porque indica-lo e ato da controladora (Art. 41), nao escolha
 *   de implementacao (decisao 5).
 * - A secao 15 nao vem do juridico e diz isso na primeira linha. Ela existe
 *   porque a plataforma faz promessas concretas que um texto generico nao
 *   alcanca — dado de cartao que nunca chega aqui, cookie que so carrega apos
 *   consentimento, certificado que sobrevive a expiracao do acesso (decisao 2).
 *
 * O rodape repetido do PDF ("DELCASTANHER ... • Politica de Privacidade e
 * Protecao de Dados") e artefato de diagramacao, nao conteudo, e nao entra.
 */
@Component({
  selector: 'app-politica-de-privacidade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Política de Privacidade e Proteção de Dados – LGPD"
      summary="Como a Delcastanher coleta, utiliza, armazena, compartilha e protege dados pessoais, e quais direitos você pode exercer sobre eles."
      [state]="state"
      unpublishedNotice="A Política de Privacidade está em preparação e será publicada nesta página.">
      <!-- Fecha o documento e nao e clausula: vai fora da lista, em caixa
           propria, para nao se confundir com as secoes numeradas. -->
      <div class="rounded-xl border border-brand-navy/10 bg-white p-5 shadow-card">
        <p class="mb-2 text-sm font-bold uppercase tracking-wider text-brand-navy">
          Declaração de ciência
        </p>
        <p class="text-base leading-relaxed text-slate-600">
          Ao utilizar o site e, quando aplicável, ao fornecer seus dados pessoais, o usuário
          declara ter tido acesso a esta Política de Privacidade e estar ciente das condições
          nela descritas, sem prejuízo dos direitos assegurados pela legislação aplicável.
        </p>
      </div>
    </app-legal-page>
  `,
})
export class PoliticaDePrivacidade {
  protected readonly state: LegalPageState = {
    status: 'ready',
    sections: PRIVACY_SECTIONS,
    policyVersion: CONSENT_POLICY_VERSION,
    publishedAt: '2026-09-13T12:00:00.000Z',
  };
}
