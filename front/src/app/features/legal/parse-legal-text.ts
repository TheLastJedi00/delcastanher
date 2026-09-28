import { LegalBlock, LegalSection } from './legal-section';

/** Inicio de titulo de secao: `## 1. Objetivo`. */
const HEADING = '## ';
/** Inicio de item de lista: `- item`. */
const ITEM = '- ';

/**
 * Converte o texto dos documentos legais em secoes (Spec 022, decisao 1).
 *
 * O formato tem tres construcoes, exatamente as que a `LegalPage` renderiza:
 *
 * ```
 * ## 1. Titulo da secao
 * Paragrafo, que pode ocupar varias linhas ate uma linha em branco.
 *
 * - item de lista
 * - outro item
 * ```
 *
 * Nao ha erro de sintaxe: linha que nao e titulo nem item vira paragrafo, e o
 * pior caso e um paragrafo onde se queria um titulo — que a pre-visualizacao
 * mostra antes de publicar. O texto sai como string, e nunca como HTML: quem
 * renderiza interpola, e um `<script>` colado aparece como texto.
 *
 * E a mesma funcao na pre-visualizacao do painel e na pagina publica, para que
 * o que se ve antes de publicar seja o que o aluno le.
 */
export function parseLegalText(text: string): LegalSection[] {
  const sections: LegalSection[] = [];

  let title: string | null = null;
  let body: LegalBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      body.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (items.length) {
      body.push({ kind: 'list', items });
      items = [];
    }
  };

  const flushSection = () => {
    flushParagraph();
    flushList();

    // Texto antes do primeiro titulo so vira secao se tiver corpo: linhas em
    // branco no topo nao podem gerar um bloco vazio.
    if (title !== null || body.length) {
      sections.push({ title: title ?? '', body });
    }

    body = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (line.startsWith(HEADING)) {
      flushSection();
      title = line.slice(HEADING.length).trim();
    } else if (line.startsWith(ITEM)) {
      flushParagraph();
      items.push(line.slice(ITEM.length).trim());
    } else if (line === '') {
      flushParagraph();
      flushList();
    } else {
      // Linha solta depois de itens encerra a lista: o item e sempre uma
      // linha so, e continua-lo na linha de baixo seria ambiguo.
      flushList();
      paragraph.push(line);
    }
  }

  flushSection();

  return sections;
}

/**
 * Caminho inverso do `parseLegalText`: escreve as secoes no formato da
 * decisao 1.
 *
 * Existe para a carga inicial (Task 2.6): o texto que estava no codigo vira
 * conteudo do banco por script, e nao redigitado. `parseLegalText` sobre a
 * saida devolve as mesmas secoes.
 */
export function formatLegalText(sections: readonly LegalSection[]): string {
  return sections
    .map(section => {
      const blocks = (section.body ?? []).map(block =>
        block.kind === 'paragraph'
          ? block.text
          : block.items.map(item => `${ITEM}${item}`).join('\n'),
      );

      return (section.title ? [`${HEADING}${section.title}`, ...blocks] : blocks).join('\n\n');
    })
    .join('\n\n');
}
