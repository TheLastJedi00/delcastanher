import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { UserService } from '../../../core/services/user.service';
import { NavHeader } from '../../ui/nav-header/nav-header';
import { Sidebar, SidebarNavItem } from '../../ui/sidebar/sidebar';

export type AdminTab = 'visao-geral' | 'aulas' | 'comunicacao' | 'termos';

export const ADMIN_TABS: SidebarNavItem[] = [
  { id: 'visao-geral', icon: 'grid', label: 'Visão Geral' },
  { id: 'aulas', icon: 'play', label: 'Gestão de Aulas' },
  { id: 'comunicacao', icon: 'mail', label: 'Disparos de E-mail' },
  { id: 'termos', icon: 'document', label: 'Políticas & Termos' },
];

/**
 * Itens da sidebar do painel: as abas do dashboard mais o Meu Perfil, que e
 * uma rota propria — por isso vai com `link`, e nao com `id`.
 */
export const ADMIN_NAV: SidebarNavItem[] = [
  ...ADMIN_TABS,
  { icon: 'user', label: 'Meu Perfil', link: '/admin/perfil' },
];

/**
 * Shell do painel administrativo: sidebar clara + header admin + conteudo.
 * As secoes do admin sao abas (nao rotas), entao o conteudo chega por
 * projecao e a aba ativa e um model bidirecional.
 */
@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Sidebar, NavHeader],
  template: `
    <div class="flex h-screen overflow-hidden bg-brand-surface text-slate-800">
      <ui-sidebar
        variant="light"
        title="Administração"
        homeLink="/"
        [links]="tabs"
        [activeId]="activeTab()"
        [(expanded)]="sidebarExpanded"
        (select)="activeTab.set($any($event))" />

      <main class="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <ui-nav-header
          variant="admin"
          label="Administração"
          homeLink="/admin"
          [userName]="users.displayName()"
          [userInitials]="users.initials()"
          (menuToggle)="sidebarExpanded.set(true)" />

        <ng-content />
      </main>
    </div>
  `,
})
export class AdminLayout {
  /** O cabecalho le o nome e as iniciais direto do perfil persistido. */
  protected readonly users = inject(UserService);

  protected readonly tabs = ADMIN_NAV;
  /** Vazio nas telas do painel que nao sao aba, como o Meu Perfil. */
  readonly activeTab = model<AdminTab | ''>('visao-geral');
  readonly sidebarExpanded = model(false);
}
