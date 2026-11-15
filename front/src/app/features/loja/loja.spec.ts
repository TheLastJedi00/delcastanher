import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { StoreModuleItem, StoreOffer, StoreService } from '../../core/services/store.service';
import { Loja } from './loja';

function module(order: number, priceCents = 19700): StoreModuleItem {
  return {
    id: `mod-${order}`,
    order,
    title: `Módulo ${order}`,
    summary: 'Resumo.',
    lessonCount: 1,
    priceCents,
    listPriceCents: priceCents,
    purchasable: true,
    access: { unlocked: false, expiresAt: null },
  };
}

const CATALOG = [module(1), module(2), module(3, 29700), module(4), module(5), module(6)];

/** Preco unico da Spec 027. */
const OFFER: StoreOffer = {
  modules: [],
  promotion: null,
  bundle: {
    slug: 'imersao-rh-lancamento',
    title: 'Imersão RH Estratégico — Pacote completo',
    modules: [],
    modulesTotalCents: 256400,
    tier: { id: 't4', order: 4, name: 'Preço único', priceCents: 98900, listPriceCents: 98900, capacity: null, remaining: null },
    nextTier: null,
  },
};

/** Harness da loja aberta no teste corrente. */
let current: RouterTestingHarness;

/** Abre a loja pela URL e responde catalogo, oferta e perfil. */
async function open(url = '/loja', data: { catalog?: StoreModuleItem[]; offer?: StoreOffer } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'loja', component: Loja }]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });

  const harness = await RouterTestingHarness.create();
  current = harness;
  await harness.navigateByUrl(url);

  const http = TestBed.inject(HttpTestingController);
  http.expectOne(req => req.url.endsWith('/store/catalog')).flush(data.catalog ?? CATALOG);
  http.expectOne(req => req.url.endsWith('/store/offer')).flush(data.offer ?? OFFER);
  http.match(req => req.url.endsWith('/users/me')).forEach(req => req.flush(null));

  await harness.fixture.whenStable();
  harness.detectChanges();

  const element = harness.routeNativeElement as HTMLElement;

  return { harness, element, store: TestBed.inject(StoreService) };
}

/**
 * Clica e roda a deteccao de mudancas, como o navegador faz a cada evento: sem
 * isso, dois cliques seguidos pulariam o estado intermediario da tela.
 */
function check(element: HTMLElement, id: string): void {
  (element.querySelector(`#${id}`) as HTMLInputElement).click();
  current.detectChanges();
}

/** Spec 019, decisoes 11 e 12; Spec 027, decisao 6. */
describe('Loja', () => {
  it('mostra o pacote no topo, com a ancora e o preco, sem lote nem vagas', async () => {
    const { element } = await open();
    // O real formatado usa espaco nao separavel depois do R$.
    const text = (element.textContent ?? '').replace(/ /g, ' ');

    expect(element.querySelector('#pacote')).not.toBeNull();
    expect(text).toContain('Pacote completo');
    expect(text).toContain('R$ 2.564,00');
    expect(text).toContain('R$ 989,00');
    for (const word of ['Lote', 'Preço único', 'Restam', 'vaga']) {
      expect(text).withContext(word).not.toContain(word);
    }
  });

  it('pacote e avulsos sao exclusivos', async () => {
    const { element, store, harness } = await open();

    check(element, 'mod-mod-1');
    check(element, 'pacote');
    harness.detectChanges();

    expect(store.selection()).toEqual({ kind: 'bundle', slug: 'imersao-rh-lancamento' });
    expect((element.querySelector('#mod-mod-1') as HTMLInputElement).checked).withContext('mod-1').toBeFalse();

    check(element, 'mod-mod-2');
    harness.detectChanges();

    expect(store.selection()).toEqual({ kind: 'modules', ids: ['mod-2'] });
    expect((element.querySelector('#pacote') as HTMLInputElement).checked).withContext('pacote').toBeFalse();
  });

  it('?pacote= pre-marca o pacote e sai da URL', async () => {
    const { store } = await open('/loja?pacote=imersao-rh-lancamento');

    expect(store.isBundleSelected('imersao-rh-lancamento')).toBeTrue();
    expect(TestBed.inject(Router).url).toBe('/loja');
  });

  it('?modulo= pre-marca o modulo daquela ordem', async () => {
    const { store } = await open('/loja?modulo=3');

    expect(store.selectedIds()).toEqual(['mod-3']);
    expect(TestBed.inject(Router).url).toBe('/loja');
  });

  it('quando os avulsos passam do preco do pacote, oferece a troca', async () => {
    const { element, store, harness } = await open();

    // R$ 888 em quatro modulos: ainda abaixo dos R$ 989 do pacote.
    for (const id of ['mod-mod-1', 'mod-mod-2', 'mod-mod-3', 'mod-mod-4']) {
      check(element, id);
    }
    harness.detectChanges();
    expect(element.textContent).not.toContain('Trocar pelo pacote');

    // R$ 1.085 com o quinto.
    check(element, 'mod-mod-5');
    harness.detectChanges();
    expect((element.textContent ?? '').replace(/\s+/g, ' ')).toContain(
      'O pacote com os 12 módulos sai por R$ 989,00.',
    );

    const button = [...element.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Trocar pelo pacote'),
    ) as HTMLButtonElement;
    button.click();
    harness.detectChanges();

    expect(store.selection().kind).toBe('bundle');
  });

  /** Spec 032, decisao 8: o preco riscado na loja. */
  describe('com campanha de desconto', () => {
    const BLACK_FRIDAY = {
      name: 'Black Friday',
      percentOff: 30,
      endsAt: '2026-12-01T02:59:00.000Z',
      serverNow: '2026-11-28T12:00:00.000Z',
    };
    const OFFER_BF: StoreOffer = {
      ...OFFER,
      promotion: BLACK_FRIDAY,
      bundle: {
        ...(OFFER.bundle as NonNullable<StoreOffer['bundle']>),
        tier: { id: 't4', order: 4, name: 'Preço único', priceCents: 69230, listPriceCents: 98900, capacity: null, remaining: null },
      },
    };
    const CATALOG_BF = CATALOG.map(item => ({
      ...item,
      priceCents: Math.round(((item.listPriceCents as number) * 70) / 100),
    }));
    const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ').replace(/ /g, ' ');

    it('pacote com o cheio riscado no lugar da ancora, e o prazo', async () => {
      const { element } = await open('/loja', { catalog: CATALOG_BF, offer: OFFER_BF });

      expect(text(element)).not.toContain('Valor dos módulos separadamente');
      expect(text(element)).toContain('R$ 692,30');
      expect(text(element)).toContain('Oferta válida até 30/11 às 23h59');
    });

    it('cada modulo avulso mostra o cheio riscado e o novo', async () => {
      const { element } = await open('/loja', { catalog: CATALOG_BF, offer: OFFER_BF });
      const card = element.querySelector('#mod-mod-1')?.closest('ui-card') as HTMLElement;

      expect(card.querySelector('s')?.textContent?.replace(/ /g, ' ')).toBe('R$ 197,00');
      expect(text(card)).toContain('R$ 137,90');
    });

    it('o total do resumo vem riscado com o cheio', async () => {
      const { element } = await open('/loja', { catalog: CATALOG_BF, offer: OFFER_BF });

      check(element, 'mod-mod-1');
      check(element, 'mod-mod-2');
      const total = element.querySelector('[data-testid="total-resumo"]') as HTMLElement;

      expect(total.querySelector('s')?.textContent?.replace(/ /g, ' ')).toBe('R$ 394,00');
      expect(text(total)).toContain('R$ 275,80');
    });
  });
});
