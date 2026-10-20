import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminBundle } from '../../../core/services/admin-bundles.service';
import { AdminPacote } from './admin-pacote';

const URL = '/admin/bundles/imersao-rh-lancamento';

/** O pacote depois da migration da Spec 027: o Fundador encerrado e o preco unico. */
const BUNDLE: AdminBundle = {
  slug: 'imersao-rh-lancamento',
  title: 'Imersão RH Estratégico — Pacote completo',
  active: true,
  tiers: [
    { id: 't4', order: 4, name: 'Preço único', priceCents: 98900, capacity: null, occupied: 2, current: true },
    { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 3, occupied: 3, current: false },
  ],
};

/** Spec 019, decisao 13; Spec 027, decisao 4. */
describe('AdminPacote', () => {
  let fixture: ComponentFixture<AdminPacote>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => (el().textContent ?? '').replace(/ /g, ' ');
  const buttons = () => Array.from(el().querySelectorAll('button')) as HTMLButtonElement[];

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

  function edit(price: string): void {
    buttons()
      .find(button => button.textContent?.includes('Editar preço'))!
      .click();
    fixture.detectChanges();

    const form = el().querySelector('form') as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;

    input.value = price;
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('mostra o preço único e o Fundador como lote encerrado, só para leitura', () => {
    expect(el().querySelector('[data-testid="preco-unico"]')?.textContent?.replace(/ /g, ' ')).toContain('R$ 989,00');

    const closed = Array.from(el().querySelectorAll('tbody tr')) as HTMLElement[];

    expect(text()).toContain('Lotes encerrados');
    expect(closed.length).toBe(1);
    expect(closed[0].textContent).toContain('Lote Fundador');
    expect(closed[0].textContent).toContain('3');
    expect(closed[0].querySelector('button')).toBeNull();
    expect(buttons().filter(button => button.textContent?.includes('Editar')).length).toBe(1);
  });

  it('não fala em vagas', () => {
    expect(text()).not.toContain('Vagas');
    expect(text()).not.toContain('Sem limite');
  });

  it('salva só o preço, em centavos, no último lote, e recarrega', () => {
    edit('999,00');

    const request = backend.expectOne(req => req.method === 'PATCH' && req.url.endsWith(`${URL}/tiers/t4`));

    expect(request.request.body).toEqual({ priceCents: 99900 });
    request.flush({ ...BUNDLE.tiers[0], priceCents: 99900 });

    backend.expectOne(req => req.method === 'GET' && req.url.endsWith(URL)).flush(BUNDLE);
  });

  it('mostra no formulário a recusa do servidor', () => {
    edit('989,00');

    backend
      .expectOne(req => req.method === 'PATCH')
      .flush({ message: 'Este lote foi encerrado e não pode ser editado.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(el().querySelector('form [role="alert"]')?.textContent).toContain('encerrado');
  });

  it('não envia preço ilegível', () => {
    edit('abc');

    backend.expectNone(req => req.method === 'PATCH');
    expect(el().querySelector('form [role="alert"]')?.textContent).toContain('maior que zero');
  });
});
