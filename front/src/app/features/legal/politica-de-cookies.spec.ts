import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ConsentService } from '../../core/services/consent.service';
import { flushLegalDocument, legalDocument } from './legal-page.testing';
import { PoliticaDeCookies } from './politica-de-cookies';

const PUBLISHED = legalDocument(
  'COOKIES',
  '## 1. O que são cookies\n\nTexto publicado dos cookies.\n\n## 2. Itens necessários\n\n- delcastanher.consent',
);

/**
 * A Politica de Cookies le a versao publicada (Spec 022). Os blocos "sua
 * escolha atual" e "rever preferencias" sao codigo, e nao texto, e continuam
 * no componente (decisao 9). O conteudo da carga inicial — os itens que o
 * sistema grava de fato — e conferido na API, contra a migration.
 */
describe('PoliticaDeCookies', () => {
  let fixture: ComponentFixture<PoliticaDeCookies>;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PoliticaDeCookies);
    fixture.detectChanges();
    flushLegalDocument(backend, 'COOKIES', PUBLISHED);
    fixture.detectChanges();
  });

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  it('publica as seções da versão vigente, antes dos controles', () => {
    const corpo = texto();

    expect(corpo).toContain('1. O que são cookies');
    expect(corpo).toContain('Texto publicado dos cookies.');
    expect(corpo.indexOf('Texto publicado dos cookies.')).toBeLessThan(corpo.indexOf('Sua escolha atual'));
  });

  it('exibe a versão vigente do documento', () => {
    expect(texto()).toContain('Versão vigente: 2026-09-13');
  });

  it('não tem marcador de texto a redigir', () => {
    expect(texto()).not.toContain('[TEXTO A SER REDIGIDO');
  });

  describe('controle de preferências', () => {
    it('informa que nenhuma escolha foi registrada nesta versão', () => {
      expect(texto()).toContain('ainda não registrou uma escolha nesta versão');
    });

    it('mostra a escolha registrada e permite reabrir o banner', () => {
      const consent = TestBed.inject(ConsentService);
      const reopen = spyOn(consent, 'reopen');

      consent.accept();
      fixture.detectChanges();

      expect(texto()).toContain('Você aceitou');

      // Pelo texto, e nao pelo primeiro <button> do DOM: o cabecalho e o rodape
      // tambem tem botoes, e um deles e justamente o "Preferencias de cookies"
      // do ui-legal-links, que chamaria o mesmo metodo e faria o teste passar
      // sem provar nada sobre o controle desta pagina.
      const botao = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
        b => b.textContent!.includes('Rever preferências de cookies'),
      );

      botao!.click();

      expect(reopen).toHaveBeenCalled();
    });
  });
});
