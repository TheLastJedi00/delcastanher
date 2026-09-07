import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { UserProfile, UserService } from './user.service';

const PROFILE: UserProfile = {
  id: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Lidiane Delcastanher',
  bio: 'Especialista em RH.',
  phone: '(11) 90000-0000',
  linkedin: null,
  onboardingCompleted: true,
};

const ME = `${environment.apiUrl}/users/me`;

describe('UserService', () => {
  let service: UserService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(UserService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('comeca sem perfil e sem saber o estado do onboarding', () => {
    expect(service.profile()).toBeNull();
    expect(service.onboardingCompleted()).toBeNull();
  });

  it('carrega o perfil e publica o estado do onboarding', () => {
    service.loadProfile().subscribe();
    backend.expectOne({ method: 'GET', url: ME }).flush(PROFILE);

    expect(service.profile()).toEqual(PROFILE);
    expect(service.onboardingCompleted()).toBeTrue();
    expect(service.displayName()).toBe('Lidiane Delcastanher');
    expect(service.initials()).toBe('LD');
  });

  it('cai no e-mail quando o nome ainda nao foi preenchido', () => {
    service.loadProfile().subscribe();
    backend.expectOne(ME).flush({ ...PROFILE, name: null, onboardingCompleted: false });

    expect(service.displayName()).toBe('aluno');
    expect(service.initials()).toBe('AL');
  });

  it('atualiza o estado com o perfil devolvido pelo PATCH', () => {
    service.updateProfile({ name: 'Novo Nome', bio: 'Bio.', phone: '(11) 1' }).subscribe();

    const request = backend.expectOne({ method: 'PATCH', url: ME });

    expect(request.request.body).toEqual({ name: 'Novo Nome', bio: 'Bio.', phone: '(11) 1' });
    request.flush({ ...PROFILE, name: 'Novo Nome' });

    expect(service.profile()?.name).toBe('Novo Nome');
  });

  it('traduz a falha do backend para uma mensagem exibivel', done => {
    service.loadProfile().subscribe({
      error: (message: string) => {
        expect(message).toBe('Sessao invalida.');
        done();
      },
    });

    backend.expectOne(ME).flush({ message: 'Sessao invalida.' }, { status: 401, statusText: 'x' });
  });

  it('ensureProfile reaproveita o perfil ja carregado', () => {
    service.loadProfile().subscribe();
    backend.expectOne(ME).flush(PROFILE);

    service.ensureProfile().subscribe();

    backend.expectNone(ME);
  });

  it('clear descarta o perfil em memoria', () => {
    service.loadProfile().subscribe();
    backend.expectOne(ME).flush(PROFILE);

    service.clear();

    expect(service.profile()).toBeNull();
  });
});
