import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { PaymentLogLine } from '../../../core/services/admin-finance.service';
import { LogsPagamento } from './logs-pagamento';

const ROUTE = `${environment.apiUrl}/admin/finance/orders/ord-1/logs`;

const LINES: PaymentLogLine[] = [
  {
    id: 'log-1',
    createdAt: '2026-10-21T22:37:39.000Z',
    source: 'FRONT',
    stage: 'payment_method',
    level: 'WARNING',
    httpStatus: null,
    mpOrderId: null,
    mpStatus: null,
    mpStatusDetail: null,
    message: 'O Mercado Pago não reconheceu a bandeira do cartão.',
    detail: { bin: '450629' },
    environment: 'production',
  },
  {
    id: 'log-2',
    createdAt: '2026-10-21T22:37:41.000Z',
    source: 'API',
    stage: 'create_order',
    level: 'ERROR',
    httpStatus: 500,
    mpOrderId: null,
    mpStatus: null,
    mpStatusDetail: null,
    message: 'Mercado Pago respondeu 500 em create_order.',
    detail: { errors: [{ code: 'internal_error' }] },
    environment: 'sandbox',
  },
];

function render() {
  TestBed.configureTestingModule({
    imports: [LogsPagamento],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  const fixture = TestBed.createComponent(LogsPagamento);

  fixture.componentRef.setInput('orderId', 'ord-1');
  fixture.detectChanges();

  return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
}

/** Spec 028, decisao 8. */
describe('LogsPagamento', () => {
  it('mostra a linha do tempo, do navegador e do servidor, com etapa, nível e HTTP', () => {
    const { fixture, http, el } = render();

    http.expectOne(ROUTE).flush(LINES);
    fixture.detectChanges();

    const items = el.querySelectorAll('[data-testid="logs-linha-do-tempo"] li');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ');

    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Navegador');
    expect(items[0].textContent).toContain('Bandeira do cartão');
    expect(items[0].textContent).toContain('Aviso');
    expect(items[1].textContent).toContain('Servidor');
    expect(items[1].textContent).toContain('HTTP 500');
    expect(items[1].textContent).toContain('teste');
    expect(text).toContain('Logs do pagamento');
    expect(el.querySelector('details pre')?.textContent).toContain('450629');
  });

  it('diz quando o pedido não tem log', () => {
    const { fixture, http, el } = render();

    http.expectOne(ROUTE).flush([]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="logs-vazio"]')?.textContent).toContain(
      'Nenhum log registrado para este pedido.',
    );
  });

  it('mostra o erro quando a leitura falha', () => {
    const { fixture, http, el } = render();

    http.expectOne(ROUTE).flush({ message: 'Pedido não encontrado.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Pedido não encontrado.');
  });

  it('fecha pelo botão do modal', () => {
    const { fixture, http, el } = render();
    let closed = false;

    fixture.componentInstance.closed.subscribe(() => (closed = true));
    http.expectOne(ROUTE).flush([]);
    (el.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click();

    expect(closed).toBeTrue();
  });
});
