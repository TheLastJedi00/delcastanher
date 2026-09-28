import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { COMPANY } from './company-info';
import { flushLegalDocument, legalDocument } from './legal-page.testing';
import { TermosDeUso } from './termos-de-uso';

/**
 * Termos de Uso (Spec 022, decisao 5). O texto e do juridico e entra pelo
 * painel. Antes disso a pagina diz que ele esta em preparacao — e nada mais:
 * nem roteiro de clausulas, nem marcador de texto a redigir.
 */
describe('TermosDeUso', () => {
  let fixture: ComponentFixture<TermosDeUso>;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TermosDeUso);
    fixture.detectChanges();
  });

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  describe('antes da publicação', () => {
    beforeEach(() => {
      flushLegalDocument(backend, 'TERMS', null);
      fixture.detectChanges();
    });

    it('avisa que está em preparação, com o contato da controladora', () => {
      expect(texto()).toContain(
        'Os Termos de Uso estão em preparação e serão publicados nesta página.',
      );
      expect(texto()).toContain(COMPANY.email);
    });

    it('não tem roteiro, marcador nem aviso de pendência', () => {
      expect(texto()).not.toContain('[TEXTO A SER REDIGIDO');
      expect(texto()).not.toContain('A cláusula deve cobrir');
      expect(texto()).not.toContain('Documento pendente de revisão jurídica');
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('h2').length).toBe(0);
    });
  });

  it('depois de publicados, mostra o texto do jurídico sem deploy', () => {
    flushLegalDocument(
      backend,
      'TERMS',
      legalDocument('TERMS', '## 1. Aceitação dos termos\n\nTexto do jurídico.', '2026-09-30'),
    );
    fixture.detectChanges();

    expect(texto()).toContain('1. Aceitação dos termos');
    expect(texto()).toContain('Texto do jurídico.');
    expect(texto()).toContain('Versão vigente: 2026-09-30');
    expect(texto()).not.toContain('em preparação');
  });
});
