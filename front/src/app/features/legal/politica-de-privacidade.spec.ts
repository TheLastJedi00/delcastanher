import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { flushLegalDocument, legalDocument } from './legal-page.testing';
import { PoliticaDePrivacidade } from './politica-de-privacidade';

const PUBLISHED = legalDocument(
  'PRIVACY',
  '## 1. Objetivo\n\nTexto publicado da privacidade.\n\n## 2. Quem é o responsável?\n\n- item',
);

/**
 * A Politica de Privacidade le a versao publicada (Spec 022). O conteudo da
 * carga inicial — quinze secoes, sem lacuna, com o contato da controladora —
 * e conferido na API, contra a migration (`legal-initial-load.spec.ts`).
 */
describe('PoliticaDePrivacidade', () => {
  let fixture: ComponentFixture<PoliticaDePrivacidade>;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PoliticaDePrivacidade);
    fixture.detectChanges();
  });

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  function responder(doc: typeof PUBLISHED | null): void {
    flushLegalDocument(backend, 'PRIVACY', doc);
    fixture.detectChanges();
  }

  it('mostra carregando até a API responder', () => {
    expect(texto()).toContain('Carregando o documento');
  });

  it('publica as seções da versão vigente', () => {
    responder(PUBLISHED);

    const titulos = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2')).map(h =>
      h.textContent!.trim(),
    );

    expect(titulos).toEqual(['1. Objetivo', '2. Quem é o responsável?']);
    expect(texto()).toContain('Texto publicado da privacidade.');
    expect(texto()).toContain('Versão vigente: 2026-09-13');
  });

  it('fecha com a declaração de ciência junto do texto publicado', () => {
    responder(PUBLISHED);

    expect(texto()).toContain('Declaração de ciência');
    expect(texto()).toContain('declara ter tido acesso a esta Política de Privacidade');
  });

  it('sem versão publicada, avisa que está em preparação e não mostra a declaração', () => {
    responder(null);

    expect(texto()).toContain('A Política de Privacidade está em preparação');
    expect(texto()).not.toContain('Declaração de ciência');
  });

  it('não tem marcador de texto a redigir', () => {
    responder(PUBLISHED);

    expect(texto()).not.toContain('[TEXTO A SER REDIGIDO');
    expect(texto()).not.toContain('Documento pendente de revisão jurídica');
  });
});
