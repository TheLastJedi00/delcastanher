import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { PolicyStatus } from '../../core/services/legal-documents.service';
import { signInForTest } from '../../core/testing/session';
import { Onboarding } from './onboarding';

const ME = `${environment.apiUrl}/users/me`;
const POLICY = `${environment.apiUrl}/legal/policy-version`;

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
    backend.expectOne(POLICY).flush({ version: '2026-09-13', published: ['PRIVACY', 'COOKIES'] });
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  /** Troca a politica carregada, como se a pagina tivesse aberto com ela. */
  function recarregarPolitica(status: PolicyStatus): void {
    component.policy.set(status);
    fixture.detectChanges();
  }

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
      policyVersion: '2026-09-13',
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

    function rotulo(): string {
      return (fixture.nativeElement.querySelector('ui-checkbox').textContent as string)
        .replace(/\s+/g, ' ')
        .trim();
    }

    function links(): HTMLAnchorElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('ui-checkbox a'));
    }

    // Spec 022, decisao 6: aceitar um texto que nao existe nao e aceite.
    it('sem os Termos publicados, lista só a Privacidade e a Cookies, em aba nova', () => {
      expect(links().map(a => a.getAttribute('href'))).toEqual([
        '/politica-de-privacidade',
        '/politica-de-cookies',
      ]);
      expect(links().every(a => a.target === '_blank')).toBeTrue();
      expect(rotulo()).toBe('Li e aceito a Política de Privacidade e a Política de Cookies.');
    });

    it('com os Termos publicados, pede ciência deles também', () => {
      recarregarPolitica({ version: '2026-09-28', published: ['TERMS', 'PRIVACY', 'COOKIES'] });

      expect(links().map(a => a.getAttribute('href'))).toEqual([
        '/politica-de-privacidade',
        '/politica-de-cookies',
        '/termos-de-uso',
      ]);
      expect(rotulo()).toBe(
        'Li e aceito a Política de Privacidade e a Política de Cookies, e declaro estar ciente das condições descritas nos Termos de Uso.',
      );
    });

    it('envia a versão vigente lida da API', () => {
      recarregarPolitica({ version: '2026-09-28.2', published: ['PRIVACY', 'COOKIES'] });
      component.form.setValue(VALID);
      component.submit();

      const request = backend.expectOne(ME);

      expect(request.request.body.policyVersion).toBe('2026-09-28.2');
      request.flush({ id: 'uid-123', onboardingCompleted: true });
    });

    it('com 409, recarrega os documentos e pede o aceite de novo sem perder o formulário', () => {
      component.form.setValue(VALID);
      component.submit();

      backend.expectOne(ME).flush(
        { message: 'Os documentos foram atualizados.', policyVersion: '2026-09-28' },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      expect(component.form.controls.policyAccepted.value).toBeFalse();
      expect(component.form.controls.name.value).toBe('Aluno Teste');
      expect(component.errorMessage()).toContain('Os documentos foram atualizados');

      backend
        .expectOne(POLICY)
        .flush({ version: '2026-09-28', published: ['TERMS', 'PRIVACY', 'COOKIES'] });
      fixture.detectChanges();

      expect(links().length).toBe(3);

      component.form.controls.policyAccepted.setValue(true);
      component.submit();

      expect(backend.expectOne(ME).request.body.policyVersion).toBe('2026-09-28');
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
