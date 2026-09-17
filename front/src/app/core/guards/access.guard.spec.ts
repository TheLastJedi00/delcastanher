import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable } from 'rxjs';
import { accessGuard } from './access.guard';

function moduleWith(unlocked: boolean) {
  return {
    id: 'mod-1',
    order: 1,
    title: 'Fundamentos',
    summary: '',
    lessonCount: 4,
    priceCents: 19900,
    purchasable: !unlocked,
    access: { unlocked, expiresAt: unlocked ? '2027-03-17T12:00:00.000Z' : null },
  };
}

/** Roda o guard e devolve o que ele decidiu. */
function run(): Promise<boolean | UrlTree> {
  return new Promise(resolve => {
    const result = TestBed.runInInjectionContext(() =>
      accessGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

    (result as Observable<boolean | UrlTree>).subscribe(value => resolve(value));
  });
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });

  return { http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

/**
 * Portao da area do aluno (Spec 014, decisao 19).
 *
 * O guard e conveniencia de navegacao. Quem protege video, material, progresso
 * e certificado e o servidor — e e por isso que a falha de rede aqui deixa
 * passar em vez de trancar.
 */
describe('accessGuard', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

  it('deixa entrar quem tem ao menos um modulo liberado', async () => {
    const { http } = setup();
    const decision = run();

    http.expectOne(req => req.url.endsWith('/store/catalog')).flush([moduleWith(true)]);

    await expectAsync(decision).toBeResolvedTo(true);
  });

  it('manda para a loja quem nao tem nenhum acesso ativo', async () => {
    const { http, router } = setup();
    const decision = run();

    http.expectOne(req => req.url.endsWith('/store/catalog')).flush([moduleWith(false)]);

    expect(router.serializeUrl((await decision) as UrlTree)).toBe('/loja');
  });

  // Acesso parcial e o estado normal de quem compra por modulo: a trilha
  // mostra o que ele tem e vende o resto (decisao 17).
  it('deixa entrar quem tem acesso a apenas parte da trilha', async () => {
    const { http } = setup();
    const decision = run();

    http
      .expectOne(req => req.url.endsWith('/store/catalog'))
      .flush([moduleWith(true), { ...moduleWith(false), id: 'mod-2' }]);

    await expectAsync(decision).toBeResolvedTo(true);
  });

  // Trancar quem pagou por causa de um erro de infraestrutura seria o pior
  // desfecho possivel. O conteudo em si continua protegido pelo servidor.
  it('deixa passar quando a consulta falha, em vez de trancar quem pagou', async () => {
    const { http } = setup();
    const decision = run();

    http.expectOne(req => req.url.endsWith('/store/catalog')).error(new ProgressEvent('error'));

    await expectAsync(decision).toBeResolvedTo(true);
  });
});
