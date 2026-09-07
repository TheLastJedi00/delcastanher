import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Onboarding } from './onboarding';

const ME = `${environment.apiUrl}/users/me`;

const VALID = {
  name: 'Aluno Teste',
  bio: 'Analista de RH ha 8 anos.',
  phone: '(11) 90000-0000',
  linkedin: '',
};

describe('Onboarding', () => {
  let fixture: ComponentFixture<Onboarding>;
  let component: Onboarding;
  let backend: HttpTestingController;

  beforeEach(async () => {
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

    await TestBed.configureTestingModule({
      imports: [Onboarding],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Onboarding);
    component = fixture.componentInstance;
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  it('nao envia nada e aponta os campos obrigatorios vazios', () => {
    component.submit();
    fixture.detectChanges();

    backend.expectNone(ME);
    expect(component.errors().name).toBe('Informe seu nome completo.');
    expect(component.errors().bio).toBe('Escreva um resumo da sua atuação.');
    expect(component.errors().phone).toBe('Informe um telefone para contato.');
    expect(fixture.nativeElement.textContent).toContain('Informe seu nome completo.');
  });

  it('recusa um linkedin que nao seja um endereco do LinkedIn', () => {
    component.form.setValue({ ...VALID, linkedin: 'meu-site.com/perfil' });

    component.submit();

    backend.expectNone(ME);
    expect(component.errors().linkedin).toBe('Informe um endereço válido do LinkedIn.');
  });

  it('limpa o aviso quando o campo e corrigido', () => {
    component.submit();
    expect(component.errors().name).not.toBe('');

    component.form.controls.name.setValue('Aluno Teste');

    expect(component.errors().name).toBe('');
  });

  it('envia o perfil, mostra o loading e redireciona para a area do aluno', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    component.form.setValue(VALID);
    component.submit();
    fixture.detectChanges();

    expect(component.isLoading()).toBeTrue();
    expect(fixture.nativeElement.ownerDocument.querySelector('ui-loading-overlay')).not.toBeNull();

    const request = backend.expectOne({ method: 'PATCH', url: ME });

    // LinkedIn vazio nao vai no payload: o campo e opcional na API.
    expect(request.request.body).toEqual({
      name: 'Aluno Teste',
      bio: 'Analista de RH ha 8 anos.',
      phone: '(11) 90000-0000',
      linkedin: undefined,
    });

    request.flush({ id: 'uid-123', onboardingCompleted: true });
    fixture.detectChanges();

    expect(component.isLoading()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith('/ava');
  });

  it('mostra a mensagem do backend quando o envio falha', () => {
    component.form.setValue(VALID);
    component.submit();

    backend
      .expectOne(ME)
      .flush({ message: 'Escreva uma bio.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.isLoading()).toBeFalse();
    expect(component.errorMessage()).toBe('Escreva uma bio.');
    expect(fixture.nativeElement.textContent).toContain('Escreva uma bio.');
  });
});
