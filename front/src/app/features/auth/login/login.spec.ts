import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('nao envia o formulario sem e-mail e senha preenchidos', () => {
    fixture.componentInstance.doLogin();

    http.expectNone(() => true);
    expect(fixture.componentInstance.isLoading()).toBe(false);
  });

  it('exibe o loading em tela cheia enquanto a requisicao esta pendente', () => {
    const component = fixture.componentInstance;
    component.email.set('aluno@delcastanher.com');
    component.password.set('senha123');

    component.doLogin();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(true);
    const overlay: HTMLElement | null =
      fixture.nativeElement.ownerDocument.querySelector('ui-loading-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain('backdrop-blur-sm');
    expect(overlay!.querySelector('ui-logo')!.className).toContain('animate-spin-slow');

    http.expectOne(req => req.url.endsWith('/auth/login')).flush({
      idToken: 't',
      refreshToken: 'r',
      expiresIn: 3600,
      user: { uid: 'u', email: 'aluno@delcastanher.com', name: null, role: 'aluno' },
    });
    fixture.detectChanges();

    // O login so termina depois de sincronizar o perfil do banco.
    expect(component.isLoading()).toBe(true);

    http.expectOne(req => req.url.endsWith('/users/me')).flush({ onboardingCompleted: true });
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
  });

  it('desliga o loading e mostra a mensagem quando o login falha', () => {
    const component = fixture.componentInstance;
    component.email.set('aluno@delcastanher.com');
    component.password.set('errada');

    component.doLogin();
    http
      .expectOne(req => req.url.endsWith('/auth/login'))
      .flush({ message: 'E-mail ou senha invalidos.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBe('E-mail ou senha invalidos.');
    expect(fixture.nativeElement.textContent).toContain('E-mail ou senha invalidos.');
  });
});
