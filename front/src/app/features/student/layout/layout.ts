import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { NavHeader } from '../../../shared/ui/nav-header/nav-header';
import { Sidebar, SidebarNavItem } from '../../../shared/ui/sidebar/sidebar';

@Component({
  selector: 'app-student-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, NavHeader],
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

        <div class="relative flex min-h-0 flex-1 flex-col">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class StudentLayout {
  /** O cabecalho le o nome e as iniciais direto do perfil persistido. */
  protected readonly users = inject(UserService);

  readonly sidebarExpanded = signal(false);

  readonly links: SidebarNavItem[] = [
    { icon: 'home', label: 'Home Hub', link: '/ava', exact: true },
    { icon: 'user', label: 'Meu Perfil', link: '/ava/perfil' },
    { icon: 'book', label: 'Trilha de Estudos', link: '/ava/trilha' },
    { icon: 'download', label: 'Materiais', link: '/ava/materiais' },
    { icon: 'article', label: 'Artigos', link: '/ava/artigos' },
  ];
}
