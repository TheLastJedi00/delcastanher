import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader } from '../../shared/ui/nav-header/nav-header';

/**
 * Pagina 404 (Spec 009, decisao 7).
 *
 * Substitui o antigo `redirectTo: ''`, que respondia qualquer URL inexistente
 * com a landing — conteudo duplicado sob infinitos enderecos, e um visitante
 * sem nenhuma pista de que errou o link.
 *
 * O `noindex` vem da rota (`data.seo`), nao daqui: em hospedagem estatica o
 * status HTTP continua 200, entao a meta tag e o unico sinal disponivel para o
 * buscador nao tratar isto como pagina valida.
 */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NavHeader, Footer, Button],
  template: `
    <div class="flex min-h-screen flex-col text-slate-800">
      <ui-nav-header variant="landing" />

      <main class="flex flex-1 items-center justify-center px-4 py-20">
        <div class="mx-auto max-w-lg text-center">
          <p class="mb-3 text-xs font-bold uppercase tracking-widest text-brand-teal-deep">
            Erro 404
          </p>
          <h1 class="mb-4 text-3xl font-extrabold tracking-tight text-brand-navy md:text-4xl">
            Não encontramos esta página
          </h1>
          <p class="mb-8 text-base leading-relaxed text-slate-600">
            O endereço pode ter mudado ou o link pode estar incompleto. Comece pela página
            inicial ou veja os cursos e planos disponíveis.
          </p>

          <div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a routerLink="/">
              <ui-button variant="primary">Ir para a página inicial</ui-button>
            </a>
            <a routerLink="/planos">
              <ui-button variant="outline">Ver planos e cursos</ui-button>
            </a>
          </div>
        </div>
      </main>

      <ui-footer />
    </div>
  `,
})
export class NotFound {}
