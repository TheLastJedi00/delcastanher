import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CreateAccountModal } from './create-account-modal';

describe('CreateAccountModal', () => {
  let fixture: ComponentFixture<CreateAccountModal>;
  let component: CreateAccountModal;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateAccountModal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateAccountModal);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('nao mostra erros antes da primeira tentativa de envio', () => {
    expect(component.showErrors()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Informe seu e-mail.');
  });

  it('exige os dois campos ao tentar enviar vazio', () => {
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);

    component.submit();
    fixture.detectChanges();

    expect(emitted).not.toHaveBeenCalled();
    http.expectNone(() => true);
    expect(fixture.nativeElement.textContent).toContain('Informe seu e-mail.');
    expect(fixture.nativeElement.textContent).toContain('Confirme seu e-mail.');
  });

  it('rejeita e-mail em formato invalido', () => {
    component.email.set('nao-e-email');
    component.confirmEmail.set('nao-e-email');

    expect(component.emailError()).toBe('Informe um e-mail válido.');
    expect(component.isValid()).toBe(false);
  });

  it('bloqueia o envio quando os e-mails diferem', () => {
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.email.set('aluno@delcastanher.com');
    component.confirmEmail.set('outro@delcastanher.com');

    component.submit();
    fixture.detectChanges();

    expect(emitted).not.toHaveBeenCalled();
    expect(component.confirmError()).toBe('Os e-mails não são iguais.');
    expect(fixture.nativeElement.textContent).toContain('Os e-mails não são iguais.');
  });

  it('aceita e-mails iguais ignorando caixa e espacos, emitindo o valor normalizado', () => {
    const emitted = jasmine.createSpy('submitted');
    component.submitted.subscribe(emitted);
    component.email.set('  Aluno@Delcastanher.com  ');
    component.confirmEmail.set('aluno@DELCASTANHER.com');

    component.submit();

    expect(component.isValid()).toBe(true);
    expect(component.isSending()).toBe(true);

    const request = http.expectOne(req => req.url.endsWith('/auth/account'));
    expect(request.request.body).toEqual({ email: 'aluno@delcastanher.com' });
    request.flush({ message: 'Link enviado.' });
    fixture.detectChanges();

    expect(component.isSending()).toBe(false);
    expect(emitted).toHaveBeenCalledOnceWith('aluno@delcastanher.com');
    expect(fixture.nativeElement.textContent).toContain('Link enviado.');
  });

  it('mostra a mensagem de erro quando a API recusa o envio', () => {
    component.email.set('aluno@delcastanher.com');
    component.confirmEmail.set('aluno@delcastanher.com');

    component.submit();
    http
      .expectOne(req => req.url.endsWith('/auth/account'))
      .flush({ message: 'E-mail invalido.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.isSending()).toBe(false);
    expect(component.errorMessage()).toBe('E-mail invalido.');
    expect(fixture.nativeElement.textContent).toContain('E-mail invalido.');
  });
});
