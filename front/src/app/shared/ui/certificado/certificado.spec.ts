import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CertificadoDiploma, DiplomaData } from './certificado';

const COURSE: DiplomaData = {
  scope: 'course',
  studentName: 'Maria Souza',
  courseTitle: 'Imersão RH Estratégico',
  moduleTitle: null,
  summary: null,
  workloadHours: 40,
  issuedAt: '2026-10-05T12:00:00.000Z',
  code: 'DELC-ABCD-2345',
  hash: 'f'.repeat(64),
};

const MODULE: DiplomaData = {
  ...COURSE,
  scope: 'module',
  moduleTitle: 'Módulo 1: Fundamentos do RH',
  summary: 'O que separa o RH operacional do RH que participa da estratégia.',
  workloadHours: 6,
  code: 'DELC-MODU-2345',
};

describe('CertificadoDiploma (Spec 023, Parte D)', () => {
  let fixture: ComponentFixture<CertificadoDiploma>;

  const text = () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

  function render(data: DiplomaData): void {
    fixture = TestBed.createComponent(CertificadoDiploma);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('verificationUrl', 'delcastanher.srv.br/certificado/verificar');
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CertificadoDiploma] }).compileComponents();
  });

  it('diploma do curso: aluno, curso, carga do curso e sem resumo', () => {
    render(COURSE);

    expect(text()).toContain('Certificamos que Maria Souza participou e concluiu com êxito o curso Imersão RH Estratégico');
    expect(text()).toContain('carga horária total de 40 horas');
    expect(text()).not.toContain('Conteúdo abordado');
  });

  it('diploma de modulo: titulo do modulo, curso, carga e resumo do modulo', () => {
    render(MODULE);

    expect(text()).toContain('concluiu com êxito o Módulo 1: Fundamentos do RH, do curso Imersão RH Estratégico');
    expect(text()).toContain('carga horária total de 6 horas');
    expect(text()).toContain(
      'Conteúdo abordado: O que separa o RH operacional do RH que participa da estratégia.',
    );
  });

  it('usa o singular para uma hora', () => {
    render({ ...MODULE, workloadHours: 1 });

    expect(text()).toContain('1 hora');
    expect(text()).not.toContain('1 horas');
  });

  // Carga pendente fica como placeholder, nunca inventada.
  it('mostra o placeholder da carga horaria', () => {
    render({ ...COURSE, workloadHours: null });

    expect(text()).toContain('[CARGA HORÁRIA]');
    expect(text()).toContain('LIDIANE DELCASTANHER');
  });

  it('assina com o nome em fonte cursiva, sem placeholder', () => {
    render(COURSE);

    const signature = fixture.nativeElement.querySelector('.font-signature') as HTMLElement;

    expect(signature.textContent?.trim()).toBe('Lidiane Delcastanher');
    expect(signature.getAttribute('aria-hidden')).toBe('true');
    expect(text()).not.toContain('[ASSINATURA');
  });

  it('imprime a data por extenso no fuso de Sao Paulo', () => {
    // 01:00 UTC do dia 6 ainda e dia 5 em Sao Paulo.
    render({ ...COURSE, issuedAt: '2026-10-06T01:00:00.000Z' });

    expect(text()).toContain('Blumenau, 5 de outubro de 2026');
  });

  it('traz o codigo, o hash e onde conferir a autenticidade', () => {
    render(COURSE);

    expect(text()).toContain('DELC-ABCD-2345');
    expect(text()).toContain('f'.repeat(64));
    expect(text()).toContain('delcastanher.srv.br/certificado/verificar');
  });

  it('esconde a marca d agua dos leitores de tela', () => {
    render(COURSE);

    const logos = (fixture.nativeElement as HTMLElement).querySelectorAll('ui-logo');
    const watermark = logos[0].closest('[aria-hidden="true"]');

    expect(logos.length).toBe(2);
    expect(watermark).not.toBeNull();
  });
});
