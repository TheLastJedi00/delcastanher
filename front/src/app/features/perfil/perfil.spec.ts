import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../../core/services/user.service';
import { Perfil } from './perfil';

const ME = `${environment.apiUrl}/users/me`;

const PROFILE: UserProfile = {
  id: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  bio: 'Analista de RH ha 8 anos.',
  phone: '(11) 90000-0000',
  linkedin: 'https://linkedin.com/in/aluno',
  onboardingCompleted: true,
  policyAcceptedAt: null,
  policyAcceptedVersion: null,
};

describe('Perfil', () => {
  let fixture: ComponentFixture<Perfil>;
  let component: Perfil;
  let backend: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [Perfil],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Perfil);
    component = fixture.componentInstance;
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  /** Responde ao carregamento que a tela dispara ao abrir. */
  function loadProfile(profile: UserProfile = PROFILE): void {
    backend.expectOne({ method: 'GET', url: ME }).flush(profile);
    fixture.detectChanges();
  }

  it('preenche o formulario com os dados persistidos', () => {
    loadProfile();

    expect(component.form.getRawValue()).toEqual({
      name: 'Aluno Teste',
      bio: 'Analista de RH ha 8 anos.',
      phone: '(11) 90000-0000',
      linkedin: 'https://linkedin.com/in/aluno',
      marketingOptIn: true,
    });
    expect(fixture.nativeElement.textContent).toContain('aluno@delcastanher.com');
    expect(fixture.nativeElement.textContent).toContain('Aluno Teste');
  });

  it('nao salva um formulario invalido', () => {
    loadProfile();
    component.form.controls.name.setValue('');

    component.save();

    backend.expectNone({ method: 'PATCH', url: ME });
    expect(component.errors().name).toBe('Informe seu nome completo.');
  });

  it('salva as alteracoes e confirma o sucesso na tela', () => {
    loadProfile();
    component.form.controls.name.setValue('Nome Atualizado');

    component.save();
    fixture.detectChanges();

    expect(component.isSaving()).toBeTrue();

    const request = backend.expectOne({ method: 'PATCH', url: ME });

    expect(request.request.body.name).toBe('Nome Atualizado');
    request.flush({ ...PROFILE, name: 'Nome Atualizado' });
    fixture.detectChanges();

    expect(component.isSaving()).toBeFalse();
    expect(component.saved()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Alterações salvas.');
    // O estado global acompanha, entao o cabecalho ja mostra o novo nome.
    expect(fixture.nativeElement.textContent).toContain('Nome Atualizado');
  });

  it('mostra a mensagem do backend quando o salvamento falha', () => {
    loadProfile();

    component.save();
    backend
      .expectOne(ME)
      .flush({ message: 'Escreva uma bio.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.saved()).toBeFalse();
    expect(component.errorMessage()).toBe('Escreva uma bio.');
    expect(fixture.nativeElement.textContent).toContain('Escreva uma bio.');
  });

  /** Spec 023, decisao B5: o interruptor de novidades por e-mail. */
  describe('novidades por e-mail', () => {
    const checkbox = () =>
      fixture.nativeElement.querySelector('[data-testid="novidades"] input[type="checkbox"]') as HTMLInputElement;

    it('vem ligado para quem nunca se descadastrou', () => {
      loadProfile();

      expect(checkbox().checked).toBeTrue();
    });

    it('vem desligado para quem se descadastrou', () => {
      loadProfile({ ...PROFILE, marketingOptOutAt: '2026-09-30T12:00:00.000Z' });

      expect(checkbox().checked).toBeFalse();
    });

    it('desligar e salvar manda marketingOptIn falso', () => {
      loadProfile();
      checkbox().click();
      fixture.detectChanges();

      component.save();

      const request = backend.expectOne({ method: 'PATCH', url: ME });

      expect(request.request.body.marketingOptIn).toBeFalse();
      request.flush({ ...PROFILE, marketingOptOutAt: '2026-10-02T12:00:00.000Z' });
    });

    it('religar e salvar manda marketingOptIn verdadeiro', () => {
      loadProfile({ ...PROFILE, marketingOptOutAt: '2026-09-30T12:00:00.000Z' });
      checkbox().click();
      fixture.detectChanges();

      component.save();

      const request = backend.expectOne({ method: 'PATCH', url: ME });

      expect(request.request.body.marketingOptIn).toBeTrue();
      request.flush(PROFILE);
    });

    it('no painel do admin, o interruptor some e o campo nao vai', () => {
      fixture.componentRef.setInput('showMarketing', false);
      loadProfile();

      expect(fixture.nativeElement.querySelector('[data-testid="novidades"]')).toBeNull();

      component.save();

      const request = backend.expectOne({ method: 'PATCH', url: ME });

      expect(request.request.body.marketingOptIn).toBeUndefined();
      request.flush(PROFILE);
    });
  });
});
