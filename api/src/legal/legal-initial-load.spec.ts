import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Conteudo da carga inicial dos documentos legais (Spec 022, decisao 10).
 *
 * Ate a Spec 022 estes asserts moravam nos specs das paginas, que tinham o
 * texto no codigo. O texto passou para o banco, e a primeira versao dele e
 * esta migration: e aqui que se prova que ela publica o que estava no ar —
 * sem marcador de texto faltante, com o contato da controladora e com o
 * complemento da plataforma declarado como tal (Spec 015).
 *
 * A migration foi gerada por script a partir das `LegalSection` do front, com
 * a ida e volta pelo parser conferida antes de gravar (commit da Task 2.6).
 */
const SQL = readFileSync(
  join(__dirname, '..', '..', 'prisma', 'migrations', '20260928120100_carga_inicial_documentos_legais', 'migration.sql'),
  'utf8',
);

/** O texto de cada documento, entre os delimitadores `$legal$`. */
function content(kind: 'PRIVACY' | 'COOKIES'): string {
  const match = SQL.match(new RegExp(`'${kind}', \\$legal\\$([\\s\\S]*?)\\$legal\\$`));

  if (!match) {
    throw new Error(`Documento ${kind} nao encontrado na migration.`);
  }

  return match[1];
}

function titles(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3));
}

const CONTACT = {
  legalName: 'DELCASTANHER Serviços Administrativos e Treinamentos Ltda.',
  cnpj: '58.216.042/0001-44',
  email: 'lidiane_delcastanher@hotmail.com',
  phone: '47-992908953',
};

describe('carga inicial dos documentos legais', () => {
  it('publica a Privacidade e a Cookies como INITIAL da versao 2026-09-13, e nao os Termos', () => {
    expect(SQL).toMatch(/'legal-privacy-2026-09-13', 'PRIVACY'/);
    expect(SQL).toMatch(/'legal-cookies-2026-09-13', 'COOKIES'/);
    expect(SQL.match(/'2026-09-13', 'INITIAL'/g)).toHaveLength(2);
    expect(SQL).not.toContain("'TERMS'");
  });

  it('nao duplica nem sobrescreve se rodar de novo', () => {
    expect(SQL.match(/ON CONFLICT \("id"\) DO NOTHING/g)).toHaveLength(2);
  });

  describe('Politica de Privacidade', () => {
    const text = content('PRIVACY');

    it('tem as quinze secoes, na ordem do documento', () => {
      expect(titles(text)).toEqual([
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

    it('nao tem marcador de texto faltante nem lacuna do original', () => {
      expect(text).not.toContain('[e-mail para assuntos de privacidade/LGPD]');
      expect(text).not.toContain('[nome, se aplicável]');
      expect(text).not.toContain('[número]');
      expect(text).not.toMatch(/\[[A-ZÀ-Ú][^\]]*\]/);
    });

    it('tem os dados da controladora e o canal de atendimento ao titular', () => {
      expect(text).toContain(CONTACT.legalName);
      expect(text).toContain(CONTACT.cnpj);
      expect(text).toContain(`E-mail: ${CONTACT.email}`);
      expect(text).toContain(`Telefone/WhatsApp: ${CONTACT.phone}`);
    });

    it('nao inventa um encarregado que a controladora nao indicou', () => {
      expect(text).not.toContain('Encarregado');
    });

    it('declara que a secao 15 e complemento da plataforma, com as promessas da Spec 014', () => {
      expect(text).toContain(
        'complemento operacional redigido pela Delcastanher, e não fazem parte do documento revisado pelo jurídico',
      );
      expect(text).toContain('Dados de cartão de crédito não são coletados');
      expect(text).toContain('6 meses');
      expect(text).toContain('certificado emitido continua armazenado');
    });
  });

  describe('Politica de Cookies', () => {
    const text = content('COOKIES');

    it('tem as seis secoes', () => {
      expect(titles(text)).toEqual([
        '1. O que são cookies',
        '2. Itens necessários ao funcionamento',
        '3. Medição de audiência',
        '4. Como gerenciar sua escolha',
        '5. Prazo de validade do consentimento',
        '6. Contato',
      ]);
    });

    it('nomeia exatamente os itens que a plataforma grava no navegador', () => {
      expect(text).toContain('delcastanher.has-session');
      expect(text).toContain('delcastanher.consent');
      expect(text).toContain('__Secure-refresh');
      expect(text).not.toContain('delcastanher.session ');
    });

    it('garante que nada de medicao carrega antes do aceite, e liga a validade a versao', () => {
      expect(text).toContain('Nada disso é carregado antes do seu aceite');
      expect(text).toContain('Não há prazo fixo de expiração');
    });

    it('aponta para o mesmo canal de atendimento da Privacidade', () => {
      expect(text).toContain(CONTACT.email);
      expect(text).toContain(CONTACT.phone);
    });
  });
});
