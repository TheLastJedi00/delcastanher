import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, NgZone, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, share, switchMap, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CertificateService } from './certificate.service';
import { ProgressService } from './progress.service';
import { UserService } from './user.service';

export type Role = 'aluno' | 'admin';

export interface AuthUser {
  uid: string;
  email: string;
  name: string | null;
  role: Role;
}

/**
 * Resposta de POST /auth/login e de POST /auth/refresh. O refresh token nao
 * vem aqui: ele vive num cookie HttpOnly da API (Spec 017, decisao 13).
 */
interface AuthSessionResponse {
  idToken: string;
  /** Validade do idToken, em segundos. */
  expiresIn: number;
  user: AuthUser;
}

/** Sessao em memoria. Nada disto e gravado no navegador (decisao 18). */
interface Session {
  idToken: string;
  /** Timestamp (ms) em que o idToken expira. */
  expiresAt: number;
  user: AuthUser;
}

/**
 * Indicador de que este navegador tem sessao, sem valor de segredo: so diz ao
 * initializer se vale a pena chamar `/auth/refresh` (decisao 19).
 */
const SESSION_HINT_KEY = 'delcastanher.has-session';

/** Chave anterior a Spec 017, que guardava os tokens. E apagada na primeira carga. */
const LEGACY_SESSION_KEY = 'delcastanher.session';

/** Antecedencia da renovacao em relacao a expiracao do idToken (decisao 20). */
const RENEW_AHEAD_MS = 60_000;

/** Teto da retomada de sessao no bootstrap: API fora do ar nao trava o app. */
const RESTORE_TIMEOUT_MS = 8_000;

/** Rota inicial de cada perfil apos o login. */
export const HOME_BY_ROLE: Record<Role, string> = {
  aluno: '/ava',
  admin: '/admin',
};

/**
 * Unica fonte de verdade da sessao no front. O idToken vive so em memoria; o
 * refresh token, num cookie HttpOnly que este codigo nao le. Ao recarregar a
 * pagina, a sessao e refeita por `POST /auth/refresh` (Spec 017).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly users = inject(UserService);
  private readonly progress = inject(ProgressService);
  private readonly certificates = inject(CertificateService);
  /**
   * O prerender da vitrine (Spec 009) roda este servico no Node, onde nao ha
   * `localStorage` nem cookie de sessao: no servidor o usuario e sempre
   * anonimo, que e exatamente o publico das rotas prerenderizadas.
   */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly session = signal<Session | null>(null);

  /** Refresh em andamento, compartilhado por quem pedir ao mesmo tempo. */
  private refreshing: Observable<Session> | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  /** Muda a cada encerramento de sessao; invalida refresh iniciado antes dele. */
  private epoch = 0;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly role = computed(() => this.user()?.role ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  /** idToken vigente, usado pelo `authInterceptor` para autenticar a API. */
  readonly idToken = computed(() => this.session()?.idToken ?? null);

  constructor() {
    // Sessao gravada antes da Spec 017 carregava o refresh token ao alcance do
    // JavaScript. Ela nao e migrada: quem estava logado entra de novo uma vez.
    this.removeStored(LEGACY_SESSION_KEY);
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthSessionResponse>(`${environment.apiUrl}/auth/login`, { email, password }, { withCredentials: true })
      .pipe(
        map(response => this.startSession(response)),
        // O perfil do banco chega antes do redirecionamento: as telas internas
        // e o onboardingGuard ja encontram o estado carregado.
        switchMap(session => this.users.loadProfile().pipe(map(() => session.user))),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  /** Solicita a criacao de conta: o Firebase envia o link de definicao de senha. */
  requestAccount(email: string): Observable<string> {
    return this.postEmail('/auth/account', email);
  }

  /** Reenvia o link de definicao de senha para uma conta existente. */
  requestPasswordReset(email: string): Observable<string> {
    return this.postEmail('/auth/password-reset', email);
  }

  private postEmail(path: string, email: string): Observable<string> {
    return this.http.post<{ message: string }>(`${environment.apiUrl}${path}`, { email }).pipe(
      map(response => response.message),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /**
   * Troca o cookie por um idToken novo. Chamadas simultaneas compartilham a
   * mesma requisicao, para o cookie nao ser rotacionado varias vezes em
   * paralelo (decisao 20). Quem chama decide o que fazer com a falha.
   */
  refresh(): Observable<Session> {
    if (!this.refreshing) {
      const epoch = this.epoch;

      this.refreshing = this.http
        .post<AuthSessionResponse>(`${environment.apiUrl}/auth/refresh`, null, { withCredentials: true })
        .pipe(
          map(response => {
            // Um logout durante o refresh encerrou a sessao: a resposta que
            // chega depois nao pode religa-la.
            if (epoch !== this.epoch) {
              throw new HttpErrorResponse({ status: 401, statusText: 'Sessao encerrada' });
            }

            return this.startSession(response);
          }),
          finalize(() => (this.refreshing = null)),
          share(),
        );
    }

    return this.refreshing;
  }

  /**
   * Retomada de sessao no bootstrap, antes dos guards (decisao 19). So chama a
   * API quando ha indicio de sessao; qualquer falha deixa o usuario anonimo
   * e o app segue — quem decide para onde ele vai sao os guards.
   */
  restoreSession(): Observable<void> {
    if (!this.isBrowser || !this.readStored(SESSION_HINT_KEY)) {
      return of(undefined);
    }

    return this.refresh().pipe(
      timeout(RESTORE_TIMEOUT_MS),
      map(() => undefined),
      catchError((error: unknown) => {
        if (isSessionEnded(error)) {
          this.clearLocal();
        }

        return of(undefined);
      }),
    );
  }

  /**
   * A sessao acabou no servidor (refresh recusado): limpa o estado e, se o
   * usuario estiver numa area protegida, manda-o ao login. Rota protegida e
   * a que declara `canActivate`; as publicas nao declaram nenhum.
   */
  expire(): void {
    this.clearLocal();

    if (this.isOnProtectedRoute()) {
      void this.router.navigateByUrl('/login');
    }
  }

  /**
   * Encerra a sessao neste navegador. O estado local e limpo na hora, mesmo
   * que a API nao responda: sem rede, o cookie expira no proprio prazo
   * (decisao 17). Quem navega para `/login` e o link de "Sair".
   */
  logout(): void {
    this.clearLocal();

    if (this.isBrowser) {
      this.http
        .post<void>(`${environment.apiUrl}/auth/logout`, null, { withCredentials: true })
        .subscribe({ error: () => undefined });
    }
  }

  /** Destino inicial do usuario autenticado. */
  homeUrl(): string {
    const role = this.role();

    return role ? HOME_BY_ROLE[role] : '/login';
  }

  /** Traduz a falha HTTP para uma mensagem exibivel ao usuario. */
  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Nao foi possivel falar com o servidor. Verifique sua conexao e tente novamente.';
    }

    const detail: unknown = error.error?.message;

    if (Array.isArray(detail)) {
      return detail.join(' ');
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Nao foi possivel entrar. Tente novamente.';
  }

  private startSession(response: AuthSessionResponse): Session {
    const session: Session = {
      idToken: response.idToken,
      expiresAt: Date.now() + response.expiresIn * 1000,
      user: response.user,
    };

    this.session.set(session);
    this.writeStored(SESSION_HINT_KEY, '1');
    this.scheduleRenewal(session.expiresAt);

    return session;
  }

  private clearLocal(): void {
    this.epoch++;
    this.cancelRenewal();
    this.session.set(null);
    this.users.clear();
    // Progresso e certificado sao dados de aluno: sem limpar aqui, quem entrar
    // em seguida no mesmo navegador veria a trilha da pessoa anterior.
    this.progress.clear();
    this.certificates.clear();
    this.removeStored(SESSION_HINT_KEY);
  }

  /**
   * Renova um minuto antes de expirar. O timer roda fora da zona do Angular:
   * um `setTimeout` de quase uma hora pendente na zona impediria a aplicacao
   * de ficar estavel, e a hidratacao espera por isso.
   */
  private scheduleRenewal(expiresAt: number): void {
    this.cancelRenewal();

    if (!this.isBrowser) {
      return;
    }

    const delay = Math.max(0, expiresAt - Date.now() - RENEW_AHEAD_MS);

    this.zone.runOutsideAngular(() => {
      this.renewTimer = setTimeout(() => {
        this.zone.run(() =>
          this.refresh().subscribe({
            error: (error: unknown) => {
              if (isSessionEnded(error)) {
                this.expire();
              }
            },
          }),
        );
      }, delay);
    });
  }

  private cancelRenewal(): void {
    if (this.renewTimer !== null) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }
  }

  private isOnProtectedRoute(): boolean {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;

    while (route) {
      if (route.routeConfig?.canActivate?.length) {
        return true;
      }

      route = route.firstChild;
    }

    return false;
  }

  // O `localStorage` pode lancar (aba anonima, armazenamento bloqueado): o
  // indicador e so uma otimizacao, e a falha dele nao pode quebrar o login.
  private readStored(key: string): string | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStored(key: string, value: string): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(key, value);
    } catch {
      // Sem indicador, o proximo reload simplesmente nao tenta retomar.
    }
  }

  private removeStored(key: string): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.removeItem(key);
    } catch {
      // Nada a limpar se o armazenamento esta inacessivel.
    }
  }
}

/** Refresh recusado pela API: a sessao acabou, ao contrario de uma falha de rede. */
export function isSessionEnded(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}
