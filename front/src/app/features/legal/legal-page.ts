import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader } from '../../shared/ui/nav-header/nav-header';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { PlaceholderText } from '../../shared/ui/placeholder-text/placeholder-text';

/** Marcador do corpo ainda nao redigido, no formato reconhecido por `isPlaceholder`. */
export const LEGAL_PLACEHOLDER = '[TEXTO A SER REDIGIDO PELO JURÍDICO]';

export interface LegalSection {
  /** Titulo da clausula — vira `<h2>`. */
  title: string;
  /** Pontos que a clausula precisa cobrir, para orientar quem for redigir. */
  topics: string[];
}

/**
 * Casca comum das tres paginas legais (Spec 009, decisao 11).
 *
 * A estrutura de clausulas e real e a hierarquia de cabecalhos e correta, mas o
 * corpo de cada uma aparece como pendencia explicita. Redigir texto juridico
 * plausivel e deixa-lo indistinguivel do definitivo seria pior que deixa-lo
 * vazio: alguem publicaria achando que passou por advogado.
 */
@Component({
  selector: 'app-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavHeader, Footer, PageContainer, PlaceholderText],
  template: `
    <div class="flex min-h-screen flex-col text-slate-800">
      <ui-nav-header variant="landing" />

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

          <div class="space-y-10">
            @for (section of sections(); track section.title) {
              <section>
                <h2 class="mb-3 text-xl font-bold tracking-tight text-brand-navy">
                  {{ section.title }}
                </h2>

                <ui-placeholder-text [value]="placeholder" />

                <p class="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
                  A cláusula deve cobrir
                </p>
                <ul class="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
                  @for (topic of section.topics; track topic) {
                    <li>{{ topic }}</li>
                  }
                </ul>
              </section>
            }
          </div>

          <!-- Slot para controles proprios da pagina (ex.: rever preferencias
               na Politica de Cookies), ainda dentro do main e acima do rodape. -->
          <div class="mt-10 empty:mt-0">
            <ng-content />
          </div>

          <p class="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
            Versão vigente: {{ policyVersion() }}. Alterações relevantes deste documento
            reabrem o pedido de consentimento de cookies.
          </p>
        </ui-page-container>
      </main>

      <ui-footer />
    </div>
  `,
})
export class LegalPage {
  readonly title = input.required<string>();
  readonly summary = input.required<string>();
  readonly sections = input.required<LegalSection[]>();
  readonly policyVersion = input.required<string>();

  protected readonly placeholder = LEGAL_PLACEHOLDER;
}
