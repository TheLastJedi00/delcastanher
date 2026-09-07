import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, GuardResult, RouterStateSnapshot, provideRouter } from '@angular/router';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserService } from '../services/user.service';
import { onboardingGuard } from './onboarding.guard';

const ME = `${environment.apiUrl}/users/me`;

const PROFILE = {
  id: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  bio: 'Bio.',
  phone: '(11) 90000-0000',
  linkedin: null,
  onboardingCompleted: true,
};

/** Executa o guard para uma rota. Ele sempre decide de forma assincrona. */
function run(path: string): Observable<GuardResult> {
  const route = { routeConfig: { path } } as ActivatedRouteSnapshot;

  return TestBed.runInInjectionContext(() =>
    onboardingGuard(route, {} as RouterStateSnapshot),
  ) as Observable<GuardResult>;
}

describe('onboardingGuard', () => {
  let backend: HttpTestingController;
  let users: UserService;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'delcastanher.session',
      JSON.stringify({
        idToken: 't',
        refreshToken: 'r',
        expiresAt: Date.now() + 3_600_000,
        user: { uid: 'uid-123', email: 'aluno@delcastanher.com', name: null, role: 'aluno' },
      }),
    );

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    backend = TestBed.inject(HttpTestingController);
    users = TestBed.inject(UserService);
  });

  afterEach(() => backend.verify());

  it('manda para /onboarding quem ainda nao concluiu', done => {
    run('ava').subscribe(result => {
      expect(result.toString()).toBe('/onboarding');
      done();
    });

    backend.expectOne(ME).flush({ ...PROFILE, onboardingCompleted: false });
  });

  it('libera a rota interna de quem ja concluiu', done => {
    run('ava').subscribe(result => {
      expect(result).toBeTrue();
      done();
    });

    backend.expectOne(ME).flush(PROFILE);
  });

  it('devolve quem ja concluiu para a home ao tentar o /onboarding', done => {
    run('onboarding').subscribe(result => {
      expect(result.toString()).toBe('/ava');
      done();
    });

    backend.expectOne(ME).flush(PROFILE);
  });

  it('libera o /onboarding de quem ainda nao concluiu', done => {
    run('onboarding').subscribe(result => {
      expect(result).toBeTrue();
      done();
    });

    backend.expectOne(ME).flush({ ...PROFILE, onboardingCompleted: false });
  });

  it('carrega o perfil quando o estado esta vazio, como no reload da URL', done => {
    expect(users.profile()).toBeNull();

    run('ava').subscribe(() => {
      expect(users.profile()).toEqual(PROFILE);
      done();
    });

    backend.expectOne({ method: 'GET', url: ME }).flush(PROFILE);
  });

  it('nao repete a chamada quando o perfil ja esta em memoria', done => {
    users.loadProfile().subscribe();
    backend.expectOne(ME).flush(PROFILE);

    run('ava').subscribe(result => {
      expect(result).toBeTrue();
      backend.expectNone(ME);
      done();
    });
  });

  it('cai no onboarding quando o backend nao responde', done => {
    run('ava').subscribe(result => {
      expect(result.toString()).toBe('/onboarding');
      done();
    });

    backend.expectOne(ME).flush({ message: 'erro' }, { status: 500, statusText: 'Server Error' });
  });
});
