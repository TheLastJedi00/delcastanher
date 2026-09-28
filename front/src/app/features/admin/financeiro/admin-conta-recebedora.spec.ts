import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReceivingAccount } from '../../../core/services/admin-mercado-pago.service';
import { AdminContaRecebedora } from './admin-conta-recebedora';

const URL = '/admin/mercadopago/connection';

const CONNECTED: ReceivingAccount = {
  environment: 'production',
  status: 'connected',
  account: { mpUserId: '123456789', nickname: 'LIDIANE', email: 'lidiane@exemplo.com' },
  connectedAt: '2026-09-25T15:00:00.000Z',
  connectedByEmail: 'admin@delcastanher.com',
  expiresAt: '2027-03-24T15:00:00.000Z',
  lastRefreshedAt: null,
  disconnectedAt: null,
  disconnectReason: null,
  expiringSoon: false,
};

const NEVER: ReceivingAccount = {
  ...CONNECTED,
  status: 'never',
  account: null,
  connectedAt: null,
  connectedByEmail: null,
  expiresAt: null,
};

/** Spec 020, decisao 12. */
describe('AdminContaRecebedora', () => {
  let fixture: ComponentFixture<AdminContaRecebedora>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const button = (label: string) =>
    Array.from(el().querySelectorAll('button')).find(candidate =>
      candidate.textContent?.includes(label),
    ) as HTMLButtonElement | undefined;

  function render(account: ReceivingAccount): void {
    TestBed.configureTestingModule({
      imports: [AdminContaRecebedora],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(AdminContaRecebedora);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    backend.expectOne(req => req.method === 'GET' && req.url.endsWith(URL)).flush(account);
    fixture.detectChanges();
  }

  afterEach(() => backend.verify());

  it('mostra a conta conectada, quem conectou e a validade, sem aviso de loja fechada', () => {
    render(CONNECTED);

    expect(el().querySelector('[data-testid="conta-conectada"]')).not.toBeNull();
    expect(text()).toContain('LIDIANE');
    expect(text()).toContain('lidiane@exemplo.com');
    expect(text()).toContain('admin@delcastanher.com');
    expect(text()).toContain('Produção');
    expect(el().querySelector('[data-testid="loja-fechada"]')).toBeNull();
    expect(button('Trocar conta')).toBeDefined();
  });

  it('avisa em destaque que a loja está fechada quando nunca houve conta', () => {
    render(NEVER);

    expect(el().querySelector('[data-testid="loja-fechada"]')?.textContent).toContain(
      'A loja está fechada',
    );
    expect(button('Gerar link de conexão')).toBeDefined();
    expect(button('Desconectar')).toBeUndefined();
  });

  it('explica a desconexão por revogação', () => {
    render({ ...CONNECTED, status: 'revoked', disconnectedAt: CONNECTED.connectedAt, disconnectReason: 'revoked' });

    expect(el().querySelector('[data-testid="loja-fechada"]')?.textContent).toContain(
      'recusou a renovação',
    );
  });

  it('identifica o ambiente de teste', () => {
    render({ ...CONNECTED, environment: 'sandbox' });

    expect(text()).toContain('Ambiente de teste');
  });

  it('avisa quando o acesso está perto de vencer', () => {
    render({ ...CONNECTED, expiringSoon: true });

    expect(el().querySelector('[data-testid="aviso-vencimento"]')).not.toBeNull();
  });

  it('gera o link e mostra a URL com a validade, pronta para copiar', () => {
    render(NEVER);

    button('Gerar link de conexão')?.click();
    backend
      .expectOne(req => req.method === 'POST' && req.url.endsWith(`${URL}/link`))
      .flush({
        url: 'https://auth.mercadopago.com/authorization?state=abc',
        expiresAt: '2026-09-26T15:00:00.000Z',
      });
    fixture.detectChanges();

    const input = el().querySelector('#link-conexao') as HTMLInputElement;
    expect(input.value).toBe('https://auth.mercadopago.com/authorization?state=abc');
    expect(el().querySelector('[data-testid="link-gerado"]')?.textContent).toContain('Vale até');
    expect(button('Copiar')).toBeDefined();
  });

  it('copia o link para a área de transferência', async () => {
    render(NEVER);
    const writeText = jasmine.createSpy('writeText').and.resolveTo(undefined);
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText } as unknown as Clipboard);

    button('Gerar link de conexão')?.click();
    backend
      .expectOne(req => req.method === 'POST')
      .flush({ url: 'https://auth.mercadopago.com/authorization?state=abc', expiresAt: '2026-09-26T15:00:00.000Z' });
    fixture.detectChanges();

    button('Copiar')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('https://auth.mercadopago.com/authorization?state=abc');
    expect(button('Copiado')).toBeDefined();
  });

  // Desconectar fecha a loja: pede confirmacao na tela, sem dialogo do navegador.
  it('pede confirmação antes de desconectar', () => {
    render(CONNECTED);

    button('Desconectar')?.click();
    fixture.detectChanges();

    backend.expectNone(req => req.method === 'DELETE');
    expect(text()).toContain('Desconectar fecha a loja');

    button('Desconectar e fechar a loja')?.click();
    backend
      .expectOne(req => req.method === 'DELETE' && req.url.endsWith(URL))
      .flush({ ...CONNECTED, status: 'disconnected', disconnectedAt: CONNECTED.connectedAt, disconnectReason: 'manual' });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="loja-fechada"]')?.textContent).toContain(
      'desconectada pelo painel',
    );
  });

  it('cancela a desconexão sem chamar a API', () => {
    render(CONNECTED);

    button('Desconectar')?.click();
    fixture.detectChanges();
    button('Cancelar')?.click();
    fixture.detectChanges();

    backend.expectNone(req => req.method === 'DELETE');
    expect(button('Trocar conta')).toBeDefined();
  });
});
