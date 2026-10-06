import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InvoiceSettings, InvoiceSummary } from '../../../core/services/admin-invoices.service';
import { NotaFiscal } from './nota-fiscal';

const SETTINGS: InvoiceSettings = {
  enabled: true,
  environment: 'producao',
  certificateExpiresAt: null,
  certificateDaysLeft: null,
  certificateWarning: false,
  cancelWindowHours: 24,
};

function nota(patch: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    status: 'AUTHORIZED',
    environment: 'producao',
    number: '42',
    series: null,
    accessKey: '42024042258216042000144000000000000126104238271855',
    lastError: null,
    issuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    hasPdf: true,
    ...patch,
  };
}

/** Spec 023, decisoes A2, A6, A7 e A9. */
describe('NotaFiscal', () => {
  let fixture: ComponentFixture<NotaFiscal>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const labels = () =>
    Array.from(el().querySelectorAll('[data-testid="nota-fiscal"] ui-button')).map(b => b.textContent?.trim());
  const button = (label: string) =>
    Array.from(el().querySelectorAll('button')).find(b => b.textContent?.trim() === label) as
      | HTMLButtonElement
      | undefined;

  function render(invoice: InvoiceSummary | null, orderStatus = 'PAID', settings = SETTINGS): void {
    TestBed.configureTestingModule({
      imports: [NotaFiscal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(NotaFiscal);
    backend = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('orderId', 'ord-1');
    fixture.componentRef.setInput('orderStatus', orderStatus);
    fixture.componentRef.setInput('invoice', invoice);
    fixture.componentRef.setInput('settings', settings);
    fixture.detectChanges();
  }

  afterEach(() => backend.verify());

  it('autorizada: selo, número e as ações de PDF, e-mail e cancelamento no prazo', () => {
    render(nota());

    expect(text()).toContain('Autorizada');
    // Spec 024.2, decisao N10: NFS-e, sem serie.
    expect(text()).toContain('NFS-e nº 42');
    expect(text()).not.toContain('série');
    expect(labels()).toEqual(['Baixar PDF', 'Reenviar e-mail', 'Cancelar']);
  });

  it('autorizada há mais de 24 horas não oferece cancelar', () => {
    render(nota({ issuedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() }));

    expect(labels()).toEqual(['Baixar PDF', 'Reenviar e-mail']);
  });

  // Decisao A6: a nota de homologacao tem selo.
  it('nota de homologação sai com o selo', () => {
    render(nota({ environment: 'homologacao' }));

    expect(el().querySelector('[data-testid="selo-homologacao"]')).not.toBeNull();
  });

  it('nota de produção não tem selo de homologação', () => {
    render(nota());

    expect(el().querySelector('[data-testid="selo-homologacao"]')).toBeNull();
  });

  it('erro e rejeição oferecem emitir de novo e mostram a mensagem crua', () => {
    render(nota({ status: 'DENIED', number: null, lastError: 'E0540 - Inconsistencia de tributacao ISSQN' }));

    expect(text()).toContain('Rejeitada');
    expect(text()).toContain('E0540 - Inconsistencia de tributacao ISSQN');
    expect(labels()).toEqual(['Emitir de novo']);
  });

  // Decisao A2.
  it('UNKNOWN sai em destaque, com vincular e emitir de novo', () => {
    render(nota({ status: 'UNKNOWN', number: null, hasPdf: false }));

    expect(el().querySelector('[data-testid="destaque"]')?.textContent).toContain('painel da Notaas');
    expect(labels()).toEqual(['Vincular nota', 'Emitir de novo']);
  });

  it('emitir de novo em UNKNOWN exige marcar a confirmação', () => {
    render(nota({ status: 'UNKNOWN', number: null, hasPdf: false }));

    button('Emitir de novo')?.click();
    fixture.detectChanges();

    const confirm = Array.from(el().querySelectorAll('ui-modal button')).find(
      b => b.textContent?.trim() === 'Emitir de novo',
    ) as HTMLButtonElement;

    expect(confirm.disabled).toBeTrue();
    expect(el().querySelector('ui-modal')?.textContent).toContain('duas NFS-e válidas');

    const checkbox = el().querySelector('[data-testid="confirmar-sem-nota"]') as HTMLInputElement;

    checkbox.click();
    fixture.detectChanges();
    expect(confirm.disabled).toBeFalse();

    confirm.click();

    const request = backend.expectOne(req => req.url.endsWith('/admin/invoices/ord-1/issue'));

    expect(request.request.body).toEqual({ confirmNoInvoice: true });
    request.flush(nota({ status: 'PROCESSING' }));
  });

  it('vincular manda o invoiceId digitado', () => {
    render(nota({ status: 'UNKNOWN', number: null, hasPdf: false }));

    button('Vincular nota')?.click();
    fixture.detectChanges();

    const field = el().querySelector('[data-testid="invoice-id"]') as HTMLInputElement;

    field.value = ' nts-visto ';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Vincular')?.click();

    const request = backend.expectOne(req => req.url.endsWith('/admin/invoices/ord-1/link'));

    expect(request.request.body).toEqual({ invoiceId: 'nts-visto' });
    request.flush(nota());
  });

  // Decisao A7.
  it('estorno fora do prazo sai em destaque e sem ações', () => {
    render(nota({ status: 'REFUND_PENDING' }), 'REFUNDED');

    expect(el().querySelector('[data-testid="destaque"]')?.textContent).toContain('fora do prazo');
    expect(el().querySelector('[data-testid="destaque"]')?.textContent).toContain('contadora');
    expect(labels()).toEqual([]);
  });

  it('cancelar pede confirmação antes de chamar a API', () => {
    render(nota());

    const changed = jasmine.createSpy('changed');

    fixture.componentInstance.changed.subscribe(changed);
    button('Cancelar')?.click();
    fixture.detectChanges();
    backend.expectNone(req => req.url.endsWith('/cancel'));
    expect(el().querySelector('ui-modal')?.textContent).toContain('Cancelar a NFS-e?');
    expect(el().querySelector('ui-modal')?.textContent).not.toContain('Sefaz');

    button('Cancelar a nota')?.click();
    backend.expectOne(req => req.url.endsWith('/admin/invoices/ord-1/cancel')).flush(nota({ status: 'CANCELLING' }));
    fixture.detectChanges();

    expect(changed).toHaveBeenCalled();
    expect(text()).toContain('Cancelamento enviado');
  });

  it('pedido pago sem nota oferece emitir', () => {
    render(null);

    expect(text()).toContain('Sem nota');
    expect(labels()).toEqual(['Emitir nota']);
  });

  it('pedido pendente sem nota não oferece nada', () => {
    render(null, 'PENDING');

    expect(labels()).toEqual([]);
  });

  it('com a emissão desligada, não oferece ações que chamam a Notaas', () => {
    render(nota({ status: 'ERROR' }), 'PAID', { ...SETTINGS, enabled: false });

    expect(labels()).toEqual([]);
  });

  it('mostra a recusa da API', () => {
    render(nota());

    button('Reenviar e-mail')?.click();
    backend
      .expectOne(req => req.url.endsWith('/admin/invoices/ord-1/email'))
      .flush({ message: 'A nota ainda nao tem os arquivos para enviar.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(text()).toContain('A nota ainda nao tem os arquivos para enviar.');
  });
});
