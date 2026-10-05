import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { FinanceOrderStatus } from '../../../core/services/admin-finance.service';
import { ConfirmacaoCompra } from './confirmacao-compra';

const URL = `${environment.apiUrl}/admin/orders/ord-1/confirmation-email`;

/** E-mail "Compra confirmada" no financeiro (Spec 024, Task 3.4). */
describe('ConfirmacaoCompra', () => {
  let fixture: ComponentFixture<ConfirmacaoCompra>;
  let backend: HttpTestingController;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement | null;

  function render(status: FinanceOrderStatus, emailedAt: string | null): void {
    TestBed.configureTestingModule({
      imports: [ConfirmacaoCompra],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ConfirmacaoCompra);
    backend = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('orderId', 'ord-1');
    fixture.componentRef.setInput('orderStatus', status);
    fixture.componentRef.setInput('emailedAt', emailedAt);
    fixture.detectChanges();
  }

  afterEach(() => backend.verify());

  it('pedido pago com e-mail: mostra quando saiu, no fuso de Sao Paulo', () => {
    render('PAID', '2026-10-05T15:30:00.000Z');

    expect(text()).toContain('Enviado em 05/10, 12:30');
    expect(button()?.textContent).toContain('Reenviar confirmação');
  });

  it('pedido pago sem e-mail: destaca e oferece o envio', () => {
    render('PAID', null);

    expect(text()).toContain('Não enviado');
    expect(button()?.textContent).toContain('Enviar confirmação');
  });

  it('pedido nao pago nao tem confirmacao nem botao', () => {
    render('PENDING', null);

    expect(text()).not.toContain('Não enviado');
    expect(button()).toBeNull();
  });

  it('reenvia e passa a mostrar a nova data', () => {
    render('PAID', null);

    button()!.click();
    const request = backend.expectOne(URL);
    expect(request.request.method).toBe('POST');

    request.flush({ confirmationEmailedAt: '2026-10-05T16:00:00.000Z' });
    fixture.detectChanges();

    expect(text()).toContain('Enviado em 05/10, 13:00');
    expect(text()).toContain('Confirmação enviada.');
  });

  it('mostra a recusa da API, como a chave do Resend ausente', () => {
    render('PAID', null);

    button()!.click();
    backend
      .expectOne(URL)
      .flush(
        { message: 'Não foi possível enviar o e-mail: RESEND_API_KEY nao configurada.' },
        { status: 502, statusText: 'Bad Gateway' },
      );
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(
      'RESEND_API_KEY',
    );
    expect(text()).toContain('Não enviado');
  });
});
