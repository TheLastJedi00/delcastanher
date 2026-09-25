import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ConexaoMercadoPago } from './conexao-mercado-pago';

function render(query: Record<string, string>): HTMLElement {
  TestBed.configureTestingModule({
    imports: [ConexaoMercadoPago],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
    ],
  });

  const fixture = TestBed.createComponent(ConexaoMercadoPago);
  fixture.detectChanges();

  return fixture.nativeElement as HTMLElement;
}

const status = (el: HTMLElement) => el.querySelector('[role="status"]') as HTMLElement;

/** Spec 020, decisao 5. */
describe('ConexaoMercadoPago', () => {
  it('confirma a conta conectada', () => {
    const el = render({ resultado: 'ok' });

    expect(status(el).dataset['resultado']).toBe('ok');
    expect(status(el).textContent).toContain('Conta conectada');
  });

  const cases: [string, string][] = [
    ['expirado', 'Este link venceu'],
    ['usado', 'Este link já foi usado'],
    ['negado', 'A autorização foi recusada'],
    ['sem_offline_access', 'A autorização veio incompleta'],
    ['falha', 'Não foi possível conectar a conta'],
  ];

  for (const [motivo, title] of cases) {
    it(`explica o motivo "${motivo}"`, () => {
      const el = render({ resultado: 'erro', motivo });

      expect(status(el).dataset['resultado']).toBe('erro');
      expect(status(el).textContent).toContain(title);
    });
  }

  // Nada do que chega pela query vira texto na tela.
  it('usa texto fixo para motivo desconhecido, sem repetir a query', () => {
    const el = render({ resultado: 'erro', motivo: '<b>invalid_grant</b>' });

    expect(status(el).textContent).toContain('Não foi possível conectar a conta');
    expect(el.textContent).not.toContain('invalid_grant');
  });

  it('trata a página aberta sem query como falha, e não como sucesso', () => {
    const el = render({});

    expect(status(el).dataset['resultado']).toBe('erro');
  });
});
