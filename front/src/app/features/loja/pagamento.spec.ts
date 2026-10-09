import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

  return { sdk, handlers, created, updates, binsSearched, release };
}

const ONE_INSTALLMENT = [
  { installments: 1, recommendedMessage: '1x de R$ 197,00', installmentAmount: 197, totalAmount: 197 },
];

/**
 * Monta a tela com o SDK falso e os dados do comprador ja preenchidos. A
 * busca da bandeira e a do servico de verdade, sobre o SDK falso.
 */
function renderCard(fake: ReturnType<typeof fakeSdk>, options: { installmentsFail?: boolean } = {}) {
  const load = async () => fake.sdk;
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

            return ONE_INSTALLMENT;
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
    expect(box('#document').top - box('label[for="document"]').bottom).toBeGreaterThanOrEqual(6);
    expect(box('#cpf-motivo').top - box('#document').bottom).toBeGreaterThanOrEqual(6);

    el.remove();
  });
});
