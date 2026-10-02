import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader } from '../../shared/ui/nav-header/nav-header';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { COMPANY } from './company-info';
import { LegalSection } from './legal-section';
import { LegalSections } from './legal-sections';

export type { LegalBlock, LegalSection } from './legal-section';
export { p, ul } from './legal-section';

/**
 * O que a pagina legal mostra (Spec 022, decisoes 4 e 5).
 *
 * - `loading`: o texto ainda nao chegou — e tambem o HTML do build quando a
 *   API nao respondeu, que o navegador completa ao hidratar.
 * - `unpublished`: o documento nao tem versao publicada. Nao ha placeholder
 *   nem roteiro: um aviso honesto e o contato da controladora.
 * - `ready`: a versao publicada vigente.
 * - `error`: o navegador nao conseguiu ler o texto, e nada tinha chegado antes.
 */
export type LegalPageState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unpublished' }
  | {
      status: 'ready';
      sections: readonly LegalSection[];
      policyVersion: string;
      publishedAt: string;
    };

/**
 * Casca comum das tres paginas legais (Spec 009, decisao 11).
 *
 * Desde a Spec 022 o texto vem do banco, publicado pelo painel, e a casca so
 * o apresenta. O modo "pendente de revisao juridica", com o marcador de texto
 * a redigir e o roteiro das clausulas, saiu: o roteiro servia a quem fosse
 * redigir, e com o texto colado no painel ele nao tem mais leitor.
 */
@Component({
  selector: 'app-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavHeader, Footer, PageContainer, LegalSections, DatePipe],
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

          @if (ready(); as doc) {
            <app-legal-sections [sections]="doc.sections" />
          } @else {
            @switch (state().status) {
              @case ('loading') {
                <p class="text-base text-slate-500" role="status">Carregando o documento…</p>
              }
              @case ('error') {
                <p class="text-base text-state-danger" role="alert">
                  Não foi possível carregar o documento agora. Tente de novo em instantes.
                </p>
              }
              @case ('unpublished') {
                <div
                  class="rounded-xl border border-brand-navy/10 bg-white p-5 shadow-card"
                  data-testid="em-preparacao">
                  <p class="text-base leading-relaxed text-slate-700">{{ unpublishedNotice() }}</p>
                  <p class="mt-3 text-sm leading-relaxed text-slate-600">
                    Dúvidas podem ser enviadas à {{ company.legalName }}: {{ company.email }} ou
                    {{ company.phone }}.
                  </p>
                </div>
              }
            }
          }

          <!-- Slot para controles proprios da pagina (ex.: rever preferencias
               na Politica de Cookies), ainda dentro do main e acima do rodape. -->
          <div class="mt-10 empty:mt-0">
            <ng-content />
          </div>

          @if (ready(); as doc) {
            <p class="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
              Versão vigente: {{ doc.policyVersion }}, publicada em
              {{ doc.publishedAt | date: 'dd/MM/yyyy' }}. Alterações relevantes deste documento
              reabrem o pedido de consentimento de cookies.
            </p>
          }
        </ui-page-container>
      </main>

      <ui-footer />
    </div>
  `,
})
export class LegalPage {
  /** Rotulo do botao do cabecalho conforme a sessao (Spec 019, decisao 16). */
  protected readonly authenticated = inject(AuthService).isAuthenticated;

  protected readonly company = COMPANY;

  readonly title = input.required<string>();
  readonly summary = input.required<string>();
  readonly state = input.required<LegalPageState>();
  /** O aviso do documento sem versao publicada (decisao 5). */
  readonly unpublishedNotice = input.required<string>();

  protected readonly ready = computed(() => {
    const state = this.state();

    return state.status === 'ready' ? state : null;
  });
}
