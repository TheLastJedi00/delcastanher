import { Injectable } from '@angular/core';
import type { jsPDF } from 'jspdf';

/** A4 paisagem em milimetros, o formato do `@page` do diploma. */
const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;

/**
 * Largura final da imagem, em pixels: o A4 a 96 dpi, dobrado para o texto sair
 * nitido. Fixa, para o PDF do celular sair igual ao do computador. A folha nao
 * muda de tamanho: ela e um SVG, desenhado direto nesta largura, e escala pela
 * propria largura (`cqw`, Spec 023, Parte D).
 */
const IMAGE_WIDTH_PX = 1123 * 2;

/**
 * "Baixar PDF" do certificado (Spec 024, Task 4.2; decisao D8).
 *
 * Gerado no navegador, a partir da mesma folha `ui-certificado` que o aluno ve:
 * nao existe um segundo layout no servidor. O preco aceito e o texto do PDF ser
 * imagem; codigo e hash continuam legiveis e conferiveis no portal publico.
 *
 * A captura e do `html-to-image`, e nao do html2canvas: ele desenha pela propria
 * engine do navegador (SVG `foreignObject`), entao o texto sai na mesma posicao
 * da tela. O html2canvas reimplementa o texto e deslocava as linhas do titulo e
 * da assinatura (verificacao no Chrome, 2026-10-05).
 *
 * As duas bibliotecas so carregam no clique (`import()` dinamico): sao centenas
 * de kB que a area do aluno nao precisa ate alguem pedir o arquivo.
 */
@Injectable({ providedIn: 'root' })
export class CertificatePdfService {
  async download(sheet: HTMLElement, fileName: string): Promise<void> {
    (await this.render(sheet)).save(fileName);
  }

  /** O documento pronto, sem salvar: separado para a suite conferir a pagina. */
  async render(sheet: HTMLElement): Promise<jsPDF> {
    const [{ toSvg }, { jsPDF: JsPdf }] = await Promise.all([
      import('html-to-image'),
      import('jspdf'),
    ]);

    // So o SVG vem da biblioteca; o canvas e desenhado aqui. O `toCanvas` dela
    // espera um `requestAnimationFrame`, que nao roda com a aba em segundo plano
    // — e o PDF ficaria esperando para sempre.
    const svg = await toSvg(sheet, { fontEmbedCSS: await this.fontCss() });
    const image = await loadImage(svg);

    const canvas = document.createElement('canvas');
    canvas.width = IMAGE_WIDTH_PX;
    canvas.height = Math.round((IMAGE_WIDTH_PX * A4_HEIGHT_MM) / A4_WIDTH_MM);

    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    // Fundo branco atras da folha: JPEG nao tem transparencia.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);

    return pdf;
  }

  private fontCssCache: Promise<string> | null = null;

  /**
   * As fontes da folha, embutidas no SVG da captura. Sem isso o `html-to-image`
   * embute **todas** as `@font-face` da pagina (48, com os recortes de alfabeto
   * do Google Fonts) e a captura passa de um minuto. A folha so usa a familia
   * da marca e a da assinatura no alfabeto latino: um arquivo por familia
   * (a da marca e variavel), baixado uma vez por sessao.
   */
  private fontCss(): Promise<string> {
    this.fontCssCache ??= this.buildFontCss().catch(() => '');

    return this.fontCssCache;
  }

  private async buildFontCss(): Promise<string> {
    const faces = (await Promise.all(Array.from(document.styleSheets).map(sheetCss)))
      .join('\n')
      .match(/@font-face\s*{[^}]*}/g)
      ?.filter(
        face =>
          FONT_FAMILIES.some(family => face.includes(family)) &&
          /font-style:\s*normal/.test(face) &&
          LATIN_RANGE.test(face),
      ) ?? [];

    const inlined = new Map<string, Promise<string>>();
    const css = await Promise.all(
      faces.map(async face => {
        const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(face)?.[1];

        if (!url) {
          return '';
        }

        if (!inlined.has(url)) {
          inlined.set(url, toDataUrl(url));
        }

        return face.replace(url, await (inlined.get(url) as Promise<string>));
      }),
    );

    return css.join('\n');
  }
}

/**
 * Familias da folha (`tailwind.config.js`): a da marca e a da assinatura. Fora
 * desta lista a fonte nao entra no SVG e o PDF cai na fonte padrao.
 */
const FONT_FAMILIES = ['Plus Jakarta Sans', 'Monsieur La Doulaise'];
const LATIN_RANGE = /unicode-range:\s*U\+0(000)?-0?0?FF\b/i;

/**
 * Texto de uma folha de estilos. No build de producao o Angular embute o CSS do
 * Google Fonts no `index.html` e as regras sao legiveis; no `ng serve` a folha
 * vem do dominio do Google, a leitura das regras e bloqueada, e o texto e
 * buscado pelo `href` (o Google Fonts responde com CORS).
 */
async function sheetCss(sheet: CSSStyleSheet): Promise<string> {
  try {
    return Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
  } catch {
    return sheet.href ? (await fetch(sheet.href)).text() : '';
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Falha ao desenhar a folha do certificado.'));
    image.src = src;
  });
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Nome do arquivo baixado: o codigo identifica o diploma sem expor o aluno. */
export function certificateFileName(code: string): string {
  return `certificado-${code}.pdf`;
}
