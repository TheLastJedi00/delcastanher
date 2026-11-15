import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConsentService } from '../../../core/services/consent.service';
import { StoreService } from '../../../core/services/store.service';
import { PromoCard } from './promo-card';

const HOUR = 60 * 60 * 1000;

function promotion(msLeft: number) {
  const now = Date.now();

  return {
    name: 'Black Friday',
    percentOff: 30,
    endsAt: new Date(now + msLeft).toISOString(),
    serverNow: new Date(now).toISOString(),
  };
}

function setup(banner = signal(false)) {
  TestBed.configureTestingModule({
    imports: [PromoCard],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      // Banner de cookies ja decidido: o flutuante nao espera por ele.
      { provide: ConsentService, useValue: { bannerVisible: banner } },
    ],
  });

  const store = TestBed.inject(StoreService);
  const http = TestBed.inject(HttpTestingController);

  const offer = (promo: ReturnType<typeof promotion> | null) => {
    store.loadOffer().subscribe();
    http.expectOne(req => req.url.endsWith('/store/offer')).flush({ modules: [], bundle: null, promotion: promo });
  };

  const create = (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(PromoCard);

    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }

    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;

    return {
      fixture,
      el,
      text: () => (el.textContent ?? '').replace(/\s+/g, ' '),
    };
  };

  return { store, http, offer, create };
}

/** Spec 032, decisao 9. */
describe('PromoCard', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      // sem storage no navegador de teste
    }
  });

  it('em linha: porcentagem, prazo em Brasilia e contagem escondida do leitor de tela', fakeAsync(() => {
    const { offer, create } = setup();

    offer({ ...promotion(2 * 24 * HOUR + 3 * HOUR), endsAt: '2099-11-30T02:59:00.000Z' });
    const { el, text, fixture } = create();
    tick(0);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="promo-em-linha"]')).not.toBeNull();
    expect(text()).toContain('30%');
    expect(text()).toContain('Black Friday');
    expect(text()).toContain('até 29/11 às 23h59');
    expect(el.querySelector('.sr-only')?.textContent).toContain(
      'Oferta de Black Friday: 30% de desconto em toda a loja até 29/11 às 23h59.',
    );

    const contagem = el.querySelector('[data-testid="contagem"]') as HTMLElement;

    expect(contagem).not.toBeNull();
    expect(contagem.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(el.querySelector('[aria-live]')).toBeNull();

    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('a contagem mostra dias, horas, minutos e segundos, e anda', fakeAsync(() => {
    const { offer, create } = setup();

    offer(promotion(2 * 24 * HOUR + 3 * HOUR + 4 * 60 * 1000 + 5500));
    const { el, fixture } = create();
    tick(0);
    fixture.detectChanges();

    const blocks = () =>
      Array.from(el.querySelectorAll('[data-testid="contagem"] > div')).map(node =>
        (node.textContent ?? '').replace(/\s+/g, ''),
      );

    expect(blocks()).toEqual(['02dias', '03h', '04min', '05s']);

    tick(1000);
    fixture.detectChanges();
    expect(blocks()[3]).toBe('04s');

    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('na ultima hora, muda de cor e avisa', fakeAsync(() => {
    const { offer, create } = setup();

    offer(promotion(30 * 60 * 1000));
    const { el, text, fixture } = create();
    tick(0);
    fixture.detectChanges();

    expect(text()).toContain('Acaba em menos de 1 hora');
    expect(el.querySelector('[data-testid="promo-em-linha"]')?.classList).toContain('promo--urgent');

    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('no fim da contagem, o card some', fakeAsync(() => {
    const { offer, create, http } = setup();

    offer(promotion(2500));
    const { el, fixture } = create();
    tick(0);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="promo-em-linha"]')).not.toBeNull();

    tick(3000);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="promo-em-linha"]')).toBeNull();

    // O StoreService rele a oferta no fim (Spec 032, task 3.6).
    tick(1000);
    http.match(req => req.url.endsWith('/store/offer')).forEach(req => req.flush({ modules: [], bundle: null, promotion: null }));
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('sem campanha, nao renderiza nada', fakeAsync(() => {
    const { offer, create } = setup();

    offer(null);
    const { el, fixture } = create({ variant: 'floating', delayMs: 0 });
    tick(10);
    fixture.detectChanges();

    expect(el.children.length).toBe(0);

    fixture.destroy();
    discardPeriodicTasks();
  }));

  describe('flutuante', () => {
    it('entra depois da espera; o x minimiza para o selo, que reabre o card', fakeAsync(() => {
      const { offer, create } = setup();

      offer(promotion(2 * 24 * HOUR));
      const { el, fixture } = create({ variant: 'floating' });
      const card = () => el.querySelector('[data-testid="promo-flutuante"]') as HTMLElement | null;
      const selo = () => el.querySelector('[data-testid="promo-minimizada"]') as HTMLButtonElement | null;
      tick(0);
      fixture.detectChanges();
      expect(card()).toBeNull();

      tick(2500);
      fixture.detectChanges();
      expect(card()?.className).toContain('animate-promo-bounce-in');
      expect(card()?.className).toContain('motion-reduce:animate-fade-in');

      (el.querySelector('[data-testid="fechar-promo"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      tick(0);

      expect(card()).toBeNull();
      expect(selo()).not.toBeNull();
      expect(selo()?.textContent?.replace(/\s+/g, '')).toContain('30%off');
      expect(selo()?.getAttribute('aria-label')).toContain('Abrir a oferta.');
      expect(selo()?.querySelector('.motion-safe\\:animate-promo-wiggle')).not.toBeNull();
      expect(document.activeElement).toBe(selo());

      selo()?.click();
      fixture.detectChanges();
      expect(card()).not.toBeNull();
      expect(selo()).toBeNull();

      fixture.destroy();
      discardPeriodicTasks();
    }));

    it('minimizado vale para a proxima pagina da sessao', fakeAsync(() => {
      const { offer, create } = setup();

      offer(promotion(2 * 24 * HOUR));
      const first = create({ variant: 'floating' });
      tick(2500);
      first.fixture.detectChanges();
      (first.el.querySelector('[data-testid="fechar-promo"]') as HTMLButtonElement).click();
      first.fixture.detectChanges();
      tick(0);
      first.fixture.destroy();

      const second = create({ variant: 'floating' });
      tick(2500);
      second.fixture.detectChanges();
      expect(second.el.querySelector('[data-testid="promo-flutuante"]')).toBeNull();
      expect(second.el.querySelector('[data-testid="promo-minimizada"]')).not.toBeNull();

      second.fixture.destroy();
      discardPeriodicTasks();
    }));

    it('espera o banner de cookies fechar, que ocupa o mesmo rodape', fakeAsync(() => {
      const banner = signal(true);
      const { offer, create } = setup(banner);
      offer(promotion(2 * 24 * HOUR));
      const { el, fixture } = create({ variant: 'floating' });
      tick(2500);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="promo-flutuante"]')).toBeNull();

      banner.set(false);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="promo-flutuante"]')).not.toBeNull();

      fixture.destroy();
      discardPeriodicTasks();
    }));

    it('com load, carrega a oferta sozinho e aparece quando ela chega, mesmo depois da espera', fakeAsync(() => {
      const { create, http } = setup();

      const { el, fixture } = create({ variant: 'floating', load: true, delayMs: 100 });
      tick(200);
      http.expectOne(req => req.url.endsWith('/store/offer')).flush({
        modules: [],
        bundle: null,
        promotion: promotion(2 * 24 * HOUR),
      });
      tick(0);
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="promo-flutuante"]')).not.toBeNull();

      fixture.destroy();
      discardPeriodicTasks();
    }));
  });
});
