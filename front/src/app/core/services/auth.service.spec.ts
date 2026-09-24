import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

const LOGIN = `${environment.apiUrl}/auth/login`;
const REFRESH = `${environment.apiUrl}/auth/refresh`;
const LOGOUT = `${environment.apiUrl}/auth/logout`;
const ME = `${environment.apiUrl}/users/me`;

const SESSION = {
  idToken: 'id-token-123',
  expiresIn: 3600,
  user: { uid: 'uid-123', email: 'aluno@delcastanher.com', name: null, role: 'aluno' as const },
};

const PROFILE = {
  id: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  bio: 'Bio.',
  phone: '(11) 90000-0000',
  linkedin: null,
  onboardingCompleted: true,
  policyAcceptedAt: null,
  policyAcceptedVersion: null,
};

describe('AuthService', () => {
  let auth: AuthService;
  let users: UserService;
  let backend: HttpTestingController;

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    auth = TestBed.inject(AuthService);
    users = TestBed.inject(UserService);
    backend = TestBed.inject(HttpTestingController);
  }

  function login(): void {
    auth.login('aluno@delcastanher.com', 'senha').subscribe();
    backend.expectOne(LOGIN).flush(SESSION);
    backend.expectOne(ME).flush(PROFILE);
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('carrega o perfil do banco antes de concluir o login', () => {
    setup();
    let concluded = false;

    auth.login('aluno@delcastanher.com', 'senha').subscribe(() => (concluded = true));
    backend.expectOne(LOGIN).flush(SESSION);

    // Enquanto o perfil nao chega, quem chamou o login ainda nao redirecionou.
    expect(concluded).toBeFalse();

    backend.expectOne(ME).flush(PROFILE);

    expect(concluded).toBeTrue();
    expect(users.profile()).toEqual(PROFILE);
  });

  describe('sessao em memoria (Spec 017, decisoes 18 e 19)', () => {
    it('envia o login com credenciais, para o navegador aceitar o cookie da API', () => {
      setup();

      auth.login('aluno@delcastanher.com', 'senha').subscribe();
      const request = backend.expectOne(LOGIN);

      expect(request.request.withCredentials).toBeTrue();
      request.flush(SESSION);
      backend.expectOne(ME).flush(PROFILE);
    });

    it('nao grava nenhum token no localStorage, so o indicador sem segredo', () => {
      setup();
      login();

      expect(auth.idToken()).toBe('id-token-123');
      expect(localStorage.getItem('delcastanher.has-session')).toBe('1');

      const stored = Object.keys(localStorage).map(key => localStorage.getItem(key) ?? '').join('|');

      expect(stored).not.toContain('id-token-123');
    });

    it('apaga a chave de sessao anterior a Spec 017', () => {
      localStorage.setItem('delcastanher.session', JSON.stringify({ idToken: 'velho', refreshToken: 'velho' }));

      setup();

      expect(localStorage.getItem('delcastanher.session')).toBeNull();
      expect(auth.isAuthenticated()).toBeFalse();
    });
  });

  describe('refresh', () => {
    it('manda o cookie com credenciais e abre a sessao com a resposta', () => {
      setup();

      auth.refresh().subscribe();
      const request = backend.expectOne(REFRESH);

      expect(request.request.method).toBe('POST');
      expect(request.request.withCredentials).toBeTrue();
      request.flush(SESSION);

      expect(auth.role()).toBe('aluno');
      expect(auth.idToken()).toBe('id-token-123');
    });

    it('dispara uma unica requisicao para chamadas simultaneas (decisao 20)', () => {
      setup();
      const tokens: string[] = [];

      auth.refresh().subscribe(session => tokens.push(session.idToken));
      auth.refresh().subscribe(session => tokens.push(session.idToken));
      auth.refresh().subscribe(session => tokens.push(session.idToken));

      backend.expectOne(REFRESH).flush(SESSION);

      expect(tokens).toEqual(['id-token-123', 'id-token-123', 'id-token-123']);
    });

    it('volta a chamar a API depois que o refresh anterior terminou', () => {
      setup();

      auth.refresh().subscribe();
      backend.expectOne(REFRESH).flush(SESSION);
      auth.refresh().subscribe();
      backend.expectOne(REFRESH).flush(SESSION);
    });

    it('nao religa a sessao quando o logout acontece durante o refresh', () => {
      setup();
      let failed = false;

      auth.refresh().subscribe({ error: () => (failed = true) });
      const pending = backend.expectOne(REFRESH);

      auth.logout();
      backend.expectOne(LOGOUT).flush(null);
      pending.flush(SESSION);

      expect(failed).toBeTrue();
      expect(auth.isAuthenticated()).toBeFalse();
    });

    it('renova sozinho um minuto antes de o idToken expirar', fakeAsync(() => {
      setup();
      login();

      tick(3600_000 - 60_000 - 1);
      backend.expectNone(REFRESH);

      tick(1);
      backend.expectOne(REFRESH).flush({ ...SESSION, idToken: 'id-token-novo' });

      expect(auth.idToken()).toBe('id-token-novo');

      auth.logout();
      backend.expectOne(LOGOUT).flush(null);
    }));

    it('cancela a renovacao agendada no logout', fakeAsync(() => {
      setup();
      login();

      auth.logout();
      backend.expectOne(LOGOUT).flush(null);
      tick(3600_000);

      backend.expectNone(REFRESH);
    }));
  });

  describe('restoreSession (decisao 19)', () => {
    it('nao chama a API sem o indicador de sessao: visitante anonimo nao espera nada', () => {
      setup();
      let done = false;

      auth.restoreSession().subscribe(() => (done = true));

      backend.expectNone(REFRESH);
      expect(done).toBeTrue();
    });

    it('refaz a sessao pelo cookie quando o indicador existe', () => {
      localStorage.setItem('delcastanher.has-session', '1');
      setup();

      auth.restoreSession().subscribe();
      backend.expectOne(REFRESH).flush(SESSION);

      expect(auth.isAuthenticated()).toBeTrue();
    });

    it('limpa o indicador e segue anonimo quando a sessao acabou no servidor', () => {
      localStorage.setItem('delcastanher.has-session', '1');
      setup();
      let done = false;

      auth.restoreSession().subscribe(() => (done = true));
      backend.expectOne(REFRESH).flush({ message: 'Sessao encerrada.' }, { status: 401, statusText: 'Unauthorized' });

      expect(done).toBeTrue();
      expect(auth.isAuthenticated()).toBeFalse();
      expect(localStorage.getItem('delcastanher.has-session')).toBeNull();
    });

    it('mantem o indicador quando a API esta fora do ar, para tentar no proximo carregamento', () => {
      localStorage.setItem('delcastanher.has-session', '1');
      setup();
      let done = false;

      auth.restoreSession().subscribe(() => (done = true));
      backend.expectOne(REFRESH).error(new ProgressEvent('error'), { status: 0 });

      expect(done).toBeTrue();
      expect(localStorage.getItem('delcastanher.has-session')).toBe('1');
    });
  });

  describe('logout (decisao 17)', () => {
    it('limpa a sessao, o perfil e o indicador, e pede a API que apague o cookie', () => {
      setup();
      login();

      auth.logout();

      expect(auth.isAuthenticated()).toBeFalse();
      expect(users.profile()).toBeNull();
      expect(localStorage.getItem('delcastanher.has-session')).toBeNull();

      const request = backend.expectOne(LOGOUT);

      expect(request.request.method).toBe('POST');
      expect(request.request.withCredentials).toBeTrue();
      request.flush(null);
    });

    it('encerra a sessao local mesmo com a API fora do ar', () => {
      setup();
      login();

      auth.logout();
      backend.expectOne(LOGOUT).error(new ProgressEvent('error'), { status: 0 });

      expect(auth.isAuthenticated()).toBeFalse();
    });
  });
});
