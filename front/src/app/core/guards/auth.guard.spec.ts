import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthService, Role } from '../services/auth.service';
import { authGuard } from './auth.guard';

/**
 * Executa o guard para uma rota, com o papel informado na sessao.
 *
 * O reset antes de configurar permite mais de uma execucao no mesmo `it` — sem
 * ele, o TestBed recusa a segunda chamada por ja estar instanciado, e os casos
 * ficariam espalhados em um `it` por combinacao de papel e rota.
 */
function run(path: string, role: Role | null): boolean | UrlTree {
  TestBed.resetTestingModule();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          role: () => role,
          homeUrl: () => (role === 'admin' ? '/admin' : role === 'aluno' ? '/ava' : '/login'),
        },
      },
    ],
  });

  return TestBed.runInInjectionContext(() =>
    authGuard({ routeConfig: { path } } as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

function urlOf(result: boolean | UrlTree): string {
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('authGuard', () => {
  it('manda ao login quem nao tem sessao', () => {
    expect(urlOf(run('ava', null))).toBe('/login');
  });

  it('libera cada area para o seu papel', () => {
    expect(run('ava', 'aluno')).toBe(true);
    expect(run('admin', 'admin')).toBe(true);
  });

  it('desvia quem tenta a area do outro papel', () => {
    expect(urlOf(run('admin', 'aluno'))).toBe('/ava');
    expect(urlOf(run('ava', 'admin'))).toBe('/admin');
  });

  /**
   * Spec 014, decisao 19. Esta e uma regressao encontrada no teste funcional:
   * sem `loja` no mapa de papeis, a rota caia em `homeUrl()`, e o aluno **sem
   * acesso** entrava em laco — `/loja` mandava para `/ava`, e o `accessGuard`
   * de `/ava` mandava de volta para `/loja`, sem fim.
   *
   * Nao e um caso de borda: e o estado de toda conta nova, que e exatamente
   * quem a loja existe para atender.
   */
  describe('loja', () => {
    it('libera a loja para o aluno, sem devolver para o AVA', () => {
      expect(run('loja', 'aluno')).toBe(true);
    });

    it('libera a loja para o admin, sem devolver para o painel', () => {
      expect(run('loja', 'admin')).toBe(true);
    });

    it('continua exigindo sessao', () => {
      expect(urlOf(run('loja', null))).toBe('/login');
    });
  });
});
