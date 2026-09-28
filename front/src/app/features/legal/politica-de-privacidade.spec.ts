import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { COMPANY } from './company-info';
import { LEGAL_PLACEHOLDER } from './legal-page';
import { PoliticaDePrivacidade } from './politica-de-privacidade';

/**
 * A pagina saiu do placeholder na Spec 015: ela publica o texto entregue pelo
 * juridico em 13/09/2026.
 *
 * O que estes testes protegem nao e a redacao — essa e conferida contra
 * `notas-originais.md`, fora daqui — e sim as tres coisas que tornariam a
 * publicacao errada: sobrar marcador de texto faltante, sobrar lacuna de
 * contato nao preenchida, ou o complemento da plataforma se passar por texto
 * revisado por advogado.
 */
describe('PoliticaDePrivacidade', () => {
  let fixture: ComponentFixture<PoliticaDePrivacidade>;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });

    fixture = TestBed.createComponent(PoliticaDePrivacidade);
    fixture.detectChanges();
  });

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  function titulos(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2')).map(
      h => h.textContent!.trim()
    );
  }

  it('publica as quinze seções, na ordem do documento', () => {
    expect(titulos()).toEqual([
      '1. Objetivo',
      '2. Quem é o responsável pelo tratamento dos dados?',
      '3. Quais dados podemos coletar?',
      '4. Para que utilizamos os dados?',
      '5. Compartilhamento de dados',
      '6. Cookies e tecnologias semelhantes',
      '7. Segurança dos dados',
      '8. Por quanto tempo guardamos os dados?',
      '9. Direitos do titular',
      '10. Como exercer seus direitos?',
      '11. Dados de crianças e adolescentes',
      '12. Transferência e armazenamento por terceiros',
      '13. Alterações desta política',
      '14. Contato',
      '15. Informações específicas desta plataforma',
    ]);
  });

  it('não é mais um documento pendente de revisão jurídica', () => {
    expect(texto()).not.toContain(LEGAL_PLACEHOLDER);
    expect(texto()).not.toContain('Documento pendente de revisão jurídica');
    expect(texto()).not.toContain('A cláusula deve cobrir');
  });

  it('não deixa nenhuma lacuna do documento original por preencher', () => {
    // A secao 10 chegou do juridico com estes tres marcadores.
    expect(texto()).not.toContain('[e-mail para assuntos de privacidade/LGPD]');
    expect(texto()).not.toContain('[nome, se aplicável]');
    expect(texto()).not.toContain('[número]');

    // Nenhum marcador de qualquer forma, inclusive os herdados de outras specs.
    expect(texto()).not.toMatch(/\[[A-ZÀ-Ú][^\]]*\]/);
  });

  it('usa os dados da controladora de company-info, e não cópias soltas', () => {
    const corpo = texto();

    expect(corpo).toContain(COMPANY.legalName);
    expect(corpo).toContain(COMPANY.cnpj);
    expect(corpo).toContain(COMPANY.email);
    expect(corpo).toContain(COMPANY.phone);
  });

  it('oferece canal de atendimento ao titular na seção que trata do exercício de direitos', () => {
    // Art. 18 da LGPD: o direito sem canal para exerce-lo nao e um direito.
    expect(texto()).toContain(`E-mail: ${COMPANY.email}`);
    expect(texto()).toContain(`Telefone/WhatsApp: ${COMPANY.phone}`);
  });

  it('não inventa um encarregado que a controladora não indicou', () => {
    expect(texto()).not.toContain('Encarregado');
  });

  it('declara que a seção 15 é complemento da plataforma, e não texto do jurídico', () => {
    expect(texto()).toContain(
      'complemento operacional redigido pela Delcastanher, e não fazem parte do documento revisado pelo jurídico'
    );
  });

  it('cumpre na seção 15 as promessas que a Spec 014 fez ao comprador', () => {
    const corpo = texto();

    expect(corpo).toContain('Dados de cartão de crédito não são coletados');
    expect(corpo).toContain('Mercado Pago');
    expect(corpo).toContain('só são carregados após o consentimento');
    expect(corpo).toContain('6 meses');
    expect(corpo).toContain('certificado emitido continua armazenado');
  });

  it('fecha com a declaração de ciência do documento', () => {
    expect(texto()).toContain('Declaração de ciência');
    expect(texto()).toContain('declara ter tido acesso a esta Política de Privacidade');
  });
});
