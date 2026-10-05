import { Injectable } from '@angular/core';
import type { jsPDF } from 'jspdf';

/** A4 paisagem em milimetros, o formato do `@page` do diploma. */
const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;

/**
 * Largura em que a folha e desenhada para o PDF: o A4 a 96 dpi. Fixa, para o
 * arquivo baixado no celular sair igual ao do computador — a folha escala pela
 * propria largura (`cqw`, Spec 023, Parte D).
 */
const RENDER_WIDTH_PX = 1123;

/**
 * "Baixar PDF" do certificado (Spec 024, Task 4.2; decisao D8).
 *
 * Gerado no navegador, a partir da mesma folha `ui-certificado` que o aluno ve:
 * nao existe um segundo layout no servidor. O preco aceito e o texto do PDF ser
 * imagem; codigo e hash continuam legiveis e conferiveis no portal publico.
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
    const [{ default: html2canvas }, { jsPDF: JsPdf }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(sheet, {
      scale: 2,
      backgroundColor: null,
      logging: false,
      // So a copia muda de largura: a folha na tela fica como esta.
      onclone: (_document, clone) => {
        clone.style.width = `${RENDER_WIDTH_PX}px`;
      },
    });

    const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);

    return pdf;
  }
}

/** Nome do arquivo baixado: o codigo identifica o diploma sem expor o aluno. */
export function certificateFileName(code: string): string {
  return `certificado-${code}.pdf`;
}
