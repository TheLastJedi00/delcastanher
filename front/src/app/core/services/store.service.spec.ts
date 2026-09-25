import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { StoreModuleItem, StoreOffer, StoreService, formatPrice } from './store.service';

const CATALOG: StoreModuleItem[] = [
  {
    id: 'mod-1',
    order: 1,
    title: 'Fundamentos',
    summary: 'Base do RH estratégico',
    lessonCount: 4,
    priceCents: 19900,
    purchasable: true,
    access: { unlocked: false, expiresAt: null },
  },
  {
    id: 'mod-2',
    order: 2,
    title: 'Prática',
    summary: 'Casos reais',
    lessonCount: 5,
    priceCents: 24900,
    purchasable: true,
    access: { unlocked: false, expiresAt: null },
  },
  {
    id: 'mod-3',
    order: 3,
    title: 'Avançado',
    summary: 'Em preparação',
    lessonCount: 0,
    priceCents: null,
    purchasable: false,
    access: { unlocked: false, expiresAt: null },
  },
];

/** Oferta com o Pacote de Lancamento no Fundador (Spec 019). */
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

function loadOffer(service: StoreService, http: HttpTestingController, body = OFFER) {
  service.loadOffer().subscribe({ error: () => undefined });
  http.expectOne(req => req.url.endsWith('/store/offer')).flush(body);
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  const service = TestBed.inject(StoreService);
  const http = TestBed.inject(HttpTestingController);

  return { service, http };
}

function loadCatalog(service: StoreService, http: HttpTestingController, body = CATALOG) {
  service.loadCatalog().subscribe({ error: () => undefined });
  http.expectOne(req => req.url.endsWith('/store/catalog')).flush(body);
}

describe('StoreService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

  describe('carrinho', () => {
    it('soma o total dos modulos selecionados', () => {
      const { service, http } = setup();

      loadCatalog(service, http);
      service.toggle('mod-1');
      service.toggle('mod-2');

      expect(service.totalCents()).toBe(44800);
      expect(formatPrice(service.totalCents())).toContain('448,00');
    });

    it('lista a selecao na ordem da trilha, e nao na ordem do clique', () => {
      const { service, http } = setup();

      loadCatalog(service, http);
      service.toggle('mod-2');
      service.toggle('mod-1');

      expect(service.selectedIds()).toEqual(['mod-1', 'mod-2']);
    });

    // Comprar em outra aba, ou o admin tirar o preco, nao pode deixar um item
    // fantasma no carrinho — ele so apareceria de novo no 400 do servidor.
    it('descarta do carrinho o modulo que deixou de ser vendavel', () => {
      const { service, http } = setup();

      loadCatalog(service, http);
      service.toggle('mod-1');

      loadCatalog(service, http, [
        { ...CATALOG[0], purchasable: false, access: { unlocked: true, expiresAt: '2027-03-17' } },
        CATALOG[1],
        CATALOG[2],
      ]);

      expect(service.selectedIds()).toEqual([]);
      expect(service.hasSelection()).toBe(false);
    });
  });

  describe('createOrder', () => {
    // Decisao 2: o valor e somado no servidor. Um preco no corpo seria o
    // comprador escolhendo quanto pagar.
    it('envia ids de modulo e nunca o preco', () => {
      const { service, http } = setup();

      loadCatalog(service, http);
      service.toggle('mod-1');

      service.createOrder({
        moduleIds: service.selectedIds(),
        method: 'PIX',
        payer: {
          firstName: 'Ana',
          lastName: 'Souza',
          email: 'ana@delcastanher.com',
          document: '19119119100',
        },
      }).subscribe({ error: () => undefined });

      const request = http.expectOne(req => req.url.endsWith('/orders'));
      const body = request.request.body as Record<string, unknown>;

      expect(body['moduleIds']).toEqual(['mod-1']);
      expect(JSON.stringify(body)).not.toContain('priceCents');
      expect(JSON.stringify(body)).not.toContain('amount');

      request.flush({ id: 'ord-1', status: 'PENDING', items: [] });
    });

    // Decisao 8: nenhum dado de cartao trafega. So o token e o que o SDK
    // resolveu junto com ele.
    it('nao carrega numero, validade nem CVV no pedido de cartao', () => {
      const { service, http } = setup();

      service.createOrder({
        moduleIds: ['mod-1'],
        method: 'CREDIT_CARD',
        payer: {
          firstName: 'Ana',
          lastName: 'Souza',
          email: 'ana@delcastanher.com',
          document: '19119119100',
        },
        card: { token: 'tok-123', paymentMethodId: 'master', installments: 3 },
      }).subscribe({ error: () => undefined });

      const request = http.expectOne(req => req.url.endsWith('/orders'));
      const serialized = JSON.stringify(request.request.body);

      expect(serialized).toContain('tok-123');
      expect(serialized).not.toMatch(/cardNumber|securityCode|cvv|expirationDate/i);

      request.flush({ id: 'ord-1', status: 'PAID', items: [] });
    });
  });

  /** Spec 019, decisoes 5 e 12. */
  describe('pacote', () => {
    it('marcar o pacote desmarca os modulos, e marcar um modulo desmarca o pacote', () => {
      const { service, http } = setup();

      loadCatalog(service, http);
      loadOffer(service, http);

      service.toggle('mod-1');
      service.selectBundle('imersao-rh-lancamento');

      expect(service.selectedIds()).toEqual([]);
      expect(service.selection()).toEqual({ kind: 'bundle', slug: 'imersao-rh-lancamento' });

      service.toggle('mod-2');

      expect(service.isBundleSelected('imersao-rh-lancamento')).toBeFalse();
      expect(service.selection()).toEqual({ kind: 'modules', ids: ['mod-2'] });
    });

    it('o total segue a selecao: o preco do lote vigente no pacote, a soma nos avulsos', () => {
      const { service, http } = setup();

      loadCatalog(service, http);
      loadOffer(service, http);

      service.selectBundle('imersao-rh-lancamento');
      expect(service.totalCents()).toBe(59000);

      service.toggle('mod-1');
      expect(service.totalCents()).toBe(19900);
    });

    it('o pedido de pacote leva o slug, e nunca preco, lote ou modulos', () => {
      const { service, http } = setup();

      loadOffer(service, http);
      service.selectBundle('imersao-rh-lancamento');

      service
        .createOrder({
          ...service.orderTarget(),
          method: 'PIX',
          payer: { firstName: 'Ana', lastName: 'Souza', email: 'a@b.com', document: '19119119100' },
        })
        .subscribe();

      const request = http.expectOne(req => req.url.endsWith('/orders'));

      expect(request.request.body.bundleSlug).toBe('imersao-rh-lancamento');
      expect(request.request.body.moduleIds).toBeUndefined();
      expect(JSON.stringify(request.request.body)).not.toMatch(/priceCents|amountCents|tier/);
      request.flush({});
    });

    it('o pedido de modulos leva so os ids', () => {
      const { service, http } = setup();

      loadCatalog(service, http);
      service.toggle('mod-2');

      expect(service.orderTarget()).toEqual({ moduleIds: ['mod-2'] });
    });
  });

  describe('erros', () => {
    it('traduz falha de rede em mensagem que o comprador pode agir', () => {
      const { service, http } = setup();
      let message = '';

      service.loadCatalog().subscribe({ error: (error: string) => (message = error) });
      http.expectOne(req => req.url.endsWith('/store/catalog')).error(new ProgressEvent('error'));

      expect(message).toContain('conexão');
      expect(service.error()).toBe(message);
    });

    it('usa a mensagem do servidor quando ela existe', () => {
      const { service, http } = setup();
      let message = '';

      service.createOrder({
        moduleIds: ['mod-1'],
        method: 'PIX',
        payer: {
          firstName: 'Ana',
          lastName: 'Souza',
          email: 'ana@delcastanher.com',
          document: '19119119100',
        },
      }).subscribe({ error: (error: string) => (message = error) });

      http
        .expectOne(req => req.url.endsWith('/orders'))
        .flush(
          { message: 'Você já tem acesso ao módulo "Fundamentos".' },
          { status: 409, statusText: 'Conflict' },
        );

      expect(message).toContain('já tem acesso');
    });
  });

});

/** Funcao pura: nao precisa do TestBed, e por isso vive fora do describe acima. */
describe('formatPrice', () => {
  it('formata centavos em real', () => {
    expect(formatPrice(19900)).toContain('199,00');
  });

  // Decisao 1: nulo e "a definir", e nao "R$ 0,00" — que afirmaria que o
  // modulo e gratuito.
  it('diz "A definir" para preco nulo, e nunca zero', () => {
    expect(formatPrice(null)).toBe('A definir');
  });
});
