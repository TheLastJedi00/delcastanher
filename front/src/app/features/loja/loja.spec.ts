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
    purchasable: true,
    access: { unlocked: false, expiresAt: null },
  };
}

const CATALOG = [module(1), module(2), module(3, 29700), module(4), module(5), module(6)];

/** Preco unico da Spec 027. */
const OFFER: StoreOffer = {
  modules: [],
  bundle: {
    slug: 'imersao-rh-lancamento',
    title: 'Imersão RH Estratégico — Pacote completo',
    modules: [],
    modulesTotalCents: 256400,
    tier: { id: 't4', order: 4, name: 'Preço único', priceCents: 98900, capacity: null, remaining: null },
    nextTier: null,
  },
};

/** Harness da loja aberta no teste corrente. */
let current: RouterTestingHarness;

/** Abre a loja pela URL e responde catalogo, oferta e perfil. */
async function open(url = '/loja') {
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
  http.expectOne(req => req.url.endsWith('/store/catalog')).flush(CATALOG);
  http.expectOne(req => req.url.endsWith('/store/offer')).flush(OFFER);
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
});
