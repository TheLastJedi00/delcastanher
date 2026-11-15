import { TestBed } from '@angular/core/testing';
import { BundlePrice } from './bundle-price';

const TIER = { id: 't4', order: 4, name: 'Preço único', priceCents: 98900, listPriceCents: 98900, capacity: null, remaining: null };
const TIER_BF = { ...TIER, priceCents: 69230 };
const BLACK_FRIDAY = {
  name: 'Black Friday',
  percentOff: 30,
  endsAt: '2026-12-01T02:59:00.000Z',
  serverNow: '2026-11-28T12:00:00.000Z',
};

function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [BundlePrice] });

  const fixture = TestBed.createComponent(BundlePrice);

  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }

  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;

  return { el, text: () => (el.textContent ?? '').replace(/\s+/g, ' ').replace(/ /g, ' ') };
}

/** Spec 032, decisao 8: um riscado so no pacote. */
describe('BundlePrice', () => {
  it('sem campanha: ancora dos modulos riscada e o preco', () => {
    const { el, text } = render({ tier: TIER, anchorCents: 256400 });

    expect(text()).toContain('Valor dos módulos separadamente');
    expect(el.querySelectorAll('s')).toHaveSize(1);
    expect(el.querySelector('s')?.textContent?.replace(/ /g, ' ')).toBe('R$ 2.564,00');
    expect(text()).toContain('R$ 989,00');
  });

  it('em campanha: a ancora sai, e o riscado e o preco cheio do pacote, com o prazo', () => {
    const { el, text } = render({ tier: TIER_BF, anchorCents: 256400, promotion: BLACK_FRIDAY });

    expect(text()).not.toContain('Valor dos módulos separadamente');
    expect(el.querySelectorAll('s')).toHaveSize(1);
    expect(el.querySelector('s')?.textContent?.replace(/ /g, ' ')).toBe('R$ 989,00');
    expect(text()).toContain('R$ 692,30');
    expect(text()).toContain('−30%');
    expect(text()).toContain('Oferta válida até 30/11 às 23h59');
    expect(text()).toContain('em até 12x no cartão');
  });

  it('campanha anunciada mas lote sem desconto: mostra como sem campanha', () => {
    const { text } = render({ tier: TIER, anchorCents: 256400, promotion: BLACK_FRIDAY });

    expect(text()).toContain('Valor dos módulos separadamente');
    expect(text()).not.toContain('−30%');
  });
});
