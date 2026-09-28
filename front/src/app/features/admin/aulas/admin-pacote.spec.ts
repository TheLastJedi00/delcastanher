import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminBundle } from '../../../core/services/admin-bundles.service';
import { AdminPacote } from './admin-pacote';

const URL = '/admin/bundles/imersao-rh-lancamento';

const BUNDLE: AdminBundle = {
  slug: 'imersao-rh-lancamento',
  title: 'Pacote de Lançamento — Imersão RH Estratégico',
  active: true,
  tiers: [
    { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20, occupied: 20, current: false },
    { id: 't2', order: 2, name: '2º Lote', priceCents: 79700, capacity: 30, occupied: 4, current: true },
    { id: 't3', order: 3, name: '3º Lote', priceCents: 99700, capacity: 50, occupied: 0, current: false },
    { id: 't4', order: 4, name: 'Preço oficial', priceCents: 149700, capacity: null, occupied: 0, current: false },
  ],
};

/** Spec 019, decisao 13. */
describe('AdminPacote', () => {
  let fixture: ComponentFixture<AdminPacote>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => (el().textContent ?? '').replace(/ /g, ' ');
  const rows = () => Array.from(el().querySelectorAll('tbody tr')) as HTMLElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPacote],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPacote);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    backend.expectOne(req => req.url.endsWith(URL)).flush(BUNDLE);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  function edit(row: number, price: string, capacity: string): void {
    (rows()[row].querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const form = el().querySelector('form') as HTMLFormElement;
    const [priceInput, capacityInput] = Array.from(form.querySelectorAll('input'));

    priceInput.value = price;
    priceInput.dispatchEvent(new Event('input'));
    capacityInput.value = capacity;
    capacityInput.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('lista os lotes com preço, vagas, ocupadas e o vigente destacado', () => {
    expect(rows().length).toBe(4);
    expect(text()).toContain('🔥 Lote Fundador');
    expect(text()).toContain('R$ 590,00');
    expect(text()).toContain('Sem limite');
    expect(rows()[1].textContent).toContain('Vigente');
    expect(rows()[0].textContent).not.toContain('Vigente');
  });

  it('salva preço e vagas em centavos e recarrega os lotes', () => {
    edit(1, '849,00', '35');

    const request = backend.expectOne(req => req.method === 'PATCH' && req.url.endsWith(`${URL}/tiers/t2`));

    expect(request.request.body).toEqual({ priceCents: 84900, capacity: 35 });
    request.flush({ ...BUNDLE.tiers[1], priceCents: 84900, capacity: 35 });

    backend.expectOne(req => req.method === 'GET' && req.url.endsWith(URL)).flush(BUNDLE);
  });

  it('mostra no formulário a recusa do servidor', () => {
    edit(0, '590,00', '10');

    backend
      .expectOne(req => req.method === 'PATCH')
      .flush(
        { message: 'Este lote já tem 20 vaga(s) ocupada(s); a capacidade não pode ser menor que isso.' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(el().querySelector('form [role="alert"]')?.textContent).toContain('20 vaga(s) ocupada(s)');
  });

  it('não envia preço ilegível', () => {
    edit(0, 'abc', '20');

    backend.expectNone(req => req.method === 'PATCH');
    expect(el().querySelector('form [role="alert"]')?.textContent).toContain('maior que zero');
  });
});
