import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LegalPage, LegalPageState } from './legal-page';

/**
 * Termos de Uso (Spec 022).
 *
 * O texto e do juridico e entra pelo painel: enquanto nao for publicado, a
 * pagina diz isso e da o contato da controladora (decisao 5). Sem roteiro de
 * clausulas e sem marcador de texto a redigir — a Spec 009 (decisao 11)
 * proibia texto juridico plausivel no lugar do definitivo, e isso continua.
 */
@Component({
  selector: 'app-termos-de-uso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Termos de Uso"
      summary="Condições que regem o acesso e o uso da plataforma Delcastanher, dos cursos e da área do aluno."
      [state]="state"
      unpublishedNotice="Os Termos de Uso estão em preparação e serão publicados nesta página." />
  `,
})
export class TermosDeUso {
  protected readonly state: LegalPageState = { status: 'unpublished' };
}
