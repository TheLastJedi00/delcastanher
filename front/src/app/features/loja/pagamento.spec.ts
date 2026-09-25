import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StoreService } from '../../core/services/store.service';
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
