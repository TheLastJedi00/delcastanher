import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Perfis de acesso, os mesmos do claim do Firebase. */
export type AdminUserRole = 'aluno' | 'admin';

/** Situacao da conta, no vocabulario da tela. */
export type AdminUserStatus = 'ativo' | 'bloqueado';

/** Colunas por onde a listagem pode ser ordenada. */
export type AdminUserSort = 'nome' | 'matricula' | 'acesso' | 'progresso';

/**
 * Linha da tabela. O progresso ja vem calculado do servidor: a tela nao refaz
 * a conta, e as vinte linhas saem de uma consulta so (Spec 013, decisao 8).
 */
export interface AdminUserItem {
  id: string;
  /** Nulo para quem parou antes do onboarding; a tela mostra o e-mail. */
  name: string | null;
  email: string;
  initials: string;
  role: AdminUserRole;
  blocked: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  /** Nulo para quem nao acessou desde que a coluna existe. */
  lastSeenAt: string | null;
  completedLessons: number;
  totalLessons: number;
  percentage: number;
  /** Nulos com o curso concluido; a tela mostra "Concluído". */
  currentModuleOrder: number | null;
  currentModuleTitle: string | null;
  courseCompleted: boolean;
}

/** Os tres numeros do topo, com a janela que os dois ultimos usam. */
export interface AdminUsersKpis {
  totalStudents: number;
  activeStudents: number;
  engagementRate: number;
  windowDays: number;
}

export interface AdminUserListResult {
  items: AdminUserItem[];
  total: number;
  page: number;
  pageSize: number;
  kpis: AdminUsersKpis;
}

export interface AdminUserLessonItem {
  id: string;
  order: number;
  title: string;
  completed: boolean;
}

export interface AdminUserModuleItem {
  id: string;
  order: number;
  title: string;
  completedCount: number;
  totalCount: number;
  completed: boolean;
  lessons: AdminUserLessonItem[];
}

/** Acesso de um aluno a um modulo (Spec 014, decisao 20). */
export interface AdminAccessItem {
  moduleId: string;
  moduleOrder: number;
  moduleTitle: string;
  /** De onde veio: compra, cortesia ou o backfill das contas antigas. */
  source: 'PURCHASE' | 'COURTESY' | 'LEGACY';
  grantedAt: string;
  expiresAt: string;
  /** Falso para acesso vencido, que continua listado como historico. */
  active: boolean;
  orderId: string | null;
}

/** Pedido do aluno, no que o suporte precisa (decisao 23). */
export interface AdminOrderItem {
  id: string;
  status: 'PENDING' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
  amountCents: number;
  method: 'PIX' | 'CREDIT_CARD';
  installments: number;
  mpOrderId: string | null;
  mpPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  items: { moduleId: string; title: string; priceCents: number }[];
}

/** Diploma no detalhe: exibido, nunca revogado por aqui (decisao 12). */
export interface AdminUserCertificateItem {
  id: string;
  code: string;
  scope: 'curso' | 'modulo';
  moduleTitle: string | null;
  status: 'ACTIVE' | 'REVOKED';
  issuedAt: string;
}

/** Detalhe do aluno. Somente leitura (decisao 11). */
export interface AdminUserDetail {
  id: string;
  name: string | null;
  email: string;
  initials: string;
  bio: string | null;
  phone: string | null;
  linkedin: string | null;
  role: AdminUserRole;
  blocked: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  /**
   * Aceite da Politica de Privacidade (Spec 015, decisao 11). Nulo e conta
   * anterior a exigencia, e nunca recusa — a tela precisa poder dizer
   * "sem aceite registrado" sem afirmar que o aluno recusou.
   */
  policyAcceptedAt: string | null;
  policyAcceptedVersion: string | null;
  completedLessons: number;
  totalLessons: number;
  percentage: number;
  courseCompleted: boolean;
  modules: AdminUserModuleItem[];
  certificates: AdminUserCertificateItem[];
}

/** Filtro corrente da tela. E ele que vira query string. */
export interface AdminUsersQuery {
  page: number;
  pageSize: number;
  search: string;
  role: AdminUserRole | null;
  status: AdminUserStatus | null;
  sort: AdminUserSort;
  direction: 'asc' | 'desc';
}

/** Primeira pagina, sem filtro, por nome — o estado em que a aba abre. */
export const DEFAULT_ADMIN_USERS_QUERY: AdminUsersQuery = {
  page: 1,
  pageSize: 20,
  search: '',
  role: null,
  status: null,
  sort: 'nome',
  direction: 'asc',
};

/**
 * Leitura administrativa de usuarios.
 *
 * Todo filtro vai ao servidor (Spec 013, decisao 7): a aba nao guarda a lista
 * inteira para filtrar em memoria, porque isso significaria baixar o cadastro
 * completo da plataforma para uma tela que mostra vinte linhas.
 */
@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);

  private readonly state = signal<AdminUserListResult | null>(null);
  private readonly queryState = signal<AdminUsersQuery>({ ...DEFAULT_ADMIN_USERS_QUERY });
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly query = this.queryState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly items = computed(() => this.state()?.items ?? []);
  readonly total = computed(() => this.state()?.total ?? 0);
  readonly kpis = computed(() => this.state()?.kpis ?? null);

  /** Total de paginas do filtro corrente; ao menos 1, para a tela nao dizer "0 de 0". */
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.queryState().pageSize)),
  );

  /** Verdadeiro so quando a consulta terminou e nao trouxe ninguem. */
  readonly empty = computed(() => !this.loadingState() && this.items().length === 0);

  /**
   * Carrega a pagina do filtro corrente.
   *
   * A lista anterior **permanece** na tela durante a consulta e tambem quando
   * ela falha: apagar as linhas a cada tecla digitada faria a tabela piscar, e
   * apaga-las no erro trocaria um problema de rede por uma tela vazia que
   * parece dizer "nao ha alunos".
   */
  load(): Observable<AdminUserListResult> {
    this.loadingState.set(true);
    this.errorState.set(null);

    return this.http
      .get<AdminUserListResult>(`${environment.apiUrl}/admin/users`, {
        params: this.toParams(this.queryState()),
      })
      .pipe(
        tap(result => this.state.set(result)),
        catchError((error: HttpErrorResponse) => {
          const message = this.toMessage(error);
          this.errorState.set(message);

          return throwError(() => message);
        }),
        finalize(() => this.loadingState.set(false)),
      );
  }

  /**
   * Muda o filtro e recarrega. Qualquer mudanca que nao seja de pagina volta
   * para a primeira: com um filtro novo, continuar na pagina 4 costuma cair em
   * uma lista vazia que parece um erro.
   */
  setQuery(patch: Partial<AdminUsersQuery>): Observable<AdminUserListResult> {
    this.queryState.update(current => ({
      ...current,
      ...patch,
      page: patch.page ?? 1,
    }));

    return this.load();
  }

  /** Detalhe de um aluno, em leitura. */
  detail(id: string): Observable<AdminUserDetail> {
    return this.http
      .get<AdminUserDetail>(`${environment.apiUrl}/admin/users/${id}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /**
   * Promove ou rebaixa. A API responde 204 porque a tela recarrega a pagina em
   * seguida: os KPIs do topo tambem mudam com a acao.
   */
  setRole(id: string, role: AdminUserRole): Observable<void> {
    return this.http
      .patch<void>(`${environment.apiUrl}/admin/users/${id}/role`, { role })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  // --- Acesso aos modulos (Spec 014, decisao 20) ---

  /** Acessos do aluno, inclusive os vencidos — o suporte precisa dos dois. */
  accesses(id: string): Observable<AdminAccessItem[]> {
    return this.http
      .get<AdminAccessItem[]>(`${environment.apiUrl}/admin/users/${id}/access`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Pedidos do aluno (decisao 23). */
  orders(id: string): Observable<AdminOrderItem[]> {
    return this.http
      .get<AdminOrderItem[]>(`${environment.apiUrl}/admin/users/${id}/orders`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Cortesia: 6 meses sem pagamento, pelo mesmo caminho da compra. */
  grantAccess(id: string, moduleId: string): Observable<void> {
    return this.http
      .post<void>(`${environment.apiUrl}/admin/users/${id}/access`, { moduleId })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Revoga o acesso. Progresso e certificado ficam onde estao. */
  revokeAccess(id: string, moduleId: string): Observable<void> {
    return this.http
      .delete<void>(`${environment.apiUrl}/admin/users/${id}/access/${moduleId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Bloqueia ou libera o acesso. Nada e apagado (decisao 9). */
  setBlocked(id: string, blocked: boolean): Observable<void> {
    return this.http
      .patch<void>(`${environment.apiUrl}/admin/users/${id}/status`, { blocked })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /**
   * Baixa a lista inteira do filtro corrente. O arquivo vem pronto do
   * servidor: monta-lo aqui exigiria varrer todas as paginas (decisao 13).
   */
  exportCsv(): Observable<Blob> {
    return this.http
      .get(`${environment.apiUrl}/admin/users/export`, {
        params: this.toParams(this.queryState()),
        responseType: 'blob',
      })
      .pipe(catchError(() => throwError(() => 'Não foi possível gerar a planilha. Tente novamente.')));
  }

  /** Descarta o estado; chamado ao encerrar a sessao. */
  clear(): void {
    this.state.set(null);
    this.queryState.set({ ...DEFAULT_ADMIN_USERS_QUERY });
    this.errorState.set(null);
  }

  /**
   * Filtro em query string. Campo vazio nao vira parametro: a API recusa valor
   * fora do conjunto, e mandar `role=` seria exatamente isso.
   */
  private toParams(query: AdminUsersQuery): HttpParams {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize)
      .set('sort', query.sort)
      .set('direction', query.direction);

    const search = query.search.trim();

    if (search) {
      params = params.set('search', search);
    }

    if (query.role) {
      params = params.set('role', query.role);
    }

    if (query.status) {
      params = params.set('status', query.status);
    }

    return params;
  }

  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.';
    }

    if (error.status === 403) {
      return 'Esta área é restrita a administradores.';
    }

    const detail: unknown = error.error?.message;

    if (Array.isArray(detail)) {
      return detail.join(' ');
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Não foi possível concluir a operação. Tente novamente.';
  }
}
