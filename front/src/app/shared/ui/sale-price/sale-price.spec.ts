import { TestBed } from '@angular/core/testing';
import { SalePrice } from './sale-price';

function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [SalePrice] });

  const fixture = TestBed.createComponent(SalePrice);

  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }

  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const text = () => (el.textContent ?? '').replace(/\s+/g, ' ').replace(/ /g, ' ');

  return { el, text };
}

/** Spec 032, decisao 8. */
describe('SalePrice', () => {
  const CAMPANHA = {
    priceCents: 69230,
    listPriceCents: 98900,
    percentOff: 30,
    endsAt: '2026-12-01T02:59:00.000Z',
  };

  it('em campanha: cheio riscado, novo, selo e prazo em Brasilia', () => {
    const { el, text } = render(CAMPANHA);

    expect(el.querySelector('s')?.textContent?.replace(/ /g, ' ')).toBe('R$ 989,00');
    expect(text()).toContain('R$ 692,30');
    expect(text()).toContain('−30%');
    expect(text()).toContain('Oferta válida até 30/11 às 23h59');
  });

  it('o leitor de tela recebe a frase completa, e a parte visual fica escondida dele', () => {
    const { el } = render(CAMPANHA);

    expect(el.querySelector('.sr-only')?.textContent?.replace(/\s+/g, ' ').replace(/ /g, ' ')).toContain(
      'Preço anterior: R$ 989,00. Preço com desconto: R$ 692,30, 30% de desconto.',
    );
    expect(el.querySelector('[data-testid="preco-promocional"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sem prazo, nao inventa data', () => {
    const { text } = render({ ...CAMPANHA, endsAt: null });

    expect(text()).not.toContain('Oferta válida');
  });

  it('sem campanha, ou com o cheio igual ao cobrado, so o preco', () => {
    for (const inputs of [
      { priceCents: 98900, listPriceCents: 98900, percentOff: null },
      { priceCents: 98900, listPriceCents: 98900, percentOff: 30 },
      { priceCents: 98900 },
    ]) {
      TestBed.resetTestingModule();
      const { el, text } = render(inputs);

      expect(el.querySelector('s')).toBeNull();
      expect(text()).toContain('R$ 989,00');
      expect(text()).not.toContain('%');
    }
  });

  it('modulo sem preco continua "A definir", sem risco', () => {
    const { el, text } = render({ priceCents: null, listPriceCents: null, percentOff: 30 });

    expect(el.querySelector('s')).toBeNull();
    expect(text()).toContain('A definir');
  });
});
