import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
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
        [(expanded)]="sidebarExpanded"
        (logout)="auth.logout()" />

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

        <!-- O rodape de marketing nao cabe neste shell de altura fixa, mas as
             paginas legais e a revogacao de consentimento precisam ser
             alcancaveis de dentro do AVA (Spec 009, Task 2.8). -->
        <ui-legal-links tone="muted" class="border-t border-slate-200 px-4 py-4 md:px-6" />
      </main>
    </div>
  `,
})
export class StudentLayout {
  /** O cabecalho le o nome e as iniciais direto do perfil persistido. */
  protected readonly users = inject(UserService);
  /** O "Sair" da sidebar precisa limpar a sessao, nao so navegar para o /login. */
  protected readonly auth = inject(AuthService);

  readonly sidebarExpanded = signal(false);

  readonly links: SidebarNavItem[] = [
    { icon: 'home', label: 'Home Hub', link: '/ava', exact: true },
    { icon: 'user', label: 'Meu Perfil', link: '/ava/perfil' },
    { icon: 'book', label: 'Trilha de Estudos', link: '/ava/trilha' },
    { icon: 'download', label: 'Materiais', link: '/ava/materiais' },
    { icon: 'article', label: 'Artigos', link: '/ava/artigos' },
  ];
}
