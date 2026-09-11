import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { FULL_HEIGHT_DATA_KEY } from '../../../core/services/layout-route';
import { UserService } from '../../../core/services/user.service';
import { NavHeader } from '../../../shared/ui/nav-header/nav-header';
import { LegalLinks } from '../../../shared/ui/legal-links/legal-links';
import { Sidebar, SidebarNavItem } from '../../../shared/ui/sidebar/sidebar';

@Component({
  selector: 'app-student-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, NavHeader, LegalLinks],
  template: `
    <div class="flex h-screen overflow-hidden bg-brand-surface text-slate-800">
      <ui-sidebar
        variant="dark"
        title="Ambiente do Aluno"
        homeLink="/ava"
        [links]="links"
        [(expanded)]="sidebarExpanded" />

      <main class="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <ui-nav-header
          variant="app"
          label="Ambiente do Aluno"
          homeLink="/ava"
          [userName]="users.displayName()"
          [userInitials]="users.initials()"
          (menuToggle)="sidebarExpanded.set(true)" />

        <!--
          A altura so e travada nas rotas que pedem (a trilha). Nas demais o
          wrapper cresce com o conteudo, senao a pagina vaza da propria caixa
          e passa por cima do rodape legal.
        -->
        <div
          class="relative flex flex-col"
          [class.min-h-0]="fullHeight()"
          [class.flex-1]="fullHeight()">
          <router-outlet />
        </div>

        <!-- O rodape de marketing nao cabe neste shell de altura fixa, mas as
             paginas legais e a revogacao de consentimento precisam ser
             alcancaveis de dentro do AVA (Spec 009, Task 2.8). -->
        <ui-legal-links tone="muted" class="mt-auto border-t border-slate-200 px-4 py-4 md:px-6" />
      </main>
    </div>
  `,
})
export class StudentLayout {
  /** O cabecalho le o nome e as iniciais direto do perfil persistido. */
  protected readonly users = inject(UserService);

  private readonly router = inject(Router);

  /**
   * Verdadeiro so na trilha, que e uma tela de dois paineis com rolagem
   * propria e precisa ocupar exatamente a altura util. As demais rotas do AVA
   * sao paginas de fluxo normal: travar a altura delas faz o conteudo vazar da
   * caixa e encobrir o rodape de links legais.
   *
   * A leitura e feita sobre `routerState.snapshot`, e nao caminhando pelo
   * `ActivatedRoute` injetado: durante a construcao do shell a navegacao ainda
   * esta em curso e os filhos podem nao ter snapshot.
   */
  protected readonly fullHeight = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let route = this.router.routerState.snapshot.root;

        while (route.firstChild) {
          route = route.firstChild;
        }

        return route.data[FULL_HEIGHT_DATA_KEY] === true;
      }),
    ),
    { initialValue: false },
  );

  readonly sidebarExpanded = signal(false);

  readonly links: SidebarNavItem[] = [
    { icon: 'home', label: 'Home Hub', link: '/ava', exact: true },
    { icon: 'user', label: 'Meu Perfil', link: '/ava/perfil' },
    { icon: 'book', label: 'Trilha de Estudos', link: '/ava/trilha' },
    { icon: 'download', label: 'Materiais', link: '/ava/materiais' },
    { icon: 'article', label: 'Artigos', link: '/ava/artigos' },
  ];
}
