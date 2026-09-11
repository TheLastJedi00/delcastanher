import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { CHECKOUT_OUTCOMES, findCheckoutProductBySlug } from '../../core/mocks/checkout.mock';
import { PLACEHOLDER } from '../../core/mocks/placeholders';
import { SEO_DATA_KEY } from '../../core/services/seo-route';
import { SeoMetadata } from '../../core/services/seo.service';
import { routes } from '../../app.routes';
import { Checkout, PROCESSING_DELAY_MS } from './checkout';
import { checkoutJourneyGuard } from './checkout-journey.guard';
import { CheckoutStateService } from './checkout-state';

describe('Checkout', () => {
  let fixture: ComponentFixture<Checkout>;
  let params: BehaviorSubject<Map<string, string>>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const buttonWith = (label: string) =>
    Array.from(el().querySelectorAll('button')).find(button =>
      button.textContent?.includes(label)
    ) as HTMLButtonElement | undefined;

  const paramMap = (slug: string) => ({
    paramMap: new BehaviorSubject({ get: (key: string) => (key === 'productSlug' ? slug : null) }),
  });

  const create = async (slug: string) => {
    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: paramMap(slug) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
  };

  const fillBuyer = () => {
    const inputs = Array.from(el().querySelectorAll('app-checkout-buyer-form input'));
    const values = ['Maria Souza', 'maria@exemplo.com', '123.456.789-00', '(47) 99290-8953'];

    inputs.forEach((node, index) => {
      const input = node as HTMLInputElement;

      input.value = values[index];
      input.dispatchEvent(new Event('input'));
    });

    fixture.detectChanges();
  };

  afterEach(() => TestBed.resetTestingModule());

  describe('resolução do produto', () => {
    it('resolve o curso pelo slug da rota', async () => {
      await create('imersao-rh');

      expect(text()).toContain('Imersão RH Estratégico');
      expect(el().querySelector('ui-order-summary')).not.toBeNull();
    });

    it('resolve o plano pelo id usado como slug', async () => {
      await create('trilhas');

      expect(text()).toContain('Trilhas');
    });

    it('cai no fallback amigável quando o slug não existe', async () => {
      await create('produto-que-nao-existe');

      expect(text()).toContain('Não encontramos este produto');
      expect(el().querySelector('form')).toBeNull();
    });

    it('respeita o placeholder de preço no resumo do pedido', async () => {
      await create('imersao-rh');

      const pending = el().querySelector('ui-placeholder-text .border-dashed');

      expect(pending).not.toBeNull();
      expect(pending!.textContent).toContain(PLACEHOLDER.price);
    });

    it('declara a rota como noindex na configuracao de rotas', () => {
      // Spec 009: o `robots` deixou de ser escrito pelo componente e passou a
      // vir de `data.seo`, aplicado pelo App num ponto so. A garantia continua
      // sendo a mesma — um checkout de mentira nao pode ser indexado —, mas
      // agora o teste olha para onde ela realmente vive.
      const checkoutRoute = routes.find(route => route.path === 'checkout/:productSlug');

      expect((checkoutRoute?.data?.[SEO_DATA_KEY] as SeoMetadata).indexable).toBeFalse();
    });

    it('mantém o aviso de ambiente de demonstração visível', async () => {
      await create('imersao-rh');

      expect(text()).toContain('Ambiente de demonstração');
    });
  });

  describe('troca de método de pagamento', () => {
    it('começa no PIX, com QR Code e chave copia e cola', async () => {
      await create('imersao-rh');

      expect(el().querySelector('img[ngsrc], img[src]')).not.toBeNull();
      expect(text()).toContain('Pague com PIX Copia e Cola');
      expect(el().querySelector('app-checkout-card-form')).toBeNull();
    });

    it('exibe o formulário de cartão apenas quando o cartão está selecionado', async () => {
      await create('imersao-rh');

      const cartao = Array.from(el().querySelectorAll('[role="radio"]')).find(radio =>
        radio.textContent?.includes('Cartão')
      ) as HTMLButtonElement;

      cartao.click();
      fixture.detectChanges();

      expect(el().querySelector('app-checkout-card-form')).not.toBeNull();
      expect(text()).not.toContain('Pague com PIX Copia e Cola');
    });
  });

  describe('simulação de pagamento', () => {
    it('não sai do formulário com os dados do comprador inválidos', fakeAsync(async () => {
      await create('imersao-rh');

      buttonWith('Simular pagamento')!.click();
      tick(PROCESSING_DELAY_MS);
      fixture.detectChanges();

      expect(el().querySelector('ui-loading-overlay')).toBeNull();
      expect(text()).toContain('Informe seu nome completo.');
      expect(el().querySelector('app-checkout-result')).toBeNull();
    }));

    it('mostra o overlay de processamento e depois o cenário escolhido', fakeAsync(async () => {
      await create('imersao-rh');
      fillBuyer();

      buttonWith('Recusado')!.click();
      fixture.detectChanges();

      buttonWith('Simular pagamento')!.click();
      fixture.detectChanges();

      expect(el().querySelector('ui-loading-overlay')).not.toBeNull();

      tick(PROCESSING_DELAY_MS);
      fixture.detectChanges();

      expect(el().querySelector('ui-loading-overlay')).toBeNull();
      expect(text()).toContain(CHECKOUT_OUTCOMES.recusado.title);
    }));

    it('guarda os dados do comprador na jornada, sem nada de cartão', fakeAsync(async () => {
      await create('imersao-rh');
      fillBuyer();

      buttonWith('Simular pagamento')!.click();
      tick(PROCESSING_DELAY_MS);
      fixture.detectChanges();

      const buyer = TestBed.inject(CheckoutStateService).buyer();

      expect(buyer.email).toBe('maria@exemplo.com');
      expect(buyer.document).toBe('12345678900');
      expect(Object.keys(buyer)).toEqual(['name', 'email', 'document', 'phone']);
    }));

    it('volta ao formulário com os dados preservados depois de uma falha', fakeAsync(async () => {
      await create('imersao-rh');
      fillBuyer();

      buttonWith('Erro de comunicação')!.click();
      fixture.detectChanges();

      buttonWith('Simular pagamento')!.click();
      tick(PROCESSING_DELAY_MS);
      fixture.detectChanges();

      expect(text()).toContain(CHECKOUT_OUTCOMES.erro.title);

      buttonWith(CHECKOUT_OUTCOMES.erro.recovery)!.click();
      fixture.detectChanges();

      const nome = el().querySelector('app-checkout-buyer-form input') as HTMLInputElement;

      expect(nome.value).toBe('Maria Souza');
    }));
  });

  describe('guarda das rotas filhas', () => {
    const route = (slug: string) =>
      ({
        paramMap: { get: () => null },
        parent: { paramMap: { get: (key: string) => (key === 'productSlug' ? slug : null) } },
      }) as never;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
    });

    it('devolve para o início do checkout sem jornada iniciada', () => {
      const result = TestBed.runInInjectionContext(() =>
        checkoutJourneyGuard(route('imersao-rh'), null as never)
      );

      expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/checkout/imersao-rh');
    });

    it('libera a rota com uma jornada aprovada em andamento', () => {
      const state = TestBed.inject(CheckoutStateService);

      state.start(findCheckoutProductBySlug('imersao-rh')!);
      state.complete('aprovado');

      const result = TestBed.runInInjectionContext(() =>
        checkoutJourneyGuard(route('imersao-rh'), null as never)
      );

      expect(result).toBeTrue();
    });

    it('não libera a rota quando a simulação falhou', () => {
      const state = TestBed.inject(CheckoutStateService);

      state.start(findCheckoutProductBySlug('imersao-rh')!);
      state.complete('recusado');

      const result = TestBed.runInInjectionContext(() =>
        checkoutJourneyGuard(route('imersao-rh'), null as never)
      );

      expect(result).not.toBeTrue();
    });
  });
});
