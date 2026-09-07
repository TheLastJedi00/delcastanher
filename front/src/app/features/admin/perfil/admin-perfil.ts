import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AdminLayout, AdminTab } from '../../../shared/layouts/admin-layout/admin-layout';
import { Perfil } from '../../perfil/perfil';

/**
 * "Meu Perfil" dentro do painel administrativo: o mesmo formulario da area do
 * aluno, montado no shell do admin. A tela edita a propria conta - o painel
 * nao tem, nem passa a ter aqui, edicao do cadastro de terceiros.
 */
@Component({
  selector: 'app-admin-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminLayout, Perfil],
  template: `
    <app-admin-layout activeTab="" (activeTabChange)="openDashboardTab($event)">
      <app-perfil backLink="/admin" backLabel="Voltar ao Painel" />
    </app-admin-layout>
  `,
})
export class AdminPerfil {
  private readonly router = inject(Router);

  /**
   * As abas do painel vivem dentro do dashboard, nao em rotas proprias. Daqui,
   * escolher uma aba precisa voltar para o /admin ja na aba pedida.
   */
  openDashboardTab(tab: AdminTab | ''): void {
    if (tab) {
      void this.router.navigate(['/admin'], { queryParams: { tab } });
    }
  }
}
