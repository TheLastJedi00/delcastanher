import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Role } from '../services/auth.service';
import { adminGuard } from './admin.guard';

/** Grava uma sessao do papel pedido, como o AuthService a le do storage. */
function signIn(role: Role): void {
  localStorage.setItem(
    'delcastanher.session',
    JSON.stringify({
      idToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { uid: 'uid-123', email: 'pessoa@delcastanher.com', name: 'Pessoa', role },
    }),
  );
}

function run() {
  return TestBed.runInInjectionContext(() =>
    adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('adminGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => localStorage.clear());

  it('libera a rota para um administrador', () => {
    signIn('admin');

    expect(run()).toBeTrue();
  });

  it('nao deixa um aluno entrar no painel', () => {
    signIn('aluno');

    const result = run();

    expect(result instanceof UrlTree).toBeTrue();
    // O aluno vai para a area dele, e nao para uma tela de erro: dizer
    // "acesso negado" so informaria que existe um painel.
    expect(String(result)).toBe('/ava');
  });

  it('manda ao login quem nao tem sessao', () => {
    const result = run();

    expect(result instanceof UrlTree).toBeTrue();
    expect(String(result)).toBe('/login');
  });
});
