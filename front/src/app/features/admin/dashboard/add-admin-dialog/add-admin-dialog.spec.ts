import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AddAdminResult, AdminUsersService } from '../../../../core/services/admin-users.service';
import { AddAdminDialog } from './add-admin-dialog';

const CREATED: AddAdminResult = {
  userId: 'uid-nova',
  email: 'nova@empresa.com',
  outcome: 'created',
  inviteEmailSent: true,
};

describe('AddAdminDialog (Spec 021)', () => {
  let fixture: ComponentFixture<AddAdminDialog>;
  let addAdmin: jasmine.Spy;

  async function build() {
    addAdmin = jasmine.createSpy('addAdmin').and.returnValue(of(CREATED));

    await TestBed.configureTestingModule({
      imports: [AddAdminDialog],
      providers: [{ provide: AdminUsersService, useValue: { addAdmin } }],
    }).compileComponents();

    fixture = TestBed.createComponent(AddAdminDialog);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function type(value: string) {
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit() {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(build);

  it('foca o campo de e-mail ao abrir', () => {
    expect(document.activeElement).toBe(el().querySelector('input'));
  });

  it('nao chama a API com o campo vazio e liga o erro ao campo', () => {
    submit();

    const input = el().querySelector('input') as HTMLInputElement;
    const describedBy = input.getAttribute('aria-describedby');

    expect(addAdmin).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(el().querySelector(`#${describedBy}`)?.textContent).toContain('Informe o e-mail.');
  });

  it('nao chama a API com e-mail invalido', () => {
    type('nao-e-email');
    submit();

    expect(addAdmin).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Informe um e-mail válido.');
  });

  it('envia o e-mail sem espacos e emite o resultado para a tela recarregar', () => {
    const emitted: AddAdminResult[] = [];
    fixture.componentInstance.added.subscribe(result => emitted.push(result));

    type('  nova@empresa.com ');
    submit();

    expect(addAdmin).toHaveBeenCalledWith('nova@empresa.com');
    expect(emitted).toEqual([CREATED]);
  });

  const outcomes: [AddAdminResult, string][] = [
    [CREATED, 'Enviamos um e-mail para a pessoa definir a senha'],
    [{ ...CREATED, outcome: 'promoted', inviteEmailSent: false }, 'sair e entrar de novo'],
    [{ ...CREATED, outcome: 'already-admin', inviteEmailSent: false }, 'já era administradora'],
    [{ ...CREATED, inviteEmailSent: false }, 'Esqueci minha senha'],
  ];

  outcomes.forEach(([result, text]) => {
    it(`exibe a mensagem de ${result.outcome}${result.inviteEmailSent ? '' : ' sem convite'}`, () => {
      addAdmin.and.returnValue(of(result));

      type('nova@empresa.com');
      submit();

      const status = el().querySelector('[role="status"]');
      expect(status?.textContent).toContain(text);
    });
  });

  it('mostra o 409 sem fechar o modal nem perder o e-mail digitado', () => {
    addAdmin.and.returnValue(throwError(() => 'Esta conta está bloqueada.'));

    type('bloq@empresa.com');
    submit();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Esta conta está bloqueada.');
    expect((el().querySelector('input') as HTMLInputElement).value).toBe('bloq@empresa.com');
    expect(el().querySelector('form')).not.toBeNull();
  });

  it('ignora o segundo envio enquanto o primeiro esta em voo', () => {
    addAdmin.and.returnValue(new Subject<AddAdminResult>());

    type('nova@empresa.com');
    submit();
    submit();

    expect(addAdmin).toHaveBeenCalledTimes(1);
  });

  it('"Adicionar outro" volta ao formulario vazio', () => {
    type('nova@empresa.com');
    submit();

    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(el().querySelector('form')).not.toBeNull();
    expect((el().querySelector('input') as HTMLInputElement).value).toBe('');
  });
});
