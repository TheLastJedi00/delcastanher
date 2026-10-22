import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Pedido } from './pedido';

function render(order: Record<string, unknown>): HTMLElement {
  TestBed.configureTestingModule({
    imports: [Pedido],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ orderId: 'ord-1' }) } } },
    ],
  });

  const fixture = TestBed.createComponent(Pedido);
  fixture.detectChanges();
  TestBed.inject(HttpTestingController)
    .expectOne(req => req.url.endsWith('/orders/ord-1'))
    .flush({
      id: 'ord-1',
      amountCents: 19700,
      installments: 1,
      items: [],
      pix: null,
      expiresAt: null,
      paidAt: null,
      message: null,
      mpOrderId: 'ORD-1',
      mpPaymentId: null,
      bundle: null,
      ...order,
    });
  fixture.detectChanges();

  return fixture.nativeElement as HTMLElement;
}

describe('Pedido', () => {
  // Spec 028, decisao 11: o cartao em analise caia em "Pague com PIX".
  it('cartão pendente diz que o pagamento está em análise, sem o texto do PIX', () => {
    const el = render({ status: 'PENDING', method: 'CREDIT_CARD' });

    expect(el.textContent).toContain('Pagamento em análise');
    expect(el.querySelector('[data-testid="cartao-em-analise"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Pague com PIX');
  });

  it('PIX pendente continua pedindo o pagamento pelo PIX', () => {
    const el = render({ status: 'PENDING', method: 'PIX' });

    expect(el.textContent).toContain('Pague com PIX para liberar');
  });

  // Spec 028, decisao 5: a compra que falhou por erro nao e "pedido encerrado".
  it('pedido FAILED mostra a mensagem e que nada foi cobrado', () => {
    const el = render({
      status: 'FAILED',
      method: 'CREDIT_CARD',
      message: 'Não foi possível falar com o provedor de pagamento.',
    });

    expect(el.textContent).toContain('Pagamento não concluído');
    expect(el.textContent).toContain('Não foi possível falar com o provedor de pagamento.');
    expect(el.textContent).toContain('Nenhum valor foi cobrado.');
  });
});

/** Spec 030, decisao 8: o pedido aprovado do modulo de teste. */
describe('Pedido — modulo de teste', () => {
  it('diz que nenhum modulo foi liberado e como estornar', () => {
    const el = render({ status: 'PAID', method: 'CREDIT_CARD', testPayment: true, amountCents: 100 });

    expect(el.querySelector('[data-testid="teste-aprovado"]')?.textContent).toContain('Pagamento de teste aprovado');
    expect(el.textContent).toContain('Nenhum módulo foi liberado');
    expect(el.textContent).not.toContain('já estão liberados');
  });
});
