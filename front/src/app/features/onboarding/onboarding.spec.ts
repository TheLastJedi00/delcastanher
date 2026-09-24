import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CONSENT_POLICY_VERSION } from '../../core/services/consent.service';
import { signInForTest } from '../../core/testing/session';
import { Onboarding } from './onboarding';

const ME = `${environment.apiUrl}/users/me`;

const VALID = {
  name: 'Aluno Teste',
  bio: 'Analista de RH ha 8 anos.',
  phone: '(11) 90000-0000',
  linkedin: '',
  // Spec 015, decisao 10: nasce desmarcado, e um formulario valido e um em que
  // o titular marcou.
  policyAccepted: true,
};

describe('Onboarding', () => {
  let fixture: ComponentFixture<Onboarding>;
  let component: Onboarding;
  let backend: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [Onboarding],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    signInForTest('aluno', { email: 'aluno@delcastanher.com', name: null });

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
      policyAccepted: true,
      policyVersion: CONSENT_POLICY_VERSION,
    });

    request.flush({ id: 'uid-123', onboardingCompleted: true });
    fixture.detectChanges();

    expect(component.isLoading()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith('/ava');
  });

  /**
   * Spec 015, decisoes 9 e 10. O aceite e coletado aqui porque este e o
   * primeiro passo autenticado: o cadastro e um modal que so pede e-mail e
   * dispara o link do Firebase, sem sessao nem registro onde gravar.
   */
  describe('aceite da politica', () => {
    it('nasce desmarcado, porque caixa pré-marcada não é consentimento', () => {
      expect(component.form.controls.policyAccepted.value).toBeFalse();

      const caixa: HTMLInputElement | null =
        fixture.nativeElement.querySelector('input[type="checkbox"]');

      expect(caixa).not.toBeNull();
      expect(caixa!.checked).toBeFalse();
    });

    it('não envia nada e diz por que, quando o perfil está completo mas o aceite não', () => {
      component.form.setValue({ ...VALID, policyAccepted: false });
      component.submit();
      fixture.detectChanges();

      backend.expectNone(ME);
      expect(component.errors().policyAccepted).toBe(
        'É necessário aceitar a Política de Privacidade para concluir o cadastro.',
      );
      expect(fixture.nativeElement.textContent).toContain(
        'É necessário aceitar a Política de Privacidade',
      );
    });

    it('mantém o botão desabilitado enquanto o aceite não é marcado', () => {
      const botao = (): HTMLButtonElement | null =>
        fixture.nativeElement.querySelector('button[type="submit"]');

      expect(botao()!.disabled).toBeTrue();

      component.form.controls.policyAccepted.setValue(true);
      fixture.detectChanges();

      expect(botao()!.disabled).toBeFalse();
    });

    it('linka os três documentos em aba nova, para não perder o formulário', () => {
      const links: HTMLAnchorElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('ui-checkbox a'),
      );

      expect(links.map(a => a.getAttribute('href'))).toEqual([
        '/politica-de-privacidade',
        '/politica-de-cookies',
        '/termos-de-uso',
      ]);
      expect(links.every(a => a.target === '_blank')).toBeTrue();
    });
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
