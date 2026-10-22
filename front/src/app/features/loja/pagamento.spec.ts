import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { StoreService } from '../../core/services/store.service';
import { MercadoPagoLoader } from '../../core/services/mercado-pago.service';
import { Pagamento } from './pagamento';

const CONFIG = { publicKey: 'APP_USR-public', sandbox: false, maxInstallments: 12 };

/** Spec 020, decisao 7: sem conta recebedora a loja nao cobra. */
describe('Pagamento — loja fechada', () => {
  let fixture: ComponentFixture<Pagamento>;
  let backend: HttpTestingController;

  function render(config: Record<string, unknown>): HTMLElement {
    TestBed.configureTestingModule({
      imports: [Pagamento],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    TestBed.inject(StoreService).toggle('mod-1');
    fixture = TestBed.createComponent(Pagamento);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    backend.match(req => req.url.endsWith('/users/me')).forEach(req => req.flush(null));
    backend.match(req => req.url.endsWith('/store/payment-config')).forEach(req => req.flush(config));
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  const payButton = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).find(button => /Gerar PIX|Pagar/.test(button.textContent ?? ''));

  it('troca o botão de pagar pelo aviso quando não há conta recebedora', () => {
    const el = render({ ...CONFIG, publicKey: null, enabled: false, reason: 'seller_not_connected' });

    expect(el.querySelector('[data-testid="pagamento-indisponivel"]')?.textContent).toContain(
      'Pagamentos temporariamente indisponíveis',
    );
    expect(payButton(el)).toBeUndefined();
  });

  it('mantém o botão com a loja aberta', () => {
    const el = render({ ...CONFIG, enabled: true, reason: null });

    expect(el.querySelector('[data-testid="pagamento-indisponivel"]')).toBeNull();
    expect(payButton(el)).toBeDefined();
  });
});

/** Spec 023, decisao A3: a NF-e exige o endereco do comprador. */
describe('Pagamento — endereço para a nota fiscal', () => {
  let fixture: ComponentFixture<Pagamento>;
  let backend: HttpTestingController;

  const VIACEP = {
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    bairro: 'Bela Vista',
    localidade: 'São Paulo',
    uf: 'SP',
    ibge: '3550308',
  };

  const el = () => fixture.nativeElement as HTMLElement;
  const field = (id: string) => el().querySelector(`#${id}`) as HTMLInputElement;
  const payButton = () =>
    Array.from(el().querySelectorAll('button')).find(button =>
      /Gerar PIX|Pagar/.test(button.textContent ?? ''),
    ) as HTMLButtonElement;

  function type(id: string, value: string): void {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Pagamento],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    TestBed.inject(StoreService).toggle('mod-1');
    fixture = TestBed.createComponent(Pagamento);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    backend.match(req => req.url.endsWith('/users/me')).forEach(req => req.flush(null));
    backend
      .match(req => req.url.endsWith('/store/payment-config'))
      .forEach(req => req.flush({ ...CONFIG, enabled: true, reason: null }));
    backend.match(req => req.url.includes('/store/')).forEach(req => req.flush([]));
    fixture.detectChanges();

    type('firstName', 'Ana');
    type('lastName', 'Souza');
    type('email', 'ana@exemplo.com');
    type('document', '19119119100');
  });

  it('pede CEP, número e complemento, e explica por que', () => {
    expect(field('zip')).not.toBeNull();
    expect(field('number')).not.toBeNull();
    expect(field('complement')).not.toBeNull();
    expect(el().textContent).toContain('nota fiscal');
  });

  it('o ViaCEP preenche logradouro, bairro, cidade e UF', () => {
    type('zip', '01310-100');
    backend.expectOne('https://viacep.com.br/ws/01310100/json/').flush(VIACEP);
    fixture.detectChanges();

    expect(field('street').value).toBe('Avenida Paulista');
    expect(field('district').value).toBe('Bela Vista');
    expect(el().querySelector('[data-testid="cidade-uf"]')?.textContent).toContain('São Paulo / SP');
  });

  it('o comprador pode corrigir o logradouro e o bairro', () => {
    type('zip', '01310100');
    backend.expectOne('https://viacep.com.br/ws/01310100/json/').flush(VIACEP);
    fixture.detectChanges();

    expect(field('street').readOnly).toBeFalse();
    expect(field('district').readOnly).toBeFalse();
  });

  it('um CEP inexistente bloqueia o envio com mensagem clara', () => {
    type('zip', '99999999');
    backend.expectOne('https://viacep.com.br/ws/99999999/json/').flush({ erro: true });
    fixture.detectChanges();
    type('number', '10');

    expect(el().querySelector('[data-testid="cep-erro"]')?.textContent).toContain('CEP não encontrado');
    expect(payButton().disabled).toBeTrue();
  });

  it('sem número, não envia', () => {
    type('zip', '01310100');
    backend.expectOne('https://viacep.com.br/ws/01310100/json/').flush(VIACEP);
    fixture.detectChanges();

    expect(payButton().disabled).toBeTrue();
  });

  it('os dados do endereço seguem no pedido, com o código IBGE e o CEP só com dígitos', async () => {
    type('zip', '01310-100');
    backend.expectOne('https://viacep.com.br/ws/01310100/json/').flush(VIACEP);
    fixture.detectChanges();
    type('number', '1000');
    type('complement', 'Conj. 12');
    type('street', 'Av. Paulista');

    expect(payButton().disabled).toBeFalse();

    payButton().click();
    await fixture.whenStable();

    const order = backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders'));

    expect(order.request.body.payer).toEqual({
      firstName: 'Ana',
      lastName: 'Souza',
      email: 'ana@exemplo.com',
      document: '19119119100',
      address: {
        zip: '01310100',
        street: 'Av. Paulista',
        number: '1000',
        complement: 'Conj. 12',
        district: 'Bela Vista',
        city: 'São Paulo',
        cityIbge: '3550308',
        state: 'SP',
      },
    });
  });
});

/**
 * SDK falso dos Secure Fields. Como o real, o `mount()` poe um iframe no
 * contêiner e, quando o contêiner nao existe, so avisa (nao lanca erro).
 */
function fakeSdk(
  overrides: {
    mountsIframe?: boolean;
    settings?: unknown[];
    tokenError?: unknown;
    /** Bandeira por BIN, como na tabela do Mercado Pago; sem isso, todo BIN e `master`. */
    brands?: Record<string, string>;
    /** Segura a resposta da bandeira de um BIN ate o teste liberar. */
    holdBin?: string;
  } = {},
) {
  const handlers: Record<string, (data: { bin?: string; errorMessages?: unknown[] }) => unknown> = {};
  const created: string[] = [];
  const updates: Record<string, unknown[]> = {};
  const binsSearched: string[] = [];
  const tokenCalls = { count: 0 };
  let release: () => void = () => undefined;
  const held = new Promise<void>(resolve => (release = resolve));

  const sdk = {
    fields: {
      create: (name: string) => {
        created.push(name);

        return {
          on: (event: string, handler: (data: { bin?: string }) => unknown) => {
            handlers[`${name}:${event}`] = handler;
          },
          update: (properties: unknown) => {
            (updates[name] ??= []).push(properties);
          },
          mount: (id: string) => {
            const container = document.getElementById(id);

            if (container && overrides.mountsIframe !== false) {
              container.innerHTML = '';
              container.appendChild(document.createElement('iframe'));
            }
          },
        };
      },
      createCardToken: async () => {
        tokenCalls.count += 1;

        if (overrides.tokenError) {
          throw overrides.tokenError;
        }

        return { id: 'tok' };
      },
    },
    getPaymentMethods: async ({ bin }: { bin: string }) => {
      binsSearched.push(bin);

      if (bin === overrides.holdBin) {
        await held;
      }

      const id = overrides.brands ? overrides.brands[bin] : 'master';

      return { results: id ? [{ id, settings: overrides.settings }] : [] };
    },
    getInstallments: async () => [],
  };

  return { sdk, handlers, created, updates, binsSearched, release, tokenCalls };
}

const ONE_INSTALLMENT = [
  { installments: 1, recommendedMessage: '1x de R$ 197,00', installmentAmount: 197, totalAmount: 197 },
];

/**
 * Monta a tela com o SDK falso e os dados do comprador ja preenchidos. A
 * busca da bandeira e a do servico de verdade, sobre o SDK falso.
 */
function renderCard(
  fake: ReturnType<typeof fakeSdk>,
  options: {
    installmentsFail?: boolean;
    /** O SDK nao carrega (bloqueador, rede): `load()` rejeita. */
    loadFails?: boolean;
    installments?: typeof ONE_INSTALLMENT;
  } = {},
) {
  const load = async () => {
    if (options.loadFails) {
      throw new Error('Falha ao carregar o SDK de pagamento.');
    }

    return fake.sdk;
  };
  const installmentBins: string[] = [];

  TestBed.configureTestingModule({
    imports: [Pagamento],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: MercadoPagoLoader,
        useValue: {
          load,
          paymentMethod: (bin: string) => MercadoPagoLoader.prototype.paymentMethod.call({ load }, bin),
          installments: async (_amount: number, bin: string) => {
            installmentBins.push(bin);

            if (options.installmentsFail) {
              throw { status: 404 };
            }

            return options.installments ?? ONE_INSTALLMENT;
          },
          ready: () => true,
          deviceId: () => undefined,
        },
      },
    ],
  });

  TestBed.inject(StoreService).toggle('mod-1');
  const fixture = TestBed.createComponent(Pagamento);
  const backend = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  backend.match(req => req.url.endsWith('/users/me')).forEach(req => req.flush(null));
  backend
    .match(req => req.url.endsWith('/store/payment-config'))
    .forEach(req => req.flush({ ...CONFIG, enabled: true, reason: null }));
  backend.match(req => req.url.includes('/store/')).forEach(req => req.flush([]));
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const component = fixture.componentInstance;

  component.form.patchValue({
    firstName: 'Ana',
    lastName: 'Souza',
    email: 'ana@exemplo.com',
    document: '191.191.191-00',
    address: {
      zip: '01310100',
      street: 'Av. Paulista',
      number: '1000',
      district: 'Bela Vista',
      city: 'São Paulo',
      cityIbge: '3550308',
      state: 'SP',
    },
  });
  backend.match(req => req.url.includes('viacep')).forEach(req => req.flush({ erro: true }));
  component.form.controls.address.patchValue({ city: 'São Paulo', cityIbge: '3550308', state: 'SP' });

  /** Escolhe o cartao e espera o Angular desenhar e o SDK montar. */
  async function chooseCard(): Promise<void> {
    component.setMethod('CREDIT_CARD');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function choosePix(): Promise<void> {
    component.setMethod('PIX');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function pay(): Promise<void> {
    await component.pay();
    fixture.detectChanges();
  }

  return { fixture, backend, el, component, chooseCard, choosePix, pay, installmentBins };
}

const brandOf = (component: Pagamento) => (component as unknown as { paymentMethodId: string }).paymentMethodId;

/**
 * Os Secure Fields so avisam a bandeira pelo evento `binChange`, assinado com
 * `.on()`: uma opcao `onBinChange` no `create()` e ignorada pelo SDK, e o
 * pagamento com cartao saia sem `payment_method_id`.
 */
describe('Pagamento — bandeira do cartão', () => {
  it('assina o binChange do número do cartão e guarda a bandeira e as parcelas', async () => {
    const fake = fakeSdk();
    const { el, component, fixture, chooseCard } = renderCard(fake);

    await chooseCard();

    expect(fake.handlers['cardNumber:binChange']).toBeDefined();

    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    fixture.detectChanges();

    expect((component as unknown as { paymentMethodId: string }).paymentMethodId).toBe('master');
    expect(el.querySelector('#installments')).not.toBeNull();
  });

  it('ajusta número e CVV às regras da bandeira (Amex: CVV de 4)', async () => {
    const settings = [{ card_number: { length: 15 }, security_code: { length: 4, mode: 'mandatory' } }];
    const fake = fakeSdk({ settings });
    const { chooseCard } = renderCard(fake);

    await chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '37000000' });

    expect(fake.updates['securityCode']).toEqual([{ settings: { length: 4, mode: 'mandatory' } }]);
    expect(fake.updates['cardNumber']).toEqual([{ settings: { length: 15 } }]);
  });
});

/**
 * Fix: o Secure Field so entrega o BIN com 8 digitos, e a tabela do Mercado
 * Pago nao tem muitos BINs Visa de 8 digitos cujos 6 primeiros ela conhece.
 * A bandeira ficava vazia e o pagamento parava em "nao reconhecemos a bandeira".
 */
describe('Pagamento — bandeira Visa pelo BIN de 6 dígitos', () => {
  it('sem resultado com 8 dígitos, reconhece a bandeira com os 6 primeiros', async () => {
    const fake = fakeSdk({ brands: { '423564': 'visa' } });
    const { component, chooseCard, installmentBins } = renderCard(fake);

    await chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '42356449' });

    expect(fake.binsSearched).toEqual(['42356449', '423564']);
    expect(brandOf(component)).toBe('visa');
    expect(installmentBins).toEqual(['423564']);
  });

  it('com resultado em 8 dígitos, não consulta com 6', async () => {
    const fake = fakeSdk({ brands: { '42356477': 'visa' } });
    const { component, chooseCard, installmentBins } = renderCard(fake);

    await chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '42356477' });

    expect(fake.binsSearched).toEqual(['42356477']);
    expect(brandOf(component)).toBe('visa');
    expect(installmentBins).toEqual(['42356477']);
  });

  it('falha nas parcelas não apaga a bandeira, e o pagamento segue em 1x', async () => {
    const fake = fakeSdk({ brands: { '423564': 'visa' } });
    const { el, fixture, component, backend, chooseCard } = renderCard(fake, { installmentsFail: true });

    await chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '42356449' });
    fixture.detectChanges();

    expect(brandOf(component)).toBe('visa');
    expect(el.querySelector('#installments')).toBeNull();

    const paying = component.pay();
    await new Promise(resolve => setTimeout(resolve));

    const order = backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders'));

    expect(order.request.body.card).toEqual({ token: 'tok', paymentMethodId: 'visa', installments: 1 });

    order.flush({ id: 'ord-1' });
    await paying;
  });

  it('cartão que o Mercado Pago não conhece: avisa no campo e não cobra', async () => {
    const fake = fakeSdk({ brands: {} });
    const { el, fixture, backend, chooseCard, pay } = renderCard(fake);

    await chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '45062900' });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="cartao-nao-aceito"]')?.textContent).toContain(
      'Este cartão não é aceito',
    );

    await pay();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Este cartão não é aceito');
    backend.expectNone(req => req.method === 'POST' && req.url.endsWith('/orders'));
  });

  it('resposta atrasada de um número anterior não sobrescreve a do atual', async () => {
    const fake = fakeSdk({ brands: { '42356477': 'visa', '54808328': 'master' }, holdBin: '42356477' });
    const { component, chooseCard } = renderCard(fake);

    await chooseCard();
    const first = fake.handlers['cardNumber:binChange']({ bin: '42356477' });
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    fake.release();
    await first;

    expect(brandOf(component)).toBe('master');
  });
});

/**
 * Fix: em alguns aparelhos os campos do cartao ficavam vazios e sem como
 * digitar. O `mount()` rodava antes de o Angular desenhar os contêineres, ou
 * depois de o bloco ter saido do DOM, e o SDK so avisava no console.
 */
describe('Pagamento — campos do cartão', () => {
  it('monta os três campos depois de desenhar os contêineres', async () => {
    const fake = fakeSdk();
    const { el, chooseCard } = renderCard(fake);

    await chooseCard();

    for (const id of ['cardNumber', 'expirationDate', 'securityCode']) {
      expect(el.querySelector(`#${id} iframe`)).withContext(id).not.toBeNull();
    }
  });

  it('PIX → Cartão → PIX → Cartão mantém os campos, sem montar de novo', async () => {
    const fake = fakeSdk();
    const { el, chooseCard, choosePix } = renderCard(fake);

    await chooseCard();
    await choosePix();
    await chooseCard();

    expect(el.querySelector('#cardNumber iframe')).not.toBeNull();
    expect(fake.created).toEqual(['cardNumber', 'expirationDate', 'securityCode']);
  });

  it('avisa quando o SDK não pôs o iframe, e tenta de novo no próximo clique', async () => {
    const fake = fakeSdk({ mountsIframe: false });
    const { el, chooseCard } = renderCard(fake);

    await chooseCard();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível carregar o formulário de cartão',
    );

    await chooseCard();

    expect(fake.created.length).toBe(6);
  });

  it('preenche o nome do cartão com o do comprador, e ele é obrigatório', async () => {
    const { component, chooseCard } = renderCard(fakeSdk());

    await chooseCard();

    expect(component.cardholderName.value).toBe('ANA SOUZA');

    component.cardholderName.setValue('');

    expect(component.cardholderName.invalid).toBeTrue();
  });

  it('mostra o erro do campo do cartão depois que o comprador sai dele', async () => {
    const fake = fakeSdk();
    const { el, fixture, chooseCard } = renderCard(fake);

    await chooseCard();
    fake.handlers['securityCode:validityChange']({ errorMessages: [{ message: 'invalid' }] });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="erro-securityCode"]')).toBeNull();

    fake.handlers['securityCode:blur']({});
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="erro-securityCode"]')?.textContent).toContain(
      'Confira o código de segurança',
    );
  });

  it('sem bandeira reconhecida, não cobra e diz o que conferir', async () => {
    const { el, backend, chooseCard, pay } = renderCard(fakeSdk());

    await chooseCard();
    await pay();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Confira o número do cartão');
    backend.expectNone(req => req.method === 'POST' && req.url.endsWith('/orders'));
  });

  it('traduz a recusa do token em qual campo corrigir', async () => {
    const fake = fakeSdk({ tokenError: [{ code: 'E301', message: 'invalid card number' }] });
    const { el, chooseCard, pay } = renderCard(fake);

    await chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    await pay();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Confira o número do cartão.');
  });

  it('envia o CPF digitado com máscara só com os dígitos', async () => {
    const fake = fakeSdk();
    const { backend, chooseCard, component } = renderCard(fake);

    await chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    const paying = component.pay();
    await new Promise(resolve => setTimeout(resolve));

    const order = backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders'));

    expect(order.request.body.payer.document).toBe('19119119100');
    expect(order.request.body.card).toEqual({ token: 'tok', paymentMethodId: 'master', installments: 1 });

    order.flush({ id: 'ord-1' });
    await paying;
  });

  it('recusa CPF com dígito verificador errado', () => {
    const { component } = renderCard(fakeSdk());

    component.form.controls.document.setValue('191.191.191-01');

    expect(component.form.controls.document.invalid).toBeTrue();
  });
});

/** Fix: no celular, o texto do endereco subia por cima do titulo. */
describe('Pagamento — espaçamento do formulário', () => {
  it('mantém o texto do endereço abaixo do título, e rótulo, campo e ajuda separados', () => {
    TestBed.configureTestingModule({
      imports: [Pagamento],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    TestBed.inject(StoreService).toggle('mod-1');
    const fixture = TestBed.createComponent(Pagamento);
    const el = fixture.nativeElement as HTMLElement;
    el.style.display = 'block';
    el.style.width = '390px';
    document.body.appendChild(el);
    fixture.detectChanges();

    const backend = TestBed.inject(HttpTestingController);
    backend.match(req => req.url.endsWith('/users/me')).forEach(req => req.flush(null));
    backend
      .match(req => req.url.endsWith('/store/payment-config'))
      .forEach(req => req.flush({ ...CONFIG, enabled: true, reason: null }));
    fixture.detectChanges();

    const box = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();

    expect(box('legend + p').top).toBeGreaterThanOrEqual(box('legend').bottom);
    // Arredondado: o layout tem subpixel (5,99997), e a ordem aleatoria dos testes muda o deslocamento.
    expect(Math.round(box('#document').top - box('label[for="document"]').bottom)).toBeGreaterThanOrEqual(6);
    expect(Math.round(box('#cpf-motivo').top - box('#document').bottom)).toBeGreaterThanOrEqual(6);

    el.remove();
  });
});

/** Spec 027, decisao 6: o resumo do pacote sem lote. */
describe('Pagamento — resumo do pacote', () => {
  it('mostra o pacote completo com o preço único, sem lote', () => {
    TestBed.configureTestingModule({
      imports: [Pagamento],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    const store = TestBed.inject(StoreService);
    const backend = TestBed.inject(HttpTestingController);

    store.loadOffer().subscribe();
    backend.expectOne(req => req.url.endsWith('/store/offer')).flush({
      modules: [],
      bundle: {
        slug: 'imersao-rh-lancamento',
        title: 'Imersão RH Estratégico — Pacote completo',
        modules: [],
        modulesTotalCents: 256400,
        tier: { id: 't4', order: 4, name: 'Preço único', priceCents: 98900, capacity: null, remaining: null },
        nextTier: null,
      },
    });
    store.selectBundle('imersao-rh-lancamento');

    const fixture = TestBed.createComponent(Pagamento);
    fixture.detectChanges();
    backend.match(req => req.url.endsWith('/users/me')).forEach(req => req.flush(null));
    backend
      .match(req => req.url.endsWith('/store/payment-config'))
      .forEach(req => req.flush({ ...CONFIG, enabled: true, reason: null }));
    fixture.detectChanges();

    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Imersão RH Estratégico — Pacote completo 12 módulos');
    expect(text).toContain('R$ 989,00');
    expect(text).not.toContain('Preço único');
    expect(text).not.toContain('Lote');
  });
});

/** Pedido como a API devolve na recusa ou no erro (Spec 028, decisoes 4 e 5). */
function closedOrder(status: 'REJECTED' | 'FAILED', message: string) {
  return { id: 'ord-1', status, method: 'CREDIT_CARD', message, items: [], amountCents: 19700 };
}

/** Cobra com a bandeira ja reconhecida e devolve a requisicao do pedido. */
async function payWithCard(setup: ReturnType<typeof renderCard>, fake: ReturnType<typeof fakeSdk>) {
  await setup.chooseCard();
  await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
  const paying = setup.component.pay();
  await new Promise(resolve => setTimeout(resolve));

  return { paying, order: setup.backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders')) };
}

const clientLogs = (backend: HttpTestingController) =>
  backend.match(req => req.method === 'POST' && req.url.endsWith('/payments/client-logs'));

/**
 * Spec 028, decisao 4: a recusa do cartao fica na tela de pagamento, com a
 * selecao e os campos prontos para outro cartao ou o PIX.
 */
describe('Pagamento — recusa e erro na própria tela', () => {
  for (const [status, message] of [
    ['REJECTED', 'O cartão não tem limite suficiente para este valor.'],
    ['FAILED', 'Não foi possível falar com o provedor de pagamento.'],
  ] as const) {
    it(`pedido ${status}: mostra a mensagem, mantém a seleção e não sai da tela`, async () => {
      const fake = fakeSdk();
      const setup = renderCard(fake);
      const navigate = spyOn(TestBed.inject(Router), 'navigate');
      const { paying, order } = await payWithCard(setup, fake);

      order.flush(closedOrder(status, message));
      await paying;
      setup.fixture.detectChanges();

      expect(setup.el.querySelector('[role="alert"]')?.textContent).toContain(message);
      expect(TestBed.inject(StoreService).hasSelection()).toBeTrue();
      expect(navigate).not.toHaveBeenCalled();
      expect(setup.el.querySelector('#cardNumber iframe')).not.toBeNull();
    });
  }

  it('a nova tentativa gera outro token e outra tentativa', async () => {
    const fake = fakeSdk();
    const setup = renderCard(fake);
    const first = await payWithCard(setup, fake);

    first.order.flush(closedOrder('REJECTED', 'Recusado.'));
    await first.paying;

    const paying = setup.component.pay();
    await new Promise(resolve => setTimeout(resolve));
    const second = setup.backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders'));

    expect(fake.tokenCalls.count).toBe(2);
    expect(second.request.body.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.request.body.attemptId).not.toBe(first.order.request.body.attemptId);

    second.flush({ id: 'ord-2', status: 'PAID' });
    await paying;
  });

  it('trocar para o PIX limpa a mensagem da recusa', async () => {
    const fake = fakeSdk();
    const setup = renderCard(fake);
    const { paying, order } = await payWithCard(setup, fake);

    order.flush(closedOrder('REJECTED', 'Recusado.'));
    await paying;
    await setup.choosePix();
    setup.fixture.detectChanges();

    expect(setup.el.querySelector('[role="alert"]')).toBeNull();
  });

  it('pago segue para a tela do pedido e limpa a seleção', async () => {
    const fake = fakeSdk();
    const setup = renderCard(fake);
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    const { paying, order } = await payWithCard(setup, fake);

    order.flush({ id: 'ord-1', status: 'PAID' });
    await paying;

    expect(navigate).toHaveBeenCalledWith(['/loja/pedido', 'ord-1']);
    expect(TestBed.inject(StoreService).hasSelection()).toBeFalse();
  });
});

/** Spec 028, decisao 9: os erros do navegador sobem para os logs. */
describe('Pagamento — logs do navegador', () => {
  it('SDK que não carrega: vai para o log, e pagar cria o pedido FAILED com o motivo', async () => {
    const fake = fakeSdk();
    const setup = renderCard(fake, { loadFails: true });

    await setup.chooseCard();

    const logs = clientLogs(setup.backend);

    expect(logs.length).toBe(1);
    expect(logs[0].request.body).toEqual(
      jasmine.objectContaining({ stage: 'sdk_load', level: 'ERROR', attemptId: jasmine.any(String) }),
    );
    logs.forEach(req => req.flush(null));

    const paying = setup.component.pay();
    await new Promise(resolve => setTimeout(resolve));
    clientLogs(setup.backend).forEach(req => req.flush(null));
    const order = setup.backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders'));

    expect(order.request.body.clientError).toEqual({
      stage: 'sdk_load',
      message: 'Falha ao carregar o SDK de pagamento.',
    });
    expect(order.request.body.card).toBeUndefined();
    expect(order.request.body.attemptId).toBe(logs[0].request.body.attemptId);

    order.flush(closedOrder('FAILED', 'Não foi possível falar com o provedor de pagamento.'));
    await paying;
  });

  it('bandeira que o Mercado Pago não conhece vai como aviso, com só 6 dígitos', async () => {
    const fake = fakeSdk({ brands: {} });
    const setup = renderCard(fake);

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '45062900' });

    const [log] = clientLogs(setup.backend);

    expect(log.request.body).toEqual(
      jasmine.objectContaining({ stage: 'payment_method', level: 'WARNING', detail: { bin: '450629' } }),
    );
  });

  it('falha nas parcelas vai para o log, e o pagamento segue em 1x', async () => {
    const fake = fakeSdk();
    const setup = renderCard(fake, { installmentsFail: true });

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });

    const [log] = clientLogs(setup.backend);

    expect(log.request.body).toEqual(jasmine.objectContaining({ stage: 'installments', level: 'ERROR' }));
  });

  it('dado digitado errado no token: só aviso no log, sem pedido', async () => {
    const fake = fakeSdk({ tokenError: [{ code: 'E301', message: 'invalid card number' }] });
    const setup = renderCard(fake);

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    await setup.pay();

    const [log] = clientLogs(setup.backend);

    expect(log.request.body).toEqual(
      jasmine.objectContaining({ stage: 'tokenize', level: 'WARNING', detail: { codes: ['E301'] } }),
    );
    setup.backend.expectNone(req => req.method === 'POST' && req.url.endsWith('/orders'));
    expect(setup.el.querySelector('[role="alert"]')?.textContent).toContain('Confira o número do cartão.');
  });

  it('token que falha por erro do SDK: log de erro e pedido FAILED', async () => {
    const fake = fakeSdk({ tokenError: new Error('Network request failed') });
    const setup = renderCard(fake);

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    const paying = setup.component.pay();
    await new Promise(resolve => setTimeout(resolve));

    const [log] = clientLogs(setup.backend);
    const order = setup.backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders'));

    expect(log.request.body).toEqual(jasmine.objectContaining({ stage: 'tokenize', level: 'ERROR' }));
    expect(order.request.body.clientError).toEqual({ stage: 'tokenize', message: 'Network request failed' });

    order.flush(closedOrder('FAILED', 'Não foi possível falar com o provedor de pagamento.'));
    await paying;
  });

  it('uma falha ao mandar o log não aparece para o comprador', async () => {
    const fake = fakeSdk({ brands: {} });
    const setup = renderCard(fake);

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '45062900' });
    clientLogs(setup.backend).forEach(req => req.flush(null, { status: 500, statusText: 'Erro' }));
    setup.fixture.detectChanges();

    expect(setup.el.querySelector('[role="alert"]')).toBeNull();
  });
});

/** Spec 028, decisao 13: o botao diz o parcelado, e o total com juros aparece. */
describe('Pagamento — botão com o parcelado', () => {
  const THREE = [
    ...ONE_INSTALLMENT,
    { installments: 3, recommendedMessage: '3x de R$ 73,04', installmentAmount: 73.04, totalAmount: 219.12 },
  ];

  it('em 3x, diz "Pagar 3x de R$ 73,04" e o total com juros', async () => {
    const fake = fakeSdk();
    const setup = renderCard(fake, { installments: THREE });

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    setup.component.installmentsControl.setValue(3);
    setup.fixture.detectChanges();

    const text = (setup.el.textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Pagar 3x de R$ 73,04');
    expect(
      (setup.el.querySelector('[data-testid="total-parcelado"]')?.textContent ?? '').replace(/\s+/g, ' '),
    ).toContain('R$ 219,12');
  });

  it('em 1x, diz o total do pedido, sem a linha de juros', async () => {
    const fake = fakeSdk();
    const setup = renderCard(fake, { installments: THREE });

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    setup.fixture.detectChanges();

    expect(setup.el.textContent).toContain('Pagar R$');
    expect(setup.el.querySelector('[data-testid="total-parcelado"]')).toBeNull();
  });
});

/** Spec 030: o resumo e o pedido do modulo de teste na tela de pagamento. */
describe('Pagamento — modulo de teste', () => {
  it('mostra o modulo de teste no resumo e manda a chave no pedido', async () => {
    const fake = fakeSdk();


    const setup = renderCard(fake);
    const store = TestBed.inject(StoreService);

    store.selectTest('k'.repeat(43), { title: 'Módulo de teste', summary: 'x', priceCents: 100 });
    setup.fixture.detectChanges();

    const resumo = setup.el.querySelector('[data-testid="resumo-teste"]')?.textContent ?? '';

    expect(resumo.replace(/\s+/g, ' ')).toContain('Módulo de teste');
    expect(resumo.replace(/\s+/g, ' ')).toContain('R$ 1,00');
    expect(setup.el.textContent).toContain('Não libera nenhum módulo');

    await setup.chooseCard();
    await fake.handlers['cardNumber:binChange']({ bin: '54808328' });
    const paying = setup.component.pay();
    await new Promise(resolve => setTimeout(resolve));

    const order = setup.backend.expectOne(req => req.method === 'POST' && req.url.endsWith('/orders'));

    expect(order.request.body.testKey).toBe('k'.repeat(43));
    expect(order.request.body.moduleIds).toBeUndefined();

    order.flush({ id: 'ord-t', status: 'PAID', testPayment: true });
    await paying;
  });
});
