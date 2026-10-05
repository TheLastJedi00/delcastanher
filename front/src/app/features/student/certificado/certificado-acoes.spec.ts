import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CertificatePdfService } from '../../../core/services/certificate-pdf.service';
import { CertificadoAcoes } from './certificado-acoes';

/** Acoes da folha do diploma (Spec 024, Task 4.2). */
describe('CertificadoAcoes', () => {
  let fixture: ComponentFixture<CertificadoAcoes>;
  let pdf: { download: jasmine.Spy };
  const sheet = document.createElement('div');

  const el = () => fixture.nativeElement as HTMLElement;
  const buttonWith = (label: string) =>
    Array.from(el().querySelectorAll('button')).find(button =>
      button.textContent?.includes(label),
    ) as HTMLButtonElement;

  beforeEach(() => {
    pdf = { download: jasmine.createSpy('download').and.resolveTo() };

    TestBed.configureTestingModule({
      imports: [CertificadoAcoes],
      providers: [provideRouter([]), { provide: CertificatePdfService, useValue: pdf }],
    });
    fixture = TestBed.createComponent(CertificadoAcoes);
    fixture.componentRef.setInput('sheet', sheet);
    fixture.componentRef.setInput('code', 'DELC-ABCD-2345');
    fixture.detectChanges();
  });

  it('"Baixar PDF" baixa a folha com o codigo no nome, sem abrir a impressao', async () => {
    const print = spyOn(window, 'print');

    buttonWith('Baixar PDF').click();
    await fixture.whenStable();

    expect(pdf.download).toHaveBeenCalledWith(sheet, 'certificado-DELC-ABCD-2345.pdf');
    expect(print).not.toHaveBeenCalled();
  });

  it('falha ao gerar mostra o erro e aponta o Imprimir', async () => {
    pdf.download.and.rejectWith(new Error('canvas'));

    buttonWith('Baixar PDF').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('use "Imprimir"');
  });

  it('"Imprimir" continua abrindo a impressao nativa', () => {
    const print = spyOn(window, 'print');

    buttonWith('Imprimir').click();

    expect(print).toHaveBeenCalled();
  });

  it('leva a verificacao publica com o codigo', () => {
    const link = el().querySelector('a') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/certificado/verificar?codigo=DELC-ABCD-2345');
  });

  it('some no papel', () => {
    expect(el().classList).toContain('print-hidden');
  });
});
