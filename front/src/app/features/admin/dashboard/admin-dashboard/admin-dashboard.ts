import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ADMIN_TABS, AdminLayout, AdminTab } from '../../../../shared/layouts/admin-layout/admin-layout';
import { AdminAulas } from '../../aulas/admin-aulas';
import { AuthService } from '../../../../core/services/auth.service';
import {
  AdminUserDetail,
  AdminUserItem,
  AdminUserRole,
  AdminUserSort,
  AdminUserStatus,
  AdminUsersService,
} from '../../../../core/services/admin-users.service';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { Badge } from '../../../../shared/ui/badge/badge';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { PageContainer } from '../../../../shared/ui/page-container/page-container';
import { ProgressBar } from '../../../../shared/ui/progress-bar/progress-bar';
import { SectionHeader } from '../../../../shared/ui/section-header/section-header';
import { StatCard } from '../../../../shared/ui/stat-card/stat-card';

/** Aba pedida pela URL, caindo na visao geral quando o valor nao existe. */
function toTab(value: string | null): AdminTab {
  return ADMIN_TABS.some(tab => tab.id === value) ? (value as AdminTab) : 'visao-geral';
}

/** Ordenacao vinda da URL, caindo em nome quando o valor nao existe. */
function toSort(value: string | null): AdminUserSort {
  const sorts: AdminUserSort[] = ['nome', 'matricula', 'acesso', 'progresso'];

  return sorts.includes(value as AdminUserSort) ? (value as AdminUserSort) : 'nome';
}

/** Confirmacao pendente. A acao so acontece depois do segundo clique. */
type PendingAction =
  | { kind: 'role'; user: AdminUserItem; role: AdminUserRole }
  | { kind: 'block'; user: AdminUserItem; blocked: boolean };

@Component({
  selector: 'app-admin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminAulas,
    AdminLayout,
    PageContainer,
    SectionHeader,
    StatCard,
    Card,
    Input,
    Button,
    Badge,
    Avatar,
    ProgressBar,
    Modal,
  ],
  templateUrl: './admin-dashboard.html',
})
export class AdminDashboard {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly users = inject(AdminUsersService);

  /**
   * A aba inicial pode vir por query param: e assim que o /admin/perfil, que
   * e outra rota, devolve o usuario para a aba escolhida na sidebar.
   */
  readonly activeTab = signal<AdminTab>(
    toTab(this.route.snapshot.queryParamMap.get('tab')),
  );
  readonly legalTab = signal<'termos' | 'privacidade'>('termos');

  readonly emailSubject = signal('');
  readonly emailBody = signal('');
  readonly legalContent = signal('');

  /** Texto do campo de busca. A consulta so sai depois do debounce. */
  readonly search = signal('');

  /** Aluno aberto no detalhe; nulo com o dialogo fechado. */
  readonly detail = signal<AdminUserDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);

  readonly pending = signal<PendingAction | null>(null);
  readonly actionRunning = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly exporting = signal(false);

  private readonly searchInput = new Subject<string>();
  /** Linha que abriu o detalhe, para devolver o foco ao fechar. */
  private lastTrigger: HTMLElement | null = null;

  constructor() {
    // A busca vai ao servidor (decisao 7), mas nao a cada tecla: sem o
    // debounce, digitar "mariana" dispararia sete consultas.
    this.searchInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(term => this.applyQuery({ search: term }));

    // O filtro corrente vive na URL: a pagina filtrada vira link
    // compartilhavel e sobrevive ao F5 (Task 4.5).
    effect(() => {
      const tab = this.activeTab();
      const query = this.users.query();

      void this.router.navigate([], {
        relativeTo: this.route,
        replaceUrl: true,
        queryParams: {
          tab: tab === 'visao-geral' ? null : tab,
          busca: query.search || null,
          papel: query.role,
          situacao: query.status,
          ordem: query.sort === 'nome' ? null : query.sort,
          direcao: query.direction === 'asc' ? null : query.direction,
          pagina: query.page === 1 ? null : query.page,
        },
        queryParamsHandling: 'merge',
      });
    });

    this.restoreFromUrl();
  }

  /** Iniciais do administrador logado, usadas para desabilitar as acoes. */
  readonly currentUid = computed(() => this.auth.user()?.uid ?? null);

  readonly kpis = this.users.kpis;

  /** Intervalo exibido na paginacao: "21 a 40 de 137". */
  readonly range = computed(() => {
    const { page, pageSize } = this.users.query();
    const total = this.users.total();
    const first = total === 0 ? 0 : (page - 1) * pageSize + 1;

    return { first, last: Math.min(page * pageSize, total), total };
  });

  setLegalTab(tab: 'termos' | 'privacidade') {
    this.legalTab.set(tab);
  }

  onSearch(term: string) {
    this.search.set(term);
    this.searchInput.next(term);
  }

  /**
   * Clique no cabecalho da coluna: a mesma coluna inverte a direcao, e uma
   * coluna nova comeca ascendente.
   */
  sortBy(sort: AdminUserSort) {
    const current = this.users.query();
    const direction = current.sort === sort && current.direction === 'asc' ? 'desc' : 'asc';

    this.applyQuery({ sort, direction });
  }

  /** Estado da coluna para o `aria-sort`, que e o que o leitor de tela anuncia. */
  ariaSort(sort: AdminUserSort): 'ascending' | 'descending' | 'none' {
    const current = this.users.query();

    if (current.sort !== sort) {
      return 'none';
    }

    return current.direction === 'asc' ? 'ascending' : 'descending';
  }

  filterRole(value: string) {
    this.applyQuery({ role: (value || null) as AdminUserRole | null });
  }

  filterStatus(value: string) {
    this.applyQuery({ status: (value || null) as AdminUserStatus | null });
  }

  goToPage(page: number) {
    const target = Math.min(Math.max(1, page), this.users.totalPages());

    this.applyQuery({ page: target });
  }

  reload() {
    this.users.load().subscribe({ error: () => undefined });
  }

  openDetail(user: AdminUserItem, event: Event) {
    this.lastTrigger = event.currentTarget as HTMLElement;
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.detail.set(null);

    this.users.detail(user.id).subscribe({
      next: detail => {
        this.detail.set(detail);
        this.detailLoading.set(false);
      },
      error: (message: string) => {
        this.detailError.set(message);
        this.detailLoading.set(false);
      },
    });
  }

  closeDetail() {
    this.detail.set(null);
    this.detailLoading.set(false);
    this.detailError.set(null);
    // Fechar um dialogo sem devolver o foco deixa quem navega por teclado no
    // inicio da pagina, longe da linha em que estava.
    this.lastTrigger?.focus();
    this.lastTrigger = null;
  }

  /**
   * Spec 013, decisao 10: a regra e do servidor, mas a UI a antecipa. Um
   * administrador nao muda o proprio papel nem se bloqueia.
   */
  isSelf(user: AdminUserItem): boolean {
    return user.id === this.currentUid();
  }

  askRole(user: AdminUserItem) {
    this.actionError.set(null);
    this.pending.set({
      kind: 'role',
      user,
      role: user.role === 'admin' ? 'aluno' : 'admin',
    });
  }

  askBlock(user: AdminUserItem) {
    this.actionError.set(null);
    this.pending.set({ kind: 'block', user, blocked: !user.blocked });
  }

  cancelAction() {
    this.pending.set(null);
    this.actionError.set(null);
  }

  /** Executa a confirmacao pendente e recarrega: os KPIs do topo tambem mudam. */
  confirmAction() {
    const action = this.pending();

    if (!action) {
      return;
    }

    this.actionRunning.set(true);
    this.actionError.set(null);

    const request =
      action.kind === 'role'
        ? this.users.setRole(action.user.id, action.role)
        : this.users.setBlocked(action.user.id, action.blocked);

    request.subscribe({
      next: () => {
        this.actionRunning.set(false);
        this.pending.set(null);
        this.reload();
      },
      error: (message: string) => {
        this.actionRunning.set(false);
        this.actionError.set(message);
      },
    });
  }

  /**
   * Baixa a planilha do filtro corrente. O arquivo vem pronto do servidor
   * (decisao 13); aqui so se cria o link que o navegador clica.
   */
  exportCsv() {
    this.exporting.set(true);
    this.actionError.set(null);

    this.users.exportCsv().subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);

        link.href = url;
        link.download = `alunos-${date}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: (message: string) => {
        this.actionError.set(message);
        this.exporting.set(false);
      },
    });
  }

  /** Rotulo do progresso: quem terminou tudo nao mostra "12 / 12". */
  progressLabel(user: AdminUserItem): string {
    if (user.courseCompleted) {
      return 'Concluído';
    }

    if (user.currentModuleOrder === null) {
      return '—';
    }

    return `Módulo ${user.currentModuleOrder}`;
  }

  /** Data no formato da tela; "nunca acessou" e ausencia de dado, nao data zero. */
  formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleDateString('pt-BR') : 'Nunca acessou';
  }

  private applyQuery(patch: Parameters<AdminUsersService['setQuery']>[0]) {
    this.users.setQuery(patch).subscribe({ error: () => undefined });
  }

  /** Reconstitui o filtro a partir da URL e dispara a primeira consulta. */
  private restoreFromUrl() {
    const params = this.route.snapshot.queryParamMap;
    const search = params.get('busca') ?? '';

    this.search.set(search);

    this.applyQuery({
      search,
      role: (params.get('papel') as AdminUserRole | null) ?? null,
      status: (params.get('situacao') as AdminUserStatus | null) ?? null,
      sort: toSort(params.get('ordem')),
      direction: params.get('direcao') === 'desc' ? 'desc' : 'asc',
      page: Number(params.get('pagina')) || 1,
    });
  }
}
