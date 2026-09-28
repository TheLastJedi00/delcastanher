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

const CATALOG = [module(1), module(2), module(3, 29700), module(4)];

const OFFER: StoreOffer = {
  modules: [],
  bundle: {
    slug: 'imersao-rh-lancamento',
    title: 'Pacote de Lançamento — Imersão RH Estratégico',
    modules: [],
    modulesTotalCents: 256400,
    tier: { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20, remaining: 7 },
    nextTier: { name: '2º Lote', priceCents: 79700 },
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

/** Spec 019, decisoes 11 e 12. */
describe('Loja', () => {
  it('mostra o pacote no topo, com o lote, a ancora e as vagas', async () => {
    const { element } = await open();
    // O real formatado usa espaco nao separavel depois do R$.
    const text = (element.textContent ?? '').replace(/ /g, ' ');

    expect(element.querySelector('#pacote')).not.toBeNull();
    expect(text).toContain('🔥 Lote Fundador');
    expect(text).toContain('R$ 2.564,00');
    expect(text).toContain('R$ 590,00');
    expect(text).toContain('Restam 7 vagas neste lote');
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

  it('no terceiro avulso acima do Fundador, oferece a troca pelo pacote', async () => {
    const { element, store, harness } = await open();

    check(element, 'mod-mod-1');
    check(element, 'mod-mod-2');
    harness.detectChanges();
    expect(element.textContent).not.toContain('Trocar pelo pacote');

    check(element, 'mod-mod-4');
    harness.detectChanges();
    expect(element.textContent).toContain('O pacote com os 12 módulos sai por');

    const button = [...element.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Trocar pelo pacote'),
    ) as HTMLButtonElement;
    button.click();
    harness.detectChanges();

    expect(store.selection().kind).toBe('bundle');
  });
});
