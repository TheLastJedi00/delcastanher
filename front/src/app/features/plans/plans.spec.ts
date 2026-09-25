import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { LAUNCH_BUNDLE_COPY, PLANS_META } from '../../core/mocks/plans.mock';
import { SEO_DATA_KEY } from '../../core/services/seo-route';
import { SeoMetadata } from '../../core/services/seo.service';
import { StoreOffer } from '../../core/services/store.service';
import { Plans } from './plans';

const PRICES = [19700, 19700, 29700, 19700, 19700, 19700, 19700, 19700, 19700, 19700, 24700, 24700];
const MODULES = PRICES.map((priceCents, index) => ({
  order: index + 1,
  title: `Módulo ${index + 1}`,
  priceCents,
}));

function offer(tier: Partial<NonNullable<StoreOffer['bundle']>['tier']> = {}, next = true): StoreOffer {
  return {
    modules: MODULES,
    bundle: {
      slug: 'imersao-rh-lancamento',
      title: 'Pacote de Lançamento — Imersão RH Estratégico',
      modules: MODULES,
      modulesTotalCents: 256400,
      tier: { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20, remaining: 7, ...tier },
      nextTier: next ? { name: '2º Lote', priceCents: 79700 } : null,
    },
  };
}

/** Spec 019, decisoes 10 e 11. */
describe('Plans', () => {
  let fixture: ComponentFixture<Plans>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  // O real formatado usa espaco nao separavel depois do R$.
  const text = () => (el().textContent ?? '').replace(/ /g, ' ');
  const request = () => http.expectOne(req => req.url.endsWith('/store/offer'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Plans],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Plans);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function respond(body: StoreOffer): void {
    request().flush(body);
    fixture.detectChanges();
  }

  it('mostra o esqueleto no lugar do preço enquanto a oferta não chega', () => {
    expect(el().querySelector('ui-bundle-price [aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('R$ 590,00');
    // A faixa de escassez tem o lugar reservado: chegar depois nao empurra a pagina.
    expect(el().querySelector('[data-testid="faixa-carregando"]')).not.toBeNull();

    request().flush(offer());
  });

  it('mostra lote, preço, âncora, parcelamento e vagas depois da resposta', () => {
    respond(offer());

    expect(text()).toContain('🔥 Lote Fundador');
    expect(text()).toContain('R$ 590,00');
    expect(text()).toContain('R$ 2.564,00');
    expect(text()).toContain('em até 12x no cartão');
    expect(text()).toContain('Restam 7 vagas no 🔥 Lote Fundador');
    expect(text()).toContain('R$ 797,00 no 2º Lote');
    expect(el().querySelector('[data-testid="faixa-carregando"]')).toBeNull();
  });

  it('não promete o valor da parcela', () => {
    respond(offer());

    expect(text()).not.toContain('49,17');
  });

  it('sem faixa de escassez no Preço oficial, que não tem limite', () => {
    respond(offer({ id: 't4', order: 4, name: 'Preço oficial', priceCents: 149700, capacity: null, remaining: null }, false));

    expect(text()).toContain('💎 Preço oficial');
    expect(el().querySelector('ui-scarcity-banner')).toBeNull();
  });

  it('em erro, mantém a oferta e manda consultar o valor na loja', () => {
    request().flush({ message: 'erro' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).toContain('Consulte o valor na loja');
    expect(text()).toContain(LAUNCH_BUNDLE_COPY.benefits[0]);
    expect(el().querySelector('#pacote a[href^="/loja"]')).not.toBeNull();
  });

  it('lista os 12 módulos avulsos com o preço de cada um', () => {
    respond(offer());

    const rows = el().querySelectorAll('#modulos li');

    expect(rows.length).toBe(12);
    expect(rows[2].textContent?.replace(/ /g, ' ')).toContain('R$ 297,00');
  });

  it('leva o pacote e cada módulo à loja com a seleção pronta', () => {
    respond(offer());

    expect(el().querySelector('#pacote a[href="/loja?pacote=imersao-rh-lancamento"]')).not.toBeNull();
    expect(el().querySelector('#modulos a[href="/loja?modulo=3"]')).not.toBeNull();
  });

  it('mantém o card Empresas, sob consulta', () => {
    respond(offer());

    expect(el().querySelector('#empresas')?.textContent).toContain('Sob consulta');
  });

  it('não tem mais preço em placeholder nem os planos de protótipo', () => {
    respond(offer());

    expect(text()).not.toContain('[PREÇO]');
    expect(el().querySelector('ui-placeholder-text .border-dashed')).toBeNull();
    for (const name of ['Mini Curso', 'Curso Individual', 'Formação Completa']) {
      expect(text()).withContext(name).not.toContain(name);
    }
  });

  it('fecha a página com o rodapé', () => {
    respond(offer());

    expect(el().querySelector('ui-footer')).not.toBeNull();
  });

  it('declara title e description da rota para as campanhas', () => {
    request().flush(offer());

    const plansRoute = routes.find(route => route.path === 'planos');
    const seo = plansRoute?.data?.[SEO_DATA_KEY] as SeoMetadata;

    expect(seo.title).toBe(PLANS_META.title);
    expect(seo.description).toBe(PLANS_META.description);
  });
});
