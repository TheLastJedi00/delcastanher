import { TestBed } from '@angular/core/testing';
import type { jsPDF } from 'jspdf';
import { CertificatePdfService, certificateFileName } from './certificate-pdf.service';

/**
 * Geracao real do PDF no navegador do Karma (Spec 024, Task 4.2): html-to-image
 * captura a folha e o jsPDF monta o A4 paisagem.
 */
describe('CertificatePdfService', () => {
  let sheet: HTMLElement;
  let service: CertificatePdfService;

  beforeEach(() => {
    sheet = document.createElement('div');
    sheet.style.cssText = 'width:300px;height:212px;background:#244779;color:#fff';
    sheet.textContent = 'CERTIFICADO';
    document.body.appendChild(sheet);
    service = TestBed.inject(CertificatePdfService);
  });

  afterEach(() => sheet.remove());

  it('monta um PDF de uma pagina em A4 paisagem, com a imagem da folha', async () => {
    const pdf = await service.render(sheet);

    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(210, 0);
    // A folha entrou como imagem JPEG.
    expect(pdf.output()).toContain('/DCTDecode');
  });

  it('nao mexe na folha da tela', async () => {
    await service.render(sheet);

    expect(sheet.style.width).toBe('300px');
  });

  it('download salva o documento com o nome pedido', async () => {
    const save = jasmine.createSpy('save');
    spyOn(service, 'render').and.resolveTo({ save } as unknown as jsPDF);

    await service.download(sheet, 'certificado-DELC-ABCD-2345.pdf');

    expect(service.render).toHaveBeenCalledWith(sheet);
    expect(save).toHaveBeenCalledWith('certificado-DELC-ABCD-2345.pdf');
  });

  it('nome do arquivo pelo codigo do diploma', () => {
    expect(certificateFileName('DELC-ABCD-2345')).toBe('certificado-DELC-ABCD-2345.pdf');
  });
});
