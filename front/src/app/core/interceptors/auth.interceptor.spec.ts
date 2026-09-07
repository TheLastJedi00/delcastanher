import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

const SESSION = {
  idToken: 'id-token-123',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
  user: { uid: 'uid-123', email: 'aluno@delcastanher.com', name: null, role: 'aluno' as const },
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  /** Faz o login pela propria API para que a sessao fique no estado real. */
  function login(): void {
    auth.login('aluno@delcastanher.com', 'senha').subscribe();
    backend.expectOne(`${environment.apiUrl}/auth/login`).flush(SESSION);
  }

  it('nao envia Authorization quando nao ha sessao', () => {
    http.get(`${environment.apiUrl}/users/me`).subscribe();

    expect(backend.expectOne(`${environment.apiUrl}/users/me`).request.headers.has('Authorization'))
      .toBeFalse();
  });

  it('anexa o idToken da sessao as chamadas da API', () => {
    login();

    http.get(`${environment.apiUrl}/users/me`).subscribe();

    expect(backend.expectOne(`${environment.apiUrl}/users/me`).request.headers.get('Authorization'))
      .toBe('Bearer id-token-123');
  });

  it('nao vaza o token para destinos fora da API', () => {
    login();

    http.get('https://fonts.googleapis.com/css').subscribe();

    expect(backend.expectOne('https://fonts.googleapis.com/css').request.headers.has('Authorization'))
      .toBeFalse();
  });

  it('preserva um Authorization definido pela propria chamada', () => {
    login();

    http.get(`${environment.apiUrl}/users/me`, { headers: { Authorization: 'Bearer outro' } })
      .subscribe();

    expect(backend.expectOne(`${environment.apiUrl}/users/me`).request.headers.get('Authorization'))
      .toBe('Bearer outro');
  });
});
