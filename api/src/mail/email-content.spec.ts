import { renderEmail, textToHtml, unsubscribeHeaders } from './email-content';

/**
 * Corpo do e-mail em texto simples, escapado (Spec 023, decisao B3).
 *
 * O painel nunca manda HTML: paragrafos viram `<p>`, URLs viram links e todo o
 * resto e escapado. E a mesma regra da Spec 022 (decisao 1) para os termos — o
 * texto e interpolado, e um `<script>` colado aparece como texto.
 */
describe('textToHtml', () => {
  it('separa paragrafos pela linha em branco', () => {
    expect(textToHtml('Primeiro paragrafo.\n\nSegundo paragrafo.')).toBe(
      '<p>Primeiro paragrafo.</p>\n<p>Segundo paragrafo.</p>',
    );
  });

  it('mantem a quebra simples dentro do paragrafo', () => {
    expect(textToHtml('Ola, Ana\nTudo bem?')).toBe('<p>Ola, Ana<br>Tudo bem?</p>');
  });

  it('aceita quebras do Windows e ignora linhas em branco repetidas', () => {
    expect(textToHtml('Um\r\n\r\n\r\n\r\nDois')).toBe('<p>Um</p>\n<p>Dois</p>');
  });

  it('escapa o corpo com <script>', () => {
    const html = textToHtml('<script>alert("x")</script> & <b>negrito</b>');

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;');
  });

  it('transforma URL em link, sem levar a pontuacao do fim da frase', () => {
    expect(textToHtml('Acesse https://www.delcastanher.srv.br/ava.')).toBe(
      '<p>Acesse <a href="https://www.delcastanher.srv.br/ava">https://www.delcastanher.srv.br/ava</a>.</p>',
    );
  });

  it('escapa a URL dentro do href', () => {
    const html = textToHtml('https://exemplo.com/?a=1&b=2');

    expect(html).toContain('href="https://exemplo.com/?a=1&amp;b=2"');
  });

  it('nao transforma javascript: em link', () => {
    expect(textToHtml('javascript:alert(1)')).toBe('<p>javascript:alert(1)</p>');
  });
});

describe('renderEmail', () => {
  const base = { preheader: 'Novidades da Imersao', body: 'Ola!\n\nVeja a aula nova.' };

  it('monta o HTML com o layout da marca e o texto puro equivalente', () => {
    const email = renderEmail(base);

    expect(email.html).toContain('Delcastanher');
    expect(email.html).toMatch(/<p style="[^"]+">Ola!<\/p>/);
    expect(email.text).toContain('Ola!\n\nVeja a aula nova.');
  });

  it('poe o link de descadastro no rodape do HTML e do texto, quando ha', () => {
    const email = renderEmail({ ...base, unsubscribeUrl: 'https://www.delcastanher.srv.br/descadastro?token=t' });

    expect(email.html).toContain('href="https://www.delcastanher.srv.br/descadastro?token=t"');
    expect(email.html).toContain('Cancelar inscrição');
    expect(email.text).toContain('https://www.delcastanher.srv.br/descadastro?token=t');
  });

  it('sai sem descadastro no e-mail transacional', () => {
    const email = renderEmail(base);

    expect(email.html).not.toContain('descadastro');
    expect(email.text).not.toContain('descadastro');
  });

  it('escapa o preheader', () => {
    expect(renderEmail({ ...base, preheader: '<img src=x>' }).html).not.toContain('<img src=x>');
  });
});

/**
 * Decisao B5: o Gmail e o Yahoo exigem o descadastro de um clique de quem
 * manda em volume. O `POST` vai direto a API, sem login e sem pagina.
 */
describe('unsubscribeHeaders', () => {
  it('monta List-Unsubscribe e List-Unsubscribe-Post de um clique', () => {
    expect(unsubscribeHeaders('https://api.delcastanher.srv.br/email/unsubscribe?token=t')).toEqual({
      'List-Unsubscribe': '<https://api.delcastanher.srv.br/email/unsubscribe?token=t>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
