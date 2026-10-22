import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { PagamentoTeste } from './pagamento-teste';

const ROUTE = `${environment.apiUrl}/admin/finance/test-payment`;
const DESLIGADO = { enabled: false, priceCents: 100, accessKey: null, enabledAt: null };
const LIGADO = { enabled: true, priceCents: 100, accessKey: 'k'.repeat(43), enabledAt: '2026-10-22T12:00:00Z' };

function render(initial: object = DESLIGADO) {
  TestBed.configureTestingModule({
    imports: [PagamentoTeste],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  const fixture = TestBed.createComponent(PagamentoTeste);
  const http = TestBed.inject(HttpTestingController);

  fixture.detectChanges();
  http.expectOne(req => req.method === 'GET' && req.url === ROUTE).flush(initial);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const toggle = () => el.querySelector('[data-testid="toggle-teste"]') as HTMLButtonElement;

  return { fixture, http, el, toggle };
}

/** Spec 030, decisao 4: o toggle do modulo de teste no Financeiro. */
describe('PagamentoTeste', () => {
  it('desligado: interruptor desmarcado, preço de R$ 1,00 e sem link', () => {
    const { el, toggle } = render();

    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect((el.textContent ?? '').replace(/\s+/g, ' ')).toContain('R$ 1,00');
    expect(el.querySelector('[data-testid="link-teste"]')).toBeNull();
  });

  it('ligar manda enabled true e mostra o link secreto', () => {
    const { fixture, http, el, toggle } = render();

    toggle().click();
    const put = http.expectOne(req => req.method === 'PUT' && req.url === ROUTE);

    expect(put.request.body).toEqual({ enabled: true });

    put.flush(LIGADO);
    fixture.detectChanges();

    const input = el.querySelector('#link-teste-valor') as HTMLInputElement;

    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(input.value).toBe(`${window.location.origin}/loja/teste/${'k'.repeat(43)}`);
  });

  it('desligar manda enabled false e esconde o link', () => {
    const { fixture, http, el, toggle } = render(LIGADO);

    toggle().click();
    const put = http.expectOne(req => req.method === 'PUT' && req.url === ROUTE);

    expect(put.request.body).toEqual({ enabled: false });

    put.flush(DESLIGADO);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="link-teste"]')).toBeNull();
  });

  it('mostra o erro da API', () => {
    const { fixture, http, el, toggle } = render();

    toggle().click();
    http
      .expectOne(req => req.method === 'PUT' && req.url === ROUTE)
      .flush({ message: 'Acesso negado.' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('restrita a administradores');
  });
});
