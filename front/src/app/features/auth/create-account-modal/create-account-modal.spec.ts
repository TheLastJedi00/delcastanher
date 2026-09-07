import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateAccountModal } from './create-account-modal';

describe('CreateAccountModal', () => {
  let fixture: ComponentFixture<CreateAccountModal>;
  let component: CreateAccountModal;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CreateAccountModal] }).compileComponents();

    fixture = TestBed.createComponent(CreateAccountModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

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
    expect(emitted).toHaveBeenCalledOnceWith('aluno@delcastanher.com');
  });
});
