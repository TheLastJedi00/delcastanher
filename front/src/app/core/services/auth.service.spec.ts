import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

const SESSION = {
  idToken: 'id-token-123',
  refreshToken: 'refresh-token',
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
};

describe('AuthService', () => {
  let auth: AuthService;
  let users: UserService;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    auth = TestBed.inject(AuthService);
    users = TestBed.inject(UserService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('carrega o perfil do banco antes de concluir o login', () => {
    let concluded = false;

    auth.login('aluno@delcastanher.com', 'senha').subscribe(() => (concluded = true));
    backend.expectOne(`${environment.apiUrl}/auth/login`).flush(SESSION);

    // Enquanto o perfil nao chega, quem chamou o login ainda nao redirecionou.
    expect(concluded).toBeFalse();

    backend.expectOne(`${environment.apiUrl}/users/me`).flush(PROFILE);

    expect(concluded).toBeTrue();
    expect(users.profile()).toEqual(PROFILE);
  });

  it('limpa a sessao e o perfil no logout', () => {
    auth.login('aluno@delcastanher.com', 'senha').subscribe();
    backend.expectOne(`${environment.apiUrl}/auth/login`).flush(SESSION);
    backend.expectOne(`${environment.apiUrl}/users/me`).flush(PROFILE);

    auth.logout();

    expect(auth.isAuthenticated()).toBeFalse();
    expect(users.profile()).toBeNull();
    expect(localStorage.getItem('delcastanher.session')).toBeNull();
  });
});
