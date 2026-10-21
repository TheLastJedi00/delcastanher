import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MercadoPagoLoader, SECURITY_URL } from './mercado-pago.service';

/**
 * Spec 028, decisao 10: o SDK v2 nao cria o device id. O `security.js` e
 * carregado junto, e a falha dele nao impede o pagamento.
 */
describe('MercadoPagoLoader — device id', () => {
  let backend: HttpTestingController;

  const securityScript = () => document.querySelector<HTMLScriptElement>(`script[src="${SECURITY_URL}"]`);

  beforeEach(() => {
    securityScript()?.remove();
    (window as { MercadoPago?: unknown }).MercadoPago = class {
      constructor(readonly key: string) {}
    };

    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    securityScript()?.remove();
    delete (window as { MercadoPago?: unknown }).MercadoPago;
  });

  async function load(): Promise<void> {
    const loading = TestBed.inject(MercadoPagoLoader).load();

    backend
      .expectOne(req => req.url.endsWith('/store/payment-config'))
      .flush({ publicKey: 'APP_USR-public', sandbox: true, maxInstallments: 12, enabled: true });
    await loading;
  }

  it('carrega o security.js com view="checkout" junto com o SDK', async () => {
    await load();

    expect(securityScript()).not.toBeNull();
    expect(securityScript()?.getAttribute('view')).toBe('checkout');
  });

  it('a falha do security.js vai para o log e não impede o SDK', async () => {
    await load();

    securityScript()?.dispatchEvent(new Event('error'));

    const [log] = backend.match(req => req.url.endsWith('/payments/client-logs'));

    expect(log.request.body).toEqual(jasmine.objectContaining({ stage: 'sdk_load', level: 'WARNING' }));
    expect(securityScript()).toBeNull();
  });

  it('lê o device id que o security.js cria', () => {
    (window as { MP_DEVICE_SESSION_ID?: string }).MP_DEVICE_SESSION_ID = 'device-123';

    expect(TestBed.inject(MercadoPagoLoader).deviceId()).toBe('device-123');

    delete (window as { MP_DEVICE_SESSION_ID?: string }).MP_DEVICE_SESSION_ID;
  });
});
