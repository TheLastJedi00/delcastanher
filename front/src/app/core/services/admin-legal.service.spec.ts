import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AdminLegalDocumentsResult, AdminLegalService } from './admin-legal.service';

const BASE = `${environment.apiUrl}/admin/legal/documents`;

const RESULT: AdminLegalDocumentsResult = {
  policyVersion: '2026-09-13',
  documents: [
    { kind: 'TERMS', current: null, draft: null },
    {
      kind: 'PRIVACY',
      current: {
        id: 'v1',
        kind: 'PRIVACY',
        content: '## 1. Objetivo\n\nTexto.',
        policyVersion: '2026-09-13',
        changeKind: 'INITIAL',
        publishedAt: '2026-09-13T12:00:00.000Z',
        publishedByEmail: null,
      },
      draft: null,
    },
    { kind: 'COOKIES', current: null, draft: null },
  ],
};

/** Contrato das rotas admin dos documentos legais (Spec 022, Task 1.3). */
describe('AdminLegalService', () => {
  let service: AdminLegalService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AdminLegalService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('carrega os três documentos e guarda o resultado no signal', () => {
    service.load().subscribe();
    backend.expectOne({ method: 'GET', url: BASE }).flush(RESULT);

    expect(service.result()).toEqual(RESULT);
    expect(service.loading()).toBeFalse();
  });

  it('salva o rascunho com o kind em minúsculas e recarrega a lista', () => {
    service.saveDraft('PRIVACY', 'Texto novo').subscribe();

    const put = backend.expectOne({ method: 'PUT', url: `${BASE}/privacy/draft` });
    expect(put.request.body).toEqual({ content: 'Texto novo' });
    put.flush({ content: 'Texto novo', updatedAt: '2026-09-28T12:00:00Z', updatedByEmail: 'a@b.c' });

    backend.expectOne({ method: 'GET', url: BASE }).flush(RESULT);
  });

  it('descarta o rascunho e recarrega a lista', () => {
    service.discardDraft('COOKIES').subscribe();

    backend.expectOne({ method: 'DELETE', url: `${BASE}/cookies/draft` }).flush(null);
    backend.expectOne({ method: 'GET', url: BASE }).flush(RESULT);

    expect(service.result()).toEqual(RESULT);
  });

  it('publica com o tipo da mudança, sem mandar autor no corpo', () => {
    service.publish('TERMS', 'NEW_VERSION').subscribe();

    const post = backend.expectOne({ method: 'POST', url: `${BASE}/terms/publish` });
    expect(post.request.body).toEqual({ changeKind: 'NEW_VERSION' });
    post.flush(RESULT.documents[1].current);

    backend.expectOne({ method: 'GET', url: BASE }).flush(RESULT);
  });

  it('lista as versões de um documento', () => {
    let total = -1;
    service.versions('PRIVACY').subscribe(list => (total = list.length));

    backend
      .expectOne({ method: 'GET', url: `${BASE}/privacy/versions` })
      .flush([RESULT.documents[1].current]);

    expect(total).toBe(1);
  });

  it('devolve a mensagem do servidor na recusa, sem recarregar', () => {
    let message = '';
    service.publish('PRIVACY', 'CORRECTION').subscribe({ error: (m: string) => (message = m) });

    backend
      .expectOne(`${BASE}/privacy/publish`)
      .flush({ message: 'Não há rascunho para publicar.' }, { status: 400, statusText: 'Bad Request' });

    expect(message).toBe('Não há rascunho para publicar.');
    backend.expectNone(BASE);
  });

  it('guarda o erro da carga no signal', () => {
    service.load().subscribe({ error: () => undefined });
    backend.expectOne(BASE).flush(null, { status: 0, statusText: 'Unknown Error' });

    expect(service.error()).toContain('Não foi possível falar com o servidor');
  });
});
