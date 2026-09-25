/**
 * Conferencia da migration de precos da Spec 019 (Task 2.4).
 *
 *   npm run spec019:precos -- snapshot   # antes do `prisma migrate deploy`
 *   npm run spec019:precos -- prova      # antes, sem gravar nada
 *   npm run spec019:precos -- verify     # depois
 *
 * - `snapshot` grava os precos atuais dos 12 modulos num arquivo temporario.
 * - `prova` roda o mesmo UPDATE da migration dentro de uma transacao desfeita
 *   no fim, com o modulo 01 reajustado para outro valor antes: prova que um
 *   preco editado no painel sobrevive a migration, sem mudar o banco.
 * - `verify` compara o banco com o snapshot: o que era provisorio (19900 ou
 *   nulo) tem o preco da tabela, o resto ficou igual, e o pacote existe com os
 *   12 modulos e os quatro lotes.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const COURSE_SLUG = 'imersao-rh';
const BUNDLE_SLUG = 'imersao-rh-lancamento';
const PROVISIONAL = 19900;
const SNAPSHOT_FILE = join(tmpdir(), 'spec019-precos-snapshot.json');

/** Tabela comercial da Spec 019, por ordem do modulo. */
const PRICES: Record<number, number> = {
  1: 19700, 2: 19700, 3: 29700, 4: 19700, 5: 19700, 6: 19700,
  7: 19700, 8: 19700, 9: 19700, 10: 19700, 11: 24700, 12: 24700,
};

const TIERS = [
  { order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20 },
  { order: 2, name: '2º Lote', priceCents: 79700, capacity: 30 },
  { order: 3, name: '3º Lote', priceCents: 99700, capacity: 50 },
  { order: 4, name: 'Preço oficial', priceCents: 149700, capacity: null },
];

/** O mesmo UPDATE da migration `20260925120100`, sem o bloco de log. */
const MIGRATION_UPDATE = `
  UPDATE "modules" AS m
  SET "priceCents" = p.price, "updatedAt" = CURRENT_TIMESTAMP
  FROM "courses" AS c,
       (VALUES
         (1, 19700), (2, 19700), (3, 29700), (4, 19700),
         (5, 19700), (6, 19700), (7, 19700), (8, 19700),
         (9, 19700), (10, 19700), (11, 24700), (12, 24700)
       ) AS p("order", price)
  WHERE m."courseId" = c."id"
    AND c."slug" = 'imersao-rh'
    AND m."order" = p."order"
    AND (m."priceCents" = 19900 OR m."priceCents" IS NULL)`;

type Snapshot = Record<string, number | null>;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  }),
});

async function modules(client: Pick<PrismaClient, 'module'> = prisma) {
  return client.module.findMany({
    where: { course: { slug: COURSE_SLUG }, order: { gte: 1, lte: 12 } },
    orderBy: { order: 'asc' },
    select: { id: true, order: true, title: true, priceCents: true },
  });
}

async function snapshot(): Promise<void> {
  const rows = await modules();
  const data: Snapshot = Object.fromEntries(rows.map((row) => [String(row.order), row.priceCents]));

  writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));

  for (const row of rows) {
    console.log(`${String(row.order).padStart(2, '0')} ${row.title}: ${row.priceCents ?? 'nulo'}`);
  }

  console.log(`\nSnapshot de ${rows.length} modulo(s) em ${SNAPSHOT_FILE}`);
}

async function prova(): Promise<void> {
  const ROLLBACK = new Error('rollback proposital');

  try {
    await prisma.$transaction(async (tx) => {
      const [first] = await modules(tx);

      if (!first) {
        throw new Error('Curso sem modulos: nada a provar.');
      }

      await tx.module.update({ where: { id: first.id }, data: { priceCents: 12345 } });
      await tx.$executeRawUnsafe(MIGRATION_UPDATE);

      const after = await modules(tx);
      const kept = after.find((row) => row.id === first.id)?.priceCents === 12345;
      const others = after.filter((row) => row.id !== first.id);
      const applied = others.every(
        (row) => row.priceCents === PRICES[row.order] || (row.priceCents !== PROVISIONAL && row.priceCents !== null),
      );

      console.log(`modulo 01 reajustado para 12345 continua 12345: ${kept ? 'sim' : 'NAO'}`);
      console.log(`demais provisorios receberam o preco da tabela: ${applied ? 'sim' : 'NAO'}`);

      if (!kept || !applied) {
        process.exitCode = 1;
      }

      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) {
      throw error;
    }

    console.log('Transacao desfeita: nada foi gravado.');
  }
}

async function verify(): Promise<void> {
  const before = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as Snapshot;
  const rows = await modules();
  let failures = 0;

  for (const row of rows) {
    const previous = before[String(row.order)];
    const wasProvisional = previous === PROVISIONAL || previous === null || previous === undefined;
    const expected = wasProvisional ? PRICES[row.order] : previous;
    const ok = row.priceCents === expected;

    failures += ok ? 0 : 1;
    console.log(
      `${ok ? 'ok ' : 'ERRO'} ${String(row.order).padStart(2, '0')} ${row.title}: ` +
        `${previous ?? 'nulo'} -> ${row.priceCents ?? 'nulo'} (esperado ${expected})`,
    );
  }

  const total = rows.reduce((sum, row) => sum + (row.priceCents ?? 0), 0);
  console.log(`\nSoma dos 12 modulos: ${total} centavos`);

  const bundle = await prisma.bundle.findUnique({
    where: { slug: BUNDLE_SLUG },
    include: { modules: true, tiers: { orderBy: { order: 'asc' } } },
  });

  if (!bundle) {
    console.log('ERRO pacote nao encontrado');
    process.exitCode = 1;
    return;
  }

  console.log(`Pacote "${bundle.title}" (${bundle.active ? 'ativo' : 'inativo'}) com ${bundle.modules.length} modulo(s)`);
  failures += bundle.modules.length === 12 ? 0 : 1;

  for (const expected of TIERS) {
    const tier = bundle.tiers.find((row) => row.order === expected.order);
    const ok =
      tier?.name === expected.name &&
      tier.priceCents === expected.priceCents &&
      tier.capacity === expected.capacity;

    failures += ok ? 0 : 1;
    console.log(
      `${ok ? 'ok ' : 'ERRO'} lote ${expected.order} ${tier?.name ?? '-'}: ` +
        `${tier?.priceCents ?? '-'} centavos, ${tier?.capacity ?? 'sem limite'} vaga(s)`,
    );
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

const mode = process.argv[2];
const run = { snapshot, prova, verify }[mode as 'snapshot' | 'prova' | 'verify'];

if (!run) {
  console.error('Uso: spec019-precos.ts snapshot | prova | verify');
  process.exit(1);
}

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
