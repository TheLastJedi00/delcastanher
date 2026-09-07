import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export type Role = 'aluno' | 'admin';

export interface AuthUser {
  uid: string;
  email: string;
  name: string | null;
  role: Role;
}

/** Resposta de POST /auth/login. */
interface AuthSessionResponse {
  idToken: string;
  refreshToken: string;
  /** Validade do idToken, em segundos. */
  expiresIn: number;
  user: AuthUser;
}

/** Sessao como fica persistida no navegador. */
interface StoredSession {
  idToken: string;
  refreshToken: string;
  /** Timestamp (ms) em que o idToken expira. */
  expiresAt: number;
  user: AuthUser;
}

const STORAGE_KEY = 'delcastanher.session';

/** Rota inicial de cada perfil apos o login. */
export const HOME_BY_ROLE: Record<Role, string> = {
  aluno: '/ava',
  admin: '/admin',
};

/**
 * Unica fonte de verdade da sessao no front: fala com a API de autenticacao,
 * mantem a sessao em signals e a espelha no localStorage para sobreviver a
 * um reload.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = signal<StoredSession | null>(this.readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly role = computed(() => this.user()?.role ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthSessionResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap(response => this.storeSession(response)),
        map(response => response.user),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  logout(): void {
    this.session.set(null);
    localStorage.removeItem(STORAGE_KEY);
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

  private storeSession(response: AuthSessionResponse): void {
    const stored: StoredSession = {
      idToken: response.idToken,
      refreshToken: response.refreshToken,
      expiresAt: Date.now() + response.expiresIn * 1000,
      user: response.user,
    };

    this.session.set(stored);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  private readStoredSession(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as StoredSession;

      // Sessao expirada ou corrompida nao deve liberar rota nenhuma.
      if (!parsed?.user?.role || parsed.expiresAt <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);

        return null;
      }

      return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);

      return null;
    }
  }
}
