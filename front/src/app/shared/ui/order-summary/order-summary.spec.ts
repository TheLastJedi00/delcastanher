import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PLACEHOLDER } from '../../../core/mocks/placeholders';
import { OrderSummary } from './order-summary';

describe('OrderSummary', () => {
  let fixture: ComponentFixture<OrderSummary>;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderSummary],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderSummary);
    fixture.componentRef.setInput('name', 'Imersão RH Estratégico');
    fixture.componentRef.setInput('summary', 'Método consultivo e aplicado.');
    fixture.componentRef.setInput('price', 'R$ 1.200');
    fixture.detectChanges();
  });

  it('renderiza nome, resumo e preço do produto', () => {
    expect(el().textContent).toContain('Imersão RH Estratégico');
    expect(el().textContent).toContain('Método consultivo e aplicado.');
    expect(el().textContent).toContain('R$ 1.200');
  });

  it('exibe preço definido sem tratamento de pendente', () => {
    expect(el().querySelector('ui-placeholder-text .border-dashed')).toBeNull();
  });

  it('dá tratamento de pendente ao preço em placeholder, sem exibi-lo cru', () => {
    fixture.componentRef.setInput('price', PLACEHOLDER.price);
    fixture.detectChanges();

    const pending = el().querySelector('ui-placeholder-text .border-dashed');

    expect(pending).not.toBeNull();
    expect(pending!.textContent).toContain(PLACEHOLDER.price);
  });

  it('dá o mesmo tratamento à nota de preço em placeholder', () => {
    fixture.componentRef.setInput('priceNote', PLACEHOLDER.installments);
    fixture.detectChanges();

    const pending = Array.from(el().querySelectorAll('ui-placeholder-text .border-dashed'));

    expect(pending.some(node => node.textContent?.includes(PLACEHOLDER.installments))).toBeTrue();
  });

  it('omite o método de pagamento enquanto ele não for escolhido', () => {
    expect(el().textContent).not.toContain('Forma de pagamento');

    fixture.componentRef.setInput('method', 'PIX');
    fixture.detectChanges();

    expect(el().textContent).toContain('Forma de pagamento');
    expect(el().textContent).toContain('PIX');
  });
});
