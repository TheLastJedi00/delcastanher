/**
 * Carga inicial dos documentos legais da Spec 022 (Task 2.6, decisao 10).
 *
 *   npm run spec022:carga-legal            # gera a migration
 *   npm run spec022:carga-legal -- check   # confere a migration gravada
 *
 * O texto da Politica de Privacidade e da Politica de Cookies que estava no ar
 * saia de `LegalSection` no codigo do front. Esta carga o converte pelo
 * `formatLegalText`, e nao por redigitacao: a Privacidade e verbatim do
 * juridico, e redigitar e o jeito de introduzir erro.
 *
 * Antes de escrever, confere que `parseLegalText` sobre o texto gerado devolve
 * exatamente as secoes do codigo — nenhuma palavra muda na troca. Os dados de
 * `company-info.ts` (razao social, CNPJ, contato) ja vem resolvidos nas
 * secoes, e entram como texto literal na versao.
 */
import { deepStrictEqual } from 'node:assert';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LegalSection } from '../../front/src/app/features/legal/legal-section';
import { formatLegalText, parseLegalText } from '../../front/src/app/features/legal/parse-legal-text';
import { COOKIES_SECTIONS } from '../../front/src/app/features/legal/politica-de-cookies.sections';
import { PRIVACY_SECTIONS } from '../../front/src/app/features/legal/politica-de-privacidade.sections';

const MIGRATION_DIR = join(__dirname, '..', 'prisma', 'migrations', '20260928120100_carga_inicial_documentos_legais');
const MIGRATION_FILE = join(MIGRATION_DIR, 'migration.sql');

/** A versao que o front e a API usavam como constante (Spec 015). */
const POLICY_VERSION = '2026-09-13';
/** Meio-dia UTC: 13/09 em Brasilia, a data do documento do juridico. */
const PUBLISHED_AT = '2026-09-13 12:00:00';
/** Delimitador do texto no SQL. Conferido: nao aparece em nenhum documento. */
const QUOTE = '$legal$';

const DOCUMENTS: { id: string; kind: 'PRIVACY' | 'COOKIES'; sections: readonly LegalSection[] }[] = [
  { id: 'legal-privacy-2026-09-13', kind: 'PRIVACY', sections: PRIVACY_SECTIONS },
  { id: 'legal-cookies-2026-09-13', kind: 'COOKIES', sections: COOKIES_SECTIONS },
];

function contentOf(sections: readonly LegalSection[]): string {
  const text = formatLegalText(sections);

  deepStrictEqual(parseLegalText(text), [...sections], 'o texto gerado nao volta as mesmas secoes');

  if (text.includes(QUOTE)) {
    throw new Error(`O texto contem o delimitador ${QUOTE}.`);
  }

  return text;
}

function migration(): string {
  const inserts = DOCUMENTS.map(
    ({ id, kind, sections }) =>
      `INSERT INTO "legal_document_versions" ("id", "kind", "content", "policyVersion", "changeKind", "publishedAt", "publishedById", "publishedByEmail")\n` +
      `VALUES ('${id}', '${kind}', ${QUOTE}${contentOf(sections)}${QUOTE}, '${POLICY_VERSION}', 'INITIAL', '${PUBLISHED_AT}', NULL, NULL)\n` +
      `ON CONFLICT ("id") DO NOTHING;`,
  );

  return [
    '-- Spec 022, decisao 10: carga inicial dos documentos legais.',
    '--',
    '-- A Politica de Privacidade e a Politica de Cookies entram ja publicadas,',
    '-- com o texto que estava no ar, `policyVersion = 2026-09-13` e',
    '-- `changeKind = INITIAL`. Os Termos de Uso **nao** ganham versao: sao',
    '-- publicados pelo painel quando o texto do juridico chegar.',
    '--',
    '-- Gerada por `npm run spec022:carga-legal`, a partir das `LegalSection` do',
    '-- front, e nao redigitada. O script confere que o texto volta as mesmas',
    '-- secoes pelo parser antes de escrever este arquivo.',
    '--',
    '-- Os dados da controladora (razao social, CNPJ, contato) entram como texto',
    '-- literal: muda-los passa a ser uma publicacao de correcao pelo painel.',
    '--',
    '-- `ON CONFLICT DO NOTHING`: rodar de novo nao duplica nem sobrescreve.',
    '',
    ...inserts.map((insert) => `${insert}\n`),
  ].join('\n');
}

const generated = migration();

if (process.argv[2] === 'check') {
  const saved = readFileSync(MIGRATION_FILE, 'utf8').replace(/\r\n/g, '\n');

  if (saved !== generated) {
    throw new Error('A migration gravada difere do texto que esta no codigo.');
  }

  console.log('Migration confere com as secoes do codigo.');
} else {
  mkdirSync(MIGRATION_DIR, { recursive: true });
  writeFileSync(MIGRATION_FILE, generated);

  for (const { kind, sections } of DOCUMENTS) {
    console.log(`${kind}: ${sections.length} secoes, ${contentOf(sections).length} caracteres`);
  }

  console.log(`Gravada em ${MIGRATION_FILE}`);
}
