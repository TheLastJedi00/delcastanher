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
 * Os Secure Fields so avisam a bandeira pelo evento `binChange`, assinado com
 * `.on()`: uma opcao `onBinChange` no `create()` e ignorada pelo SDK, e o
 * pagamento com cartao saia sem `payment_method_id`.
 */
describe('Pagamento — bandeira do cartão', () => {
  it('assina o binChange do número do cartão e guarda a bandeira e as parcelas', async () => {
    const handlers: Record<string, (data: { bin?: string }) => Promise<void> | void> = {};
    const field = (name: string) => ({
      on: (event: string, handler: (data: { bin?: string }) => void) => {
        handlers[`${name}:${event}`] = handler;
      },
      mount: () => undefined,
    });
    const sdk = {
      fields: { create: (name: string) => field(name), createCardToken: async () => ({ id: 'tok' }) },
      getPaymentMethods: async () => ({ results: [{ id: 'master' }] }),
      getInstallments: async () => [],
    };
    const installments = [
      { installments: 1, recommendedMessage: '1x de R$ 197,00', installmentAmount: 197, totalAmount: 197 },
    ];

    TestBed.configureTestingModule({
      imports: [Pagamento],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MercadoPagoLoader,
          useValue: { load: async () => sdk, installments: async () => installments, ready: () => true },
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

    fixture.componentInstance.setMethod('CREDIT_CARD');
    await fixture.whenStable();

    expect(handlers['cardNumber:binChange']).toBeDefined();

    await handlers['cardNumber:binChange']({ bin: '54808328' });
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { paymentMethodId: string };
    expect(component.paymentMethodId).toBe('master');
    expect((fixture.nativeElement as HTMLElement).querySelector('#installments')).not.toBeNull();
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
