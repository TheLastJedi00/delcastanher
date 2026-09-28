import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService, Role } from '../services/auth.service';
import { guestGuard } from './guest.guard';

/**
 * Executa o guard do `/login` com o papel da sessao e o `?redirect=` pedido.
 * O reset permite mais de uma execucao no mesmo `it`, como no `auth.guard.spec`.
 */
function run(role: Role | null, redirect?: string): boolean | UrlTree {
  TestBed.resetTestingModule();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          role: () => role,
          isAuthenticated: () => role !== null,
          homeUrl: () => (role === 'admin' ? '/admin' : role === 'aluno' ? '/ava' : '/login'),
        },
      },
    ],
  });

  const params = redirect === undefined ? {} : { redirect };
  const route = { queryParamMap: convertToParamMap(params) } as ActivatedRouteSnapshot;

  return TestBed.runInInjectionContext(() =>
    guestGuard(route, {} as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

function urlOf(result: boolean | UrlTree): string {
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('guestGuard', () => {
  it('libera o login para quem nao tem sessao', () => {
    expect(run(null)).toBe(true);
    expect(run(null, '/loja')).toBe(true);
  });

  /**
   * Spec 019, decisao 16: o aluno que passeou pela vitrine clicava em "Area do
   * Aluno" e recebia o formulario de novo, com a sessao valida no cookie.
   */
  it('manda quem ja entrou para a propria area', () => {
    expect(urlOf(run('aluno'))).toBe('/ava');
    expect(urlOf(run('admin'))).toBe('/admin');
  });

  it('respeita o destino pedido quando ele e interno', () => {
    expect(urlOf(run('aluno', '/loja?pacote=imersao-rh-lancamento'))).toBe(
      '/loja?pacote=imersao-rh-lancamento',
    );
  });

  it('ignora destino externo, relativo ao protocolo, o proprio login ou vazio', () => {
    for (const redirect of ['https://example.com', '//example.com', '/login', '/login?redirect=/ava', '', 'ava']) {
      expect(urlOf(run('aluno', redirect))).withContext(redirect).toBe('/ava');
    }
  });
});
