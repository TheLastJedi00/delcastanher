import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { CampanhaDesconto } from './campanha-desconto';

const ROUTE = `${environment.apiUrl}/admin/promotions`;
const ZERO = { paidOrders: 0, revenueCents: 0, discountCents: 0 };

const NO_AR = {
  id: 'promo-1',
  name: 'Black Friday',
  percentOff: 30,
  startsAt: '2026-11-27T03:00:00.000Z',
  endsAt: '2026-12-01T02:59:00.000Z',
  endedEarlyAt: null,
  status: 'RUNNING',
  totals: { paidOrders: 4, revenueCents: 276920, discountCents: 118680 },
};
const AGENDADA = {
  ...NO_AR,
  id: 'promo-2',
  name: 'Natal',
  percentOff: 15,
  startsAt: '2026-12-20T03:00:00.000Z',
  endsAt: '2026-12-26T03:00:00.000Z',
  status: 'SCHEDULED',
  totals: ZERO,
};
const ENCERRADA = {
  ...NO_AR,
  id: 'promo-0',
  name: 'Esquenta',
  percentOff: 10,
  startsAt: '2026-11-01T03:00:00.000Z',
  endsAt: '2026-11-03T03:00:00.000Z',
  endedEarlyAt: '2026-11-02T15:00:00.000Z',
  status: 'ENDED',
  totals: { paidOrders: 1, revenueCents: 89010, discountCents: 9890 },
};

const PREVIEW = {
  modules: [],
  bundle: {
    slug: 'imersao-rh-lancamento',
    title: 'Pacote completo',
    modules: [],
    modulesTotalCents: 256400,
    tier: { id: 't4', order: 4, name: 'Preço único', priceCents: 69230, listPriceCents: 98900, capacity: null, remaining: null },
    nextTier: null,
  },
};

function render(list: object[] = []) {
  TestBed.configureTestingModule({
    imports: [CampanhaDesconto],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  const fixture = TestBed.createComponent(CampanhaDesconto);
  const http = TestBed.inject(HttpTestingController);

  fixture.detectChanges();
  http.expectOne(req => req.method === 'GET' && req.url === ROUTE).flush(list);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const text = () => (el.textContent ?? '').replace(/\s+/g, ' ');
  const byTestId = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = (id: string) => {
    (byTestId(id)?.querySelector('button') ?? byTestId(id))?.click();
    fixture.detectChanges();
  };
  const input = (name: string) => el.querySelector(`[formcontrolname="${name}"]`) as HTMLInputElement;
  const type = (name: string, value: string) => {
    const field = input(name);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  return { fixture, http, el, text, byTestId, click, input, type, submit };
}

/** Spec 032, decisao 10: o card da campanha no Financeiro. */
describe('CampanhaDesconto', () => {
  it('mostra a campanha no ar com o fim em Brasilia e os totais, e a agendada', () => {
    const { text, byTestId } = render([AGENDADA, NO_AR]);

    expect(byTestId('campanha-RUNNING')).not.toBeNull();
    expect(text()).toContain('No ar');
    expect(text()).toContain('Termina em 30/11 às 23h59');
    expect(text()).toContain('R$ 1.186,80');
    expect(byTestId('campanha-SCHEDULED')).not.toBeNull();
    expect(text()).toContain('De 20/12 às 00h00 a 26/12 às 00h00');
  });

  it('a encerrada vai para o historico, com o fim antecipado', () => {
    const { text, byTestId } = render([ENCERRADA]);

    expect(byTestId('historico')).not.toBeNull();
    expect(byTestId('campanha-ENDED')).toBeNull();
    expect(text()).toContain('02/11/2026 às 12h00');
    expect(text()).toContain('(encerrada antes)');
  });

  it('cria com as datas em ISO de Brasilia e mostra a previa vinda da API', () => {
    const { http, click, type, submit, byTestId, text, fixture } = render();

    click('criar-campanha');
    http.expectOne(req => req.url === `${ROUTE}/preview` && req.params.get('percentOff') === '30').flush(PREVIEW);
    fixture.detectChanges();

    expect(byTestId('previa')).not.toBeNull();
    expect(text()).toContain('O pacote sai de R$ 989,00 por R$ 692,30');

    type('startsAt', '2026-11-27T00:00');
    type('endsAt', '2026-11-30T23:59');
    submit();

    const post = http.expectOne(req => req.method === 'POST' && req.url === ROUTE);

    expect(post.request.body).toEqual({
      name: 'Black Friday',
      percentOff: 30,
      startsAt: '2026-11-27T00:00:00-03:00',
      endsAt: '2026-11-30T23:59:00-03:00',
    });

    post.flush({ ...NO_AR, status: 'SCHEDULED' });
    // Recarrega a lista: estado e totais sao da API.
    http.expectOne(req => req.method === 'GET' && req.url === ROUTE).flush([{ ...AGENDADA }]);
  });

  it('fim antes do inicio bloqueia o envio', () => {
    const { http, click, type, el, text } = render();

    click('criar-campanha');
    http.expectOne(req => req.url === `${ROUTE}/preview`).flush(PREVIEW);
    type('startsAt', '2026-11-30T00:00');
    type('endsAt', '2026-11-27T00:00');

    expect(text()).toContain('O fim precisa ser depois do início.');
    expect((el.querySelector('form button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a previa acompanha a porcentagem digitada, sem uma chamada por tecla', fakeAsync(() => {
    const { http, click, type } = render();

    click('criar-campanha');
    http.expectOne(req => req.url === `${ROUTE}/preview`).flush(PREVIEW);

    type('percentOff', '4');
    type('percentOff', '40');
    tick(300);

    http.expectOne(req => req.url === `${ROUTE}/preview` && req.params.get('percentOff') === '40');
    http.verify();
  }));

  it('no ar: alterar fim trava porcentagem e inicio, e manda so nome e fim', () => {
    const { http, click, input, type, submit } = render([NO_AR]);

    click('alterar-fim');
    http.expectOne(req => req.url === `${ROUTE}/preview`).flush(PREVIEW);

    expect(input('percentOff').disabled).toBe(true);
    expect(input('startsAt').disabled).toBe(true);
    expect(input('endsAt').value).toBe('2026-11-30T23:59');

    type('endsAt', '2026-12-01T23:59');
    submit();

    const patch = http.expectOne(req => req.method === 'PATCH' && req.url === `${ROUTE}/promo-1`);

    expect(patch.request.body).toEqual({ name: 'Black Friday', endsAt: '2026-12-01T23:59:00-03:00' });
  });

  it('encerrar agora pede confirmacao no card e chama a API', () => {
    const { http, click, byTestId } = render([NO_AR]);

    click('encerrar');

    expect(byTestId('confirmar-encerrar')).not.toBeNull();
    http.expectNone(req => req.url.endsWith('/end'));

    click('confirmar-encerrar');
    http.expectOne(req => req.method === 'POST' && req.url === `${ROUTE}/promo-1/end`).flush({ ...NO_AR, status: 'ENDED' });
    http.expectOne(req => req.method === 'GET' && req.url === ROUTE).flush([]);
  });

  it('apaga a agendada depois de confirmar', () => {
    const { http, click } = render([AGENDADA]);

    click('apagar');
    click('confirmar-apagar');

    http.expectOne(req => req.method === 'DELETE' && req.url === `${ROUTE}/promo-2`).flush(null);
    http.expectOne(req => req.method === 'GET' && req.url === ROUTE).flush([]);
  });

  it('mostra a mensagem da API quando ela recusa', () => {
    const { http, click, type, submit, text, fixture } = render();

    click('criar-campanha');
    http.expectOne(req => req.url === `${ROUTE}/preview`).flush(PREVIEW);
    type('startsAt', '2026-11-27T00:00');
    type('endsAt', '2026-11-30T23:59');
    submit();

    http
      .expectOne(req => req.method === 'POST')
      .flush({ message: 'Já existe uma campanha nesse período.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(text()).toContain('Já existe uma campanha nesse período.');
  });
});
