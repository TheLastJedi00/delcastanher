import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

const ME = `${environment.apiUrl}/users/me`;
const ORDERS = `${environment.apiUrl}/orders`;
const REFRESH = `${environment.apiUrl}/auth/refresh`;

const SESSION = {
  idToken: 'id-token-123',
  expiresIn: 3600,
  user: { uid: 'uid-123', email: 'aluno@delcastanher.com', name: null, role: 'aluno' as const },
};

const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  /** Abre a sessao pelo refresh, que e o caminho real depois de um reload. */
  function signIn(): void {
    auth.refresh().subscribe();
    backend.expectOne(REFRESH).flush(SESSION);
  }

  it('nao envia Authorization quando nao ha sessao', () => {
    http.get(ME).subscribe();

    expect(backend.expectOne(ME).request.headers.has('Authorization')).toBeFalse();
  });

  it('anexa o idToken da sessao as chamadas da API', () => {
    signIn();

    http.get(ME).subscribe();

    expect(backend.expectOne(ME).request.headers.get('Authorization')).toBe('Bearer id-token-123');
  });

  it('nao vaza o token para destinos fora da API', () => {
    signIn();

    http.get('https://fonts.googleapis.com/css').subscribe();

    expect(backend.expectOne('https://fonts.googleapis.com/css').request.headers.has('Authorization'))
      .toBeFalse();
  });

  it('preserva um Authorization definido pela propria chamada', () => {
    signIn();

    http.get(ME, { headers: { Authorization: 'Bearer outro' } }).subscribe();

    expect(backend.expectOne(ME).request.headers.get('Authorization')).toBe('Bearer outro');
  });

  describe('401 da API (Spec 017, decisao 20)', () => {
    it('renova a sessao e repete a requisicao original com o token novo', () => {
      signIn();
      let body: unknown;

      http.get(ME).subscribe(response => (body = response));
      backend.expectOne(ME).flush(null, UNAUTHORIZED);
      backend.expectOne(REFRESH).flush({ ...SESSION, idToken: 'id-token-novo' });

      const retry = backend.expectOne(ME);

      expect(retry.request.headers.get('Authorization')).toBe('Bearer id-token-novo');
      retry.flush({ ok: true });
      expect(body).toEqual({ ok: true });
    });

    it('faz um unico refresh para varias requisicoes que falham juntas', () => {
      signIn();

      http.get(ME).subscribe();
      http.get(ORDERS).subscribe();
      backend.expectOne(ME).flush(null, UNAUTHORIZED);
      backend.expectOne(ORDERS).flush(null, UNAUTHORIZED);

      backend.expectOne(REFRESH).flush({ ...SESSION, idToken: 'id-token-novo' });

      expect(backend.expectOne(ME).request.headers.get('Authorization')).toBe('Bearer id-token-novo');
      expect(backend.expectOne(ORDERS).request.headers.get('Authorization')).toBe('Bearer id-token-novo');
    });

    it('repete uma vez so: um segundo 401 chega a quem chamou', () => {
      signIn();
      let error: HttpErrorResponse | undefined;

      http.get(ME).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
      backend.expectOne(ME).flush(null, UNAUTHORIZED);
      backend.expectOne(REFRESH).flush(SESSION);
      backend.expectOne(ME).flush(null, UNAUTHORIZED);

      expect(error?.status).toBe(401);
    });

    it('encerra a sessao quando o refresh e recusado, e entrega o erro original', () => {
      signIn();
      const expire = spyOn(auth, 'expire').and.callThrough();
      let error: HttpErrorResponse | undefined;

      http.get(ME).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
      backend.expectOne(ME).flush({ message: 'original' }, UNAUTHORIZED);
      backend.expectOne(REFRESH).flush(null, UNAUTHORIZED);

      expect(expire).toHaveBeenCalled();
      expect(auth.isAuthenticated()).toBeFalse();
      expect(error?.url).toBe(ME);
      expect(error?.error).toEqual({ message: 'original' });
    });

    it('nao encerra a sessao quando o refresh falha por rede', () => {
      signIn();
      const expire = spyOn(auth, 'expire');

      http.get(ME).subscribe({ error: () => undefined });
      backend.expectOne(ME).flush(null, UNAUTHORIZED);
      backend.expectOne(REFRESH).error(new ProgressEvent('error'), { status: 0 });

      expect(expire).not.toHaveBeenCalled();
      expect(auth.isAuthenticated()).toBeTrue();
    });

    it('nao trata como sessao vencida um erro que nao e 401', () => {
      signIn();

      http.get(ME).subscribe({ error: () => undefined });
      backend.expectOne(ME).flush(null, { status: 403, statusText: 'Forbidden' });

      backend.expectNone(REFRESH);
    });

    it('nunca anexa token nem tenta refresh nas rotas de sessao, para nao entrar em laco', () => {
      signIn();
      const refresh = spyOn(auth, 'refresh').and.callThrough();

      http.post(REFRESH, null).subscribe({ error: () => undefined });
      const request = backend.expectOne(REFRESH);

      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush(null, UNAUTHORIZED);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('manda ao login quando a sessao acaba numa rota protegida', () => {
      signIn();
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
      spyOnProperty(router, 'routerState').and.returnValue({
        snapshot: { root: { routeConfig: null, firstChild: { routeConfig: { canActivate: [() => true] }, firstChild: null } } },
      } as never);

      http.get(ME).subscribe({ error: () => undefined });
      backend.expectOne(ME).flush(null, UNAUTHORIZED);
      backend.expectOne(REFRESH).flush(null, UNAUTHORIZED);

      expect(navigate).toHaveBeenCalledWith('/login');
    });

    it('nao tira da pagina publica quem teve a sessao encerrada nela', () => {
      signIn();
      const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl');

      http.get(ME).subscribe({ error: () => undefined });
      backend.expectOne(ME).flush(null, UNAUTHORIZED);
      backend.expectOne(REFRESH).flush(null, UNAUTHORIZED);

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
