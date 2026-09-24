import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService, AuthUser, Role } from '../services/auth.service';

/**
 * Abre uma sessao nos testes pelo mesmo caminho do app: um `POST /auth/refresh`
 * respondido. Desde a Spec 017 a sessao vive so em memoria, entao gravar no
 * `localStorage` — como os testes faziam — ja nao autentica ninguem.
 *
 * Exige `provideHttpClient()` e `provideHttpClientTesting()` no TestBed.
 */
export function signInForTest(role: Role = 'aluno', user: Partial<AuthUser> = {}): AuthService {
  const auth = TestBed.inject(AuthService);

  auth.refresh().subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne(`${environment.apiUrl}/auth/refresh`)
    .flush({
      idToken: 'token',
      expiresIn: 3600,
      user: { uid: 'uid-123', email: 'pessoa@delcastanher.com', name: 'Pessoa', role, ...user },
    });

  return auth;
}
