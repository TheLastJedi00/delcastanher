import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Perfil como devolvido por `GET /users/me`. */
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  bio: string | null;
  phone: string | null;
  linkedin: string | null;
  onboardingCompleted: boolean;
}

/** Payload de `PATCH /users/me`. */
export interface UpdateProfilePayload {
  name: string;
  bio: string;
  phone: string;
  linkedin?: string;
}

/** Iniciais para o avatar, a partir do nome ou do e-mail. */
function initialsOf(profile: UserProfile): string {
  const parts = (profile.name ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return profile.email.slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + (parts.at(-1) as string)[0]).toUpperCase().slice(0, 2);
}

/**
 * Estado do perfil persistido no banco - complementar ao `AuthService`, que
 * cuida da sessao do Firebase. A separacao mantem cada servico com uma
 * responsabilidade: identidade de um lado, dados do usuario do outro.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);

  private readonly state = signal<UserProfile | null>(null);

  readonly profile = this.state.asReadonly();

  /** Nulo enquanto o perfil nao foi carregado - o guard trata esse caso. */
  readonly onboardingCompleted = computed(() => this.state()?.onboardingCompleted ?? null);

  readonly displayName = computed(() => {
    const profile = this.state();

    return profile?.name?.trim() || profile?.email.split('@')[0] || '';
  });

  readonly initials = computed(() => {
    const profile = this.state();

    return profile ? initialsOf(profile) : '';
  });

  /** Busca o registro do banco. O backend cria a linha se ainda nao existir. */
  loadProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${environment.apiUrl}/users/me`).pipe(
      tap(profile => this.state.set(profile)),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /** Garante o perfil em memoria sem repetir a chamada a cada navegacao. */
  ensureProfile(): Observable<UserProfile | null> {
    const current = this.state();

    return current ? of(current) : this.loadProfile().pipe(catchError(() => of(null)));
  }

  updateProfile(payload: UpdateProfilePayload): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${environment.apiUrl}/users/me`, payload).pipe(
      tap(profile => this.state.set(profile)),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /** Descarta o perfil; chamado pelo `AuthService` ao encerrar a sessao. */
  clear(): void {
    this.state.set(null);
  }

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
      : 'Nao foi possivel carregar seus dados. Tente novamente.';
  }
}
