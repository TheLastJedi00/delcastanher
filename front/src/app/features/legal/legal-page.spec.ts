import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { COMPANY } from './company-info';
import { LegalPage, LegalPageState } from './legal-page';
import { parseLegalText } from './parse-legal-text';

@Component({
  selector: 'app-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Documento de teste"
      summary="Resumo de teste"
      [state]="state()"
      unpublishedNotice="O documento de teste está em preparação e será publicado nesta página." />
  `,
})
class Host {
  readonly state = signal<LegalPageState>({ status: 'loading' });
}

const READY: LegalPageState = {
  status: 'ready',
  sections: parseLegalText(
    '## 1. Primeira\n\nPrimeiro parágrafo do documento.\n\n- Item de lista A\n- Item de lista B\n\nParágrafo de fechamento.\n\n## 2. Segunda\n\nb',
  ),
  policyVersion: '2026-09-13',
  publishedAt: '2026-09-13T15:00:00.000Z',
};

/**
 * A casca legal desde a Spec 022: o texto vem do banco, e a pagina mostra o
 * que esta publicado ou diz, com todas as letras, que o documento esta em
 * preparacao. Nao existe mais o modo "pendente", com roteiro e marcador de
 * texto a redigir (decisao 5).
 */
describe('LegalPage', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
  });

  /** Texto visivel da pagina, com espacos colapsados. */
  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  function show(state: LegalPageState): void {
    host.state.set(state);
    fixture.detectChanges();
  }

  describe('documento publicado', () => {
    beforeEach(() => show(READY));

    it('renderiza parágrafos e listas na ordem do texto', () => {
      const corpo = text();
      const posParagrafo = corpo.indexOf('Primeiro parágrafo do documento.');
      const posItem = corpo.indexOf('Item de lista A');
      const posFecho = corpo.indexOf('Parágrafo de fechamento.');

      expect(posParagrafo).toBeGreaterThan(-1);
      expect(posItem).toBeGreaterThan(posParagrafo);
      expect(posFecho).toBeGreaterThan(posItem);
    });

    it('usa <li> para os itens da lista', () => {
      const itens = (fixture.nativeElement as HTMLElement).querySelectorAll('li');

      expect(Array.from(itens).map(li => li.textContent!.trim())).toEqual([
        'Item de lista A',
        'Item de lista B',
      ]);
    });

    it('mostra a versão e a data, e promete reabrir o consentimento', () => {
      expect(text()).toContain('Versão vigente: 2026-09-13, publicada em 13/09/2026');
      expect(text()).toContain('reabrem o pedido de consentimento de cookies');
    });

    it('mantém a hierarquia de cabeçalhos: um h1 de título e um h2 por cláusula', () => {
      const elemento = fixture.nativeElement as HTMLElement;

      expect(elemento.querySelectorAll('h1').length).toBe(1);
      expect(Array.from(elemento.querySelectorAll('h2')).map(h => h.textContent!.trim())).toEqual([
        '1. Primeira',
        '2. Segunda',
      ]);
    });

    it('não tem marcador de texto a redigir nem roteiro', () => {
      expect(text()).not.toContain('[TEXTO A SER REDIGIDO');
      expect(text()).not.toContain('A cláusula deve cobrir');
      expect(text()).not.toContain('pendente de revisão jurídica');
    });
  });

  describe('documento não publicado', () => {
    beforeEach(() => show({ status: 'unpublished' }));

    it('diz que está em preparação, com o contato da controladora', () => {
      expect(text()).toContain('O documento de teste está em preparação e será publicado nesta página.');
      expect(text()).toContain(COMPANY.legalName);
      expect(text()).toContain(COMPANY.email);
      expect(text()).toContain(COMPANY.phone);
    });

    it('não mostra cláusula, versão, marcador nem roteiro', () => {
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('h2').length).toBe(0);
      expect(text()).not.toContain('Versão vigente');
      expect(text()).not.toContain('[TEXTO A SER REDIGIDO');
      expect(text()).not.toContain('A cláusula deve cobrir');
    });
  });

  it('carregando, avisa sem inventar texto', () => {
    show({ status: 'loading' });

    expect(text()).toContain('Carregando o documento');
    expect(text()).not.toContain('Versão vigente');
  });

  it('com falha no navegador, diz que não conseguiu carregar', () => {
    show({ status: 'error' });

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível carregar o documento',
    );
  });
});
