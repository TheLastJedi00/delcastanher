/**
 * Conteudo dos e-mails da plataforma (Spec 023, decisoes B3 e B5).
 *
 * O corpo e **texto simples**, como o dos documentos legais da Spec 022
 * (decisao 1): paragrafos viram `<p>`, URLs viram links e todo o resto e
 * escapado. O painel nunca manda HTML, e um `<script>` colado sai como texto.
 */

/** E-mail pronto para o `MailService`, em HTML e em texto puro. */
export interface RenderedEmail {
  html: string;
  text: string;
}

export interface RenderEmailInput {
  /** Corpo em texto simples. */
  body: string;
  /** Linha de resumo que o cliente de e-mail mostra ao lado do assunto. */
  preheader: string;
  /** Link da pagina de descadastro; ausente no e-mail transacional. */
  unsubscribeUrl?: string;
}

/** URL `http(s)` ate o primeiro espaco ou sinal que nao pertence a ela. */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Pontuacao que fecha a frase, e nao a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/** Cores do Design System da Spec 002: navy no cabecalho, teal-deep nos links. */
const NAVY = '#244779';
const LINK = '#12777E';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Uma linha, escapada, com as URLs viradas link. */
function linkify(line: string): string {
  let html = '';
  let last = 0;

  for (const match of line.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const url = raw.replace(TRAILING_PUNCTUATION, '');
    const start = match.index ?? 0;

    html += escapeHtml(line.slice(last, start));
    html += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
    last = start + url.length;
  }

  return html + escapeHtml(line.slice(last));
}

/** Paragrafos do texto: blocos separados por linha em branco. */
function paragraphs(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((line) => line.trim()))
    .filter((lines) => lines.some(Boolean));
}

/** O corpo em HTML: `<p>` por paragrafo e `<br>` na quebra simples. */
export function textToHtml(text: string): string {
  return paragraphs(text)
    .map((lines) => `<p>${lines.filter(Boolean).map(linkify).join('<br>')}</p>`)
    .join('\n');
}

/**
 * Layout fixo da marca: cabecalho, corpo e rodape — com o descadastro so no
 * e-mail de campanha (decisao B5). Tabelas e estilo inline porque e o que o
 * Outlook e o Gmail renderizam igual.
 */
export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const body = textToHtml(input.body).replace(
    /<p>/g,
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2b2b">',
  );

  const unsubscribe = input.unsubscribeUrl
    ? `<p style="margin:8px 0 0">Você recebe este e-mail por ser aluno(a) da Imersão RH Estratégico. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${LINK}">Cancelar inscrição</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:${NAVY};padding:20px 32px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px">Delcastanher</td></tr>
<tr><td style="padding:32px">
${body}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #eee;font-size:12px;line-height:1.5;color:#777">
<p style="margin:0">Delcastanher · Imersão RH Estratégico · <a href="https://www.delcastanher.srv.br" style="color:${LINK}">www.delcastanher.srv.br</a></p>
${unsubscribe}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const footer = ['--', 'Delcastanher · Imersão RH Estratégico · https://www.delcastanher.srv.br'];

  if (input.unsubscribeUrl) {
    footer.push(`Cancelar inscrição: ${input.unsubscribeUrl}`);
  }

  const text = `${paragraphs(input.body)
    .map((lines) => lines.filter(Boolean).join('\n'))
    .join('\n\n')}\n\n${footer.join('\n')}\n`;

  return { html, text };
}

/**
 * Cabecalhos do descadastro de um clique (RFC 8058), so no e-mail de campanha.
 * O e-mail da nota fiscal nao os leva: e documento da compra (decisao A8).
 */
export function unsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
