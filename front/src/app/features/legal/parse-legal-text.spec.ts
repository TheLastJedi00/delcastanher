import { p, ul } from './legal-section';
import { parseLegalText } from './parse-legal-text';

/**
 * Formato de texto dos documentos legais (Spec 022, decisao 1).
 *
 * O parser e o mesmo na pre-visualizacao do painel e na pagina publica: o
 * que se ve antes de publicar e o que o aluno le.
 */
describe('parseLegalText', () => {
  it('abre uma seção a cada título "## "', () => {
    const sections = parseLegalText('## 1. Objetivo\nTexto um.\n\n## 2. Escopo\nTexto dois.');

    expect(sections).toEqual([
      { title: '1. Objetivo', body: [p('Texto um.')] },
      { title: '2. Escopo', body: [p('Texto dois.')] },
    ]);
  });

  it('junta linhas seguidas num parágrafo só, até a linha em branco', () => {
    const sections = parseLegalText('## Título\nPrimeira linha\nsegunda linha.\n\nOutro parágrafo.');

    expect(sections[0].body).toEqual([p('Primeira linha segunda linha.'), p('Outro parágrafo.')]);
  });

  it('agrupa itens seguidos numa lista, separada dos parágrafos', () => {
    const sections = parseLegalText(
      '## Título\nAntes da lista:\n- item A\n- item B\nDepois da lista.',
    );

    expect(sections[0].body).toEqual([
      p('Antes da lista:'),
      ul('item A', 'item B'),
      p('Depois da lista.'),
    ]);
  });

  it('ignora linhas em branco repetidas e espaços nas pontas', () => {
    const sections = parseLegalText('\n\n  ## Título  \n\n\n\n   Texto.   \n\n\n');

    expect(sections).toEqual([{ title: 'Título', body: [p('Texto.')] }]);
  });

  it('aceita quebra de linha do Windows', () => {
    expect(parseLegalText('## Título\r\nTexto.\r\n')).toEqual([
      { title: 'Título', body: [p('Texto.')] },
    ]);
  });

  it('guarda o texto anterior ao primeiro título numa seção sem título', () => {
    const sections = parseLegalText('Preâmbulo.\n\n## 1. Primeira\nCorpo.');

    expect(sections).toEqual([
      { title: '', body: [p('Preâmbulo.')] },
      { title: '1. Primeira', body: [p('Corpo.')] },
    ]);
  });

  it('não cria seção para texto vazio', () => {
    expect(parseLegalText('')).toEqual([]);
    expect(parseLegalText('\n  \n')).toEqual([]);
  });

  it('mantém o título mesmo sem corpo', () => {
    expect(parseLegalText('## Só o título')).toEqual([{ title: 'Só o título', body: [] }]);
  });

  it('trata como parágrafo o que não é título nem item', () => {
    expect(parseLegalText('# um só\n##sem espaço\n-sem espaço')).toEqual([
      { title: '', body: [p('# um só ##sem espaço -sem espaço')] },
    ]);
  });

  it('devolve HTML como texto, sem interpretar', () => {
    const sections = parseLegalText('## <b>Título</b>\n<script>alert(1)</script>\n- <img src=x>');

    expect(sections).toEqual([
      { title: '<b>Título</b>', body: [p('<script>alert(1)</script>'), ul('<img src=x>')] },
    ]);
  });
});
