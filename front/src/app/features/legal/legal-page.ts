import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader } from '../../shared/ui/nav-header/nav-header';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { LegalSection } from './legal-section';
import { LegalSections } from './legal-sections';

export type { LegalBlock, LegalSection } from './legal-section';
export { p, ul } from './legal-section';

/** Marcador do corpo ainda nao redigido, no formato reconhecido por `isPlaceholder`. */
export const LEGAL_PLACEHOLDER = '[TEXTO A SER REDIGIDO PELO JURÍDICO]';

/**
 * Casca comum das tres paginas legais (Spec 009, decisao 11).
 *
 * Nasceu servindo apenas ao documento pendente: a estrutura de clausulas era
 * real e a hierarquia de cabecalhos correta, mas o corpo de cada uma aparecia
 * como pendencia explicita, porque redigir texto juridico plausivel e deixa-lo
 * indistinguivel do definitivo seria pior que deixa-lo vazio.
 *
 * Com o texto do juridico em maos (Spec 015), a casca passa a servir aos dois
 * estados. Os dois modos convivem de proposito: a Politica de Privacidade e a
 * de Cookies saem do placeholder, os Termos de Uso continuam pendentes — e
 * apagar o modo antigo deixaria aquela pagina sem nada para mostrar
 * (Spec 015, decisao 4).
 */
@Component({
  selector: 'app-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavHeader, Footer, PageContainer, LegalSections],
  template: `
    <div class="flex min-h-screen flex-col text-slate-800">
      <ui-nav-header variant="landing" [authenticated]="authenticated()" />

      <main class="flex-1 bg-slate-50">
        <ui-page-container maxWidth="sm">
          <header class="mb-8">
            <p class="mb-3 text-xs font-bold uppercase tracking-widest text-brand-teal-deep">
              Documentos legais
            </p>
            <h1 class="mb-3 text-3xl font-extrabold tracking-tight text-brand-navy md:text-4xl">
              {{ title() }}
            </h1>
            <p class="text-base leading-relaxed text-slate-600">{{ summary() }}</p>
          </header>

          @if (pending()) {
            <div
              role="note"
              class="mb-10 rounded-xl border border-dashed border-brand-navy/25 bg-brand-navy/5 p-4">
              <p class="text-sm font-semibold text-brand-navy">
                Documento pendente de revisão jurídica
              </p>
              <p class="mt-1 text-sm leading-relaxed text-slate-600">
                A estrutura das cláusulas abaixo já está definida, mas o texto ainda não foi
                redigido nem revisado por advogado. Nada nesta página deve ser tratado como
                termo em vigor.
              </p>
            </div>
          }

          <app-legal-sections [sections]="sections()" [placeholder]="placeholder" />

          <!-- Slot para controles proprios da pagina (ex.: rever preferencias
               na Politica de Cookies), ainda dentro do main e acima do rodape. -->
          <div class="mt-10 empty:mt-0">
            <ng-content />
          </div>

          <p class="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
            Versão vigente: {{ policyVersion() }}.
            <!-- A promessa de reabrir o consentimento so vale para documento em
                 vigor: prometer isso embaixo de um texto que a propria pagina
                 declara nao valer seria prometer no vazio. -->
            @if (!pending()) {
              Alterações relevantes deste documento reabrem o pedido de consentimento de cookies.
            }
          </p>
        </ui-page-container>
      </main>

      <ui-footer />
    </div>
  `,
})
export class LegalPage {
  /** Rotulo do botao do cabecalho conforme a sessao (Spec 019, decisao 16). */
  protected readonly authenticated = inject(AuthService).isAuthenticated;

  readonly title = input.required<string>();
  readonly summary = input.required<string>();
  readonly sections = input.required<readonly LegalSection[]>();
  readonly policyVersion = input.required<string>();

  /**
   * Se o documento ainda espera redacao e revisao de advogado.
   *
   * E obrigatorio de proposito: com duas paginas redigidas e uma pendente, um
   * default silencioso publicaria como vigente a proxima pagina que esquecesse
   * de declarar (decisao 4). Cada pagina legal diz, explicitamente, em que
   * estado esta.
   */
  readonly pending = input.required<boolean>();

  protected readonly placeholder = LEGAL_PLACEHOLDER;
}
