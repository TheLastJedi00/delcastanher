import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  CHECKOUT_OUTCOMES,
  CheckoutProduct,
  CheckoutScenario,
} from '../../core/mocks/checkout.mock';
import { PLACEHOLDER } from '../../core/mocks/placeholders';
import { CheckoutResult } from './checkout-result';

describe('CheckoutResult', () => {
  let fixture: ComponentFixture<CheckoutResult>;

  const product: CheckoutProduct = {
    slug: 'imersao-rh',
    name: 'Imersão RH Estratégico',
    summary: 'Método consultivo e aplicado.',
    price: PLACEHOLDER.price,
    priceNote: PLACEHOLDER.installments,
    kind: 'curso',
  };

  const el = () => fixture.nativeElement as HTMLElement;

  const render = (scenario: CheckoutScenario) => {
    fixture.componentRef.setInput('outcome', CHECKOUT_OUTCOMES[scenario]);
    fixture.componentRef.setInput('product', product);
    fixture.componentRef.setInput('methodLabel', 'PIX');
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckoutResult],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CheckoutResult);
  });

  it('exibe a mensagem e o código do cenário aprovado', () => {
    render('aprovado');

    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.aprovado.title);
    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.aprovado.message);
    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.aprovado.code);
  });

  it('mostra o pedido e o próximo passo quando aprovado', () => {
    render('aprovado');

    expect(el().querySelector('ui-order-summary')).not.toBeNull();
    expect(el().textContent).toContain('Imersão RH Estratégico');
    expect(el().textContent).toContain('PIX');
    expect(el().textContent).toContain('Próximo passo');
  });

  it('respeita o placeholder de preço na tela de aprovado', () => {
    render('aprovado');

    const pending = el().querySelector('ui-placeholder-text .border-dashed');

    expect(pending).not.toBeNull();
    expect(pending!.textContent).toContain(PLACEHOLDER.price);
  });

  it('leva para a definição de senha quando aprovado', () => {
    render('aprovado');

    const link = el().querySelector('a') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/checkout/imersao-rh/senha');
  });

  it('exibe a mensagem do cenário recusado com CTA de retorno', () => {
    render('recusado');

    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.recusado.title);
    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.recusado.message);
    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.recusado.recovery);
    expect(el().querySelector('button')).not.toBeNull();
  });

  it('exibe a mensagem do cenário de erro de comunicação com CTA de retorno', () => {
    render('erro');

    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.erro.title);
    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.erro.message);
    expect(el().textContent).toContain(CHECKOUT_OUTCOMES.erro.recovery);
  });

  it('não oferece caminho para a senha nos cenários de falha', () => {
    for (const scenario of ['recusado', 'erro'] as CheckoutScenario[]) {
      render(scenario);

      expect(el().querySelector('a')).withContext(scenario).toBeNull();
      expect(el().querySelector('ui-order-summary')).withContext(scenario).toBeNull();
    }
  });

  it('emite o pedido de nova tentativa no CTA de falha', () => {
    render('recusado');

    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);

    (el().querySelector('button') as HTMLButtonElement).click();

    expect(retried).toBe(1);
  });
});
