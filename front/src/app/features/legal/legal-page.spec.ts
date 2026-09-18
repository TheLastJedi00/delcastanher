import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LEGAL_PLACEHOLDER, LegalPage, LegalSection, p, ul } from './legal-page';

@Component({
  selector: 'app-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage],
  template: `
    <app-legal-page
      title="Documento de teste"
      summary="Resumo de teste"
      [sections]="sections()"
      policyVersion="2026-09-13"
      [pending]="pending()" />
  `,
})
class Host {
  readonly sections = signal<LegalSection[]>([]);
  readonly pending = signal(true);
}

/**
 * A casca legal serve dois estados desde a Spec 015: documento pendente de
 * revisao juridica, que mostra o roteiro do que a clausula deve cobrir, e
 * documento em vigor, que mostra o texto redigido.
 *
 * O que estes testes protegem e a fronteira entre os dois. Uma pagina redigida
 * que ainda exibisse o marcador `[TEXTO A SER REDIGIDO PELO JURIDICO]`, ou uma
 * pendente que perdesse o aviso de que nada ali vale, sao os dois jeitos de
 * essa casca enganar quem le — e o segundo e o que a Spec 009 (decisao 11)
 * existiu para impedir.
 */
describe('LegalPage — pendente e redigida', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
  });

  /** Texto visivel da pagina, com espacos colapsados. */
  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  describe('documento pendente', () => {
    beforeEach(() => {
      host.pending.set(true);
      host.sections.set([
        { title: '1. Cláusula pendente', topics: ['Primeiro ponto', 'Segundo ponto'] },
      ]);
      fixture.detectChanges();
    });

    it('avisa que o documento não passou por advogado', () => {
      expect(text()).toContain('Documento pendente de revisão jurídica');
    });

    it('marca o corpo como texto a ser redigido e lista o roteiro', () => {
      expect(text()).toContain(LEGAL_PLACEHOLDER);
      expect(text()).toContain('A cláusula deve cobrir');
      expect(text()).toContain('Primeiro ponto');
      expect(text()).toContain('Segundo ponto');
    });

    it('não promete reabrir o consentimento, porque o documento não está em vigor', () => {
      expect(text()).toContain('Versão vigente: 2026-09-13');
      expect(text()).not.toContain('reabrem o pedido de consentimento');
    });
  });

  describe('documento redigido', () => {
    beforeEach(() => {
      host.pending.set(false);
      host.sections.set([
        {
          title: '1. Cláusula redigida',
          body: [
            p('Primeiro parágrafo do documento.'),
            ul('Item de lista A', 'Item de lista B'),
            p('Parágrafo de fechamento.'),
          ],
        },
      ]);
      fixture.detectChanges();
    });

    it('não exibe o aviso de pendência nem o marcador de texto faltante', () => {
      expect(text()).not.toContain('Documento pendente de revisão jurídica');
      expect(text()).not.toContain(LEGAL_PLACEHOLDER);
      expect(text()).not.toContain('A cláusula deve cobrir');
    });

    it('renderiza parágrafos e listas na ordem recebida', () => {
      const corpo = text();
      const posParagrafo = corpo.indexOf('Primeiro parágrafo do documento.');
      const posItem = corpo.indexOf('Item de lista A');
      const posFecho = corpo.indexOf('Parágrafo de fechamento.');

      expect(posParagrafo).toBeGreaterThan(-1);
      expect(posItem).toBeGreaterThan(posParagrafo);
      expect(posFecho).toBeGreaterThan(posItem);
    });

    it('usa <li> para os itens da lista, e não parágrafos soltos', () => {
      const itens = (fixture.nativeElement as HTMLElement).querySelectorAll('li');

      expect(Array.from(itens).map(li => li.textContent!.trim())).toEqual([
        'Item de lista A',
        'Item de lista B',
      ]);
    });

    it('promete reabrir o consentimento quando o documento está em vigor', () => {
      expect(text()).toContain('reabrem o pedido de consentimento de cookies');
    });
  });

  it('mantém a hierarquia de cabeçalhos: um h1 de título e um h2 por cláusula', () => {
    host.pending.set(false);
    host.sections.set([
      { title: '1. Primeira', body: [p('a')] },
      { title: '2. Segunda', body: [p('b')] },
    ]);
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;

    expect(elemento.querySelectorAll('h1').length).toBe(1);
    expect(Array.from(elemento.querySelectorAll('h2')).map(h => h.textContent!.trim())).toEqual([
      '1. Primeira',
      '2. Segunda',
    ]);
  });
});
