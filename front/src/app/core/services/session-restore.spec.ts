import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { provideSessionRestore } from './session-restore';

const REFRESH = `${environment.apiUrl}/auth/refresh`;

const SESSION = {
  idToken: 'id-token-123',
  expiresIn: 3600,
  user: { uid: 'uid-123', email: 'aluno@delcastanher.com', name: null, role: 'aluno' as const },
};

/**
 * Initializer de sessao (Spec 017, decisao 19). O initializer do Angular
 * termina antes da primeira navegacao, entao "o bootstrap esperou" e o mesmo
 * que "os guards so rodaram depois do refresh".
 */
describe('provideSessionRestore', () => {
  function setup(platform: 'browser' | 'server' = 'browser') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSessionRestore(),
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });

    // Instanciar o injetor dispara os initializers.
    const status = TestBed.inject(ApplicationInitStatus);

    return { status, backend: TestBed.inject(HttpTestingController) };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('nao faz requisicao nenhuma para quem nunca entrou', async () => {
    const { status, backend } = setup();

    await status.donePromise;

    backend.expectNone(REFRESH);
    expect(status.done).toBeTrue();
  });

  it('segura o bootstrap ate o refresh responder, e so entao a sessao existe', async () => {
    localStorage.setItem('delcastanher.has-session', '1');
    const { status, backend } = setup();

    expect(status.done).toBeFalse();

    backend.expectOne(REFRESH).flush(SESSION);
    await status.donePromise;

    expect(status.done).toBeTrue();
    expect(TestBed.inject(AuthService).role()).toBe('aluno');
  });

  it('nao trava o bootstrap quando a sessao acabou no servidor', async () => {
    localStorage.setItem('delcastanher.has-session', '1');
    const { status, backend } = setup();

    backend.expectOne(REFRESH).flush(null, { status: 401, statusText: 'Unauthorized' });
    await status.donePromise;

    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  it('no prerender nao faz nada, mesmo com indicador: o servidor e sempre anonimo', async () => {
    localStorage.setItem('delcastanher.has-session', '1');
    const { status, backend } = setup('server');

    await status.donePromise;

    backend.expectNone(REFRESH);
  });
});
