import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { LoadResult, buildThenBrowser } from './build-then-browser';
import { LegalDocumentsService, PublicLegalDocument } from './legal-documents.service';

const PRIVACY: PublicLegalDocument = {
  kind: 'PRIVACY',
  content: '## 1. Objetivo\n\nTexto.',
  policyVersion: '2026-09-13',
  publishedAt: '2026-09-13T12:00:00.000Z',
};

/** Leitura publica dos documentos legais (Spec 022, Task 3.1). */
describe('LegalDocumentsService', () => {
  let service: LegalDocumentsService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(LegalDocumentsService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('busca o documento pelo kind em minúsculas', () => {
    let result: PublicLegalDocument | null = null;
    service.document('PRIVACY').subscribe((doc) => (result = doc));

    backend.expectOne(`${environment.apiUrl}/legal/documents/privacy`).flush(PRIVACY);

    expect(result!).toEqual(PRIVACY);
  });

  it('devolve nulo para o documento não publicado', () => {
    let result: PublicLegalDocument | null | undefined;
    service.document('TERMS').subscribe((doc) => (result = doc));

    backend
      .expectOne(`${environment.apiUrl}/legal/documents/terms`)
      .flush({ message: 'Não publicado' }, { status: 404, statusText: 'Not Found' });

    expect(result).toBeNull();
  });

  it('propaga falha que não é 404', () => {
    let failed = false;
    service.document('PRIVACY').subscribe({ error: () => (failed = true) });

    backend
      .expectOne(`${environment.apiUrl}/legal/documents/privacy`)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(failed).toBeTrue();
  });

  it('lê a versão da política e os documentos publicados', () => {
    let version: string | null = null;
    service.policyStatus().subscribe((status) => (version = status.version));

    backend
      .expectOne(`${environment.apiUrl}/legal/policy-version`)
      .flush({ version: '2026-09-13', published: ['PRIVACY', 'COOKIES'] });

    expect(version!).toBe('2026-09-13');
  });
});

describe('buildThenBrowser', () => {
  function collect<T>(source: ReturnType<typeof buildThenBrowser<T>>): LoadResult<T>[] {
    const results: LoadResult<T>[] = [];
    source.subscribe((result) => results.push(result));

    return results;
  }

  it('no build, busca uma vez sem pular o transfer cache', () => {
    const load = jasmine.createSpy('load').and.returnValue(of('texto'));

    expect(collect(buildThenBrowser(load, false))).toEqual([{ ok: true, value: 'texto' }]);
    expect(load.calls.allArgs()).toEqual([[false]]);
  });

  it('no build, uma falha da API vira estado de carregamento, sem erro', () => {
    const load = jasmine
      .createSpy('load')
      .and.returnValue(throwError(() => new Error('fora do ar')));

    expect(collect(buildThenBrowser(load, false))).toEqual([{ ok: false }]);
  });

  it('no navegador, busca de novo na rede e troca só se mudou', () => {
    const load = jasmine
      .createSpy('load')
      .and.callFake((fresh: boolean) => of(fresh ? 'texto novo' : 'texto do build'));

    expect(collect(buildThenBrowser(load, true))).toEqual([
      { ok: true, value: 'texto do build' },
      { ok: true, value: 'texto novo' },
    ]);
    expect(load.calls.allArgs()).toEqual([[false], [true]]);
  });

  it('no navegador, não emite de novo o mesmo valor', () => {
    const load = jasmine.createSpy('load').and.returnValue(of('igual'));

    expect(collect(buildThenBrowser(load, true))).toEqual([{ ok: true, value: 'igual' }]);
  });

  it('no navegador, a busca nova falhar não apaga o que já foi mostrado', () => {
    const load = jasmine
      .createSpy('load')
      .and.callFake((fresh: boolean) =>
        fresh ? throwError(() => new Error('rede')) : of('texto'),
      );

    expect(collect(buildThenBrowser(load, true))).toEqual([{ ok: true, value: 'texto' }]);
  });

  it('no navegador, avisa a falha só quando nada chegou', () => {
    const load = jasmine.createSpy('load').and.returnValue(throwError(() => new Error('rede')));

    expect(collect(buildThenBrowser(load, true))).toEqual([{ ok: false }]);
  });

  it('entrega o valor nulo, que é resposta, e não falha', () => {
    const pending = new Subject<string | null>();
    const load = jasmine
      .createSpy('load')
      .and.callFake((fresh: boolean) => (fresh ? pending : of(null)));
    const results = collect(buildThenBrowser<string | null>(load, true));

    pending.next(null);
    pending.complete();

    expect(results).toEqual([{ ok: true, value: null }]);
  });
});
