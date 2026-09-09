import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PAYMENT_METHODS, PaymentMethodSelector } from './payment-method-selector';

describe('PaymentMethodSelector', () => {
  let fixture: ComponentFixture<PaymentMethodSelector>;

  const el = () => fixture.nativeElement as HTMLElement;
  const radios = () => Array.from(el().querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
  const checked = () => radios().find(radio => radio.getAttribute('aria-checked') === 'true');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentMethodSelector],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();
  });

  it('expõe as opções como um grupo de radio acessível', () => {
    const group = el().querySelector('[role="radiogroup"]')!;

    expect(group.getAttribute('aria-label')).toBe('Forma de pagamento');
    expect(radios().length).toBe(PAYMENT_METHODS.length);
  });

  it('oferece PIX e cartão de crédito', () => {
    expect(el().textContent).toContain('PIX');
    expect(el().textContent).toContain('Cartão de crédito');
  });

  it('começa com PIX selecionado', () => {
    expect(fixture.componentInstance.value()).toBe('pix');
    expect(checked()!.textContent).toContain('PIX');
  });

  it('troca o método ativo no clique, mantendo só um marcado', () => {
    radios()[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('cartao');
    expect(checked()!.textContent).toContain('Cartão de crédito');
    expect(radios().filter(radio => radio.getAttribute('aria-checked') === 'true').length).toBe(1);
  });

  it('mantém apenas a opção ativa na ordem de tabulação', () => {
    expect(radios().map(radio => radio.getAttribute('tabindex'))).toEqual(['0', '-1']);

    radios()[1].click();
    fixture.detectChanges();

    expect(radios().map(radio => radio.getAttribute('tabindex'))).toEqual(['-1', '0']);
  });

  it('reflete o método definido de fora', () => {
    fixture.componentRef.setInput('value', 'cartao');
    fixture.detectChanges();

    expect(checked()!.textContent).toContain('Cartão de crédito');
  });
});
