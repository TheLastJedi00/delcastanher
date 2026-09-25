import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Login } from './login';

/** Preenche, envia e responde o login e a carga do perfil. */
function loginAs(fixture: ComponentFixture<Login>, http: HttpTestingController): void {
  const component = fixture.componentInstance;
  component.email.set('aluno@delcastanher.com');
  component.password.set('senha123');
  component.doLogin();

  http.expectOne(req => req.url.endsWith('/auth/login')).flush({
    idToken: 't',
    expiresIn: 3600,
    user: { uid: 'u', email: 'aluno@delcastanher.com', name: null, role: 'aluno' },
  });
  http.expectOne(req => req.url.endsWith('/users/me')).flush({ onboardingCompleted: true });
}

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

  it('sem destino pedido, termina na area da pessoa', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    loginAs(fixture, http);

    expect(navigate).toHaveBeenCalledWith('/ava');
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

/** Spec 019, decisao 17: o login devolve a pessoa para onde ela ia. */
describe('Login com destino', () => {
  function setup(redirect: string): { fixture: ComponentFixture<Login>; http: HttpTestingController } {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ redirect }) } },
        },
      ],
    });

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  it('navega para o destino interno pedido', () => {
    const { fixture, http } = setup('/loja?pacote=imersao-rh-lancamento');
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);

    loginAs(fixture, http);

    expect(navigate).toHaveBeenCalledWith('/loja?pacote=imersao-rh-lancamento');
    http.verify();
  });

  it('ignora destino externo', () => {
    const { fixture, http } = setup('https://example.com');
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);

    loginAs(fixture, http);

    expect(navigate).toHaveBeenCalledWith('/ava');
    http.verify();
  });
});
