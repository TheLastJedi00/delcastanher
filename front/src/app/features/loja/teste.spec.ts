import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { StoreService } from '../../core/services/store.service';
import { LojaTeste } from './teste';

const KEY = 'k'.repeat(43);
const PRODUCT = { title: 'Módulo de teste', summary: 'Para testar o pagamento.', priceCents: 100 };

function render() {
  TestBed.configureTestingModule({
    imports: [LojaTeste],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ chave: KEY }) } } },
    ],
  });

  const fixture = TestBed.createComponent(LojaTeste);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  const request = http.expectOne(`${environment.apiUrl}/store/test-product/${KEY}`);

  return { fixture, request, el: fixture.nativeElement as HTMLElement };
}

/** Spec 030, decisao 8: a pagina do link secreto. */
describe('LojaTeste', () => {
  it('mostra o modulo de teste e leva ao pagamento com ele escolhido', () => {
    const { fixture, request, el } = render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    request.flush(PRODUCT);
    fixture.detectChanges();

    expect(el.textContent).toContain('Módulo de teste');
    expect((el.querySelector('[data-testid="preco-teste"]')?.textContent ?? '').replace(/\s+/g, ' ')).toContain(
      'R$ 1,00',
    );

    (el.querySelector('ui-button button') as HTMLButtonElement).click();

    const store = TestBed.inject(StoreService);

    expect(store.orderTarget()).toEqual({ testKey: KEY });
    expect(store.totalCents()).toBe(100);
    expect(navigate).toHaveBeenCalledWith(['/loja/pagamento']);
  });

  it('mostra "página não encontrada" no 404, sem dizer o motivo', () => {
    const { fixture, request, el } = render();

    request.flush({ message: 'Página não encontrada.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="teste-nao-encontrado"]')?.textContent).toContain('Página não encontrada');
    expect(el.textContent).not.toContain('Módulo de teste');
  });
});

/** Spec 030: o modulo de teste no StoreService. */
describe('StoreService — modulo de teste', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('escolher o teste desfaz modulos e pacote, e escolher modulo desfaz o teste', () => {
    const store = TestBed.inject(StoreService);

    store.toggle('mod-1');
    store.selectTest(KEY, PRODUCT);

    expect(store.selection()).toEqual({ kind: 'test', key: KEY });
    expect(store.hasSelection()).toBeTrue();

    store.toggle('mod-1');

    expect(store.selectedTest()).toBeNull();
    expect(store.orderTarget()).toEqual({ moduleIds: [] });
  });

  it('limpar a selecao tira o teste', () => {
    const store = TestBed.inject(StoreService);

    store.selectTest(KEY, PRODUCT);
    store.clearSelection();

    expect(store.hasSelection()).toBeFalse();
  });
});
