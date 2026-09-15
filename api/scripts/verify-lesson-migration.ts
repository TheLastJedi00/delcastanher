/**
 * Confere que a migration da Spec 012 moveu os dados sem perder progresso nem
 * diploma (Task 1.4).
 *
 *   npm run migration:snapshot   # ANTES de `prisma migrate deploy`
 *   npm run migration:verify     # DEPOIS
 *
 * Por que um script e nao um `.spec.ts`: a suite do `api/` e inteiramente
 * unitaria, com o `PrismaService` mockado (mesmo padrao desde a Spec 005), e
 * nao existe harness de banco de teste. Um teste de migration precisa de
 * Postgres real com os dados anteriores — e o que ha e o banco de
 * desenvolvimento no Neon. Este script e o teste: ele falha com codigo 1 se
 * qualquer invariante quebrar, e roda tambem na verificacao final (Task 9.4).
 *
 * Fala com o banco por `pg`, e nao pelo Prisma Client, de proposito: no
 * instante do snapshot o schema do banco ainda e o antigo, e um client gerado
 * a partir do schema novo nao consegue ler `module_progress`.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';

const SNAPSHOT_PATH = resolve(__dirname, '../.migration-snapshot.json');

/** Estado que precisa sobreviver a migration, por aluno e por modulo. */
interface Snapshot {
  takenAt: string;
  moduleCount: number;
  materialsByModule: Record<string, number>;
  completionsByUser: Record<string, string[]>;
  activeCertificateCodes: string[];
  modulesWithVideo: string[];
}

function databaseUrl(): string {
  const url = process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'];

  if (!url) {
    throw new Error('DATABASE_URL nao definida. Rode com o .env do api/ carregado.');
  }

  return url;
}

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Agrupa `[chave, valor]` em `{ chave: [valores] }`. */
function group(rows: { key: string; value: string }[]): Record<string, string[]> {
  return rows.reduce<Record<string, string[]>>((acc, row) => {
    (acc[row.key] ??= []).push(row.value);

    return acc;
  }, {});
}

async function snapshot(): Promise<void> {
  const data = await withClient(async (client) => {
    const modules = await client.query<{ id: string; hasVideo: boolean }>(
      'SELECT "id", "videoStoragePath" IS NOT NULL AS "hasVideo" FROM "modules" ORDER BY "order"',
    );

    const materials = await client.query<{ moduleId: string; count: string }>(
      'SELECT "moduleId", COUNT(*)::text AS count FROM "materials" GROUP BY "moduleId"',
    );

    const completions = await client.query<{ key: string; value: string }>(
      'SELECT "userId" AS key, "moduleId" AS value FROM "module_progress"',
    );

    const certificates = await client.query<{ code: string }>(
      `SELECT "code" FROM "certificates" WHERE "status" = 'ACTIVE' ORDER BY "code"`,
    );

    return {
      takenAt: new Date().toISOString(),
      moduleCount: modules.rowCount ?? 0,
      materialsByModule: Object.fromEntries(
        materials.rows.map((row) => [row.moduleId, Number(row.count)]),
      ),
      completionsByUser: group(completions.rows),
      activeCertificateCodes: certificates.rows.map((row) => row.code),
      modulesWithVideo: modules.rows.filter((row) => row.hasVideo).map((row) => row.id),
    } satisfies Snapshot;
  });

  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2), 'utf8');

  console.log(`Snapshot gravado em ${SNAPSHOT_PATH}`);
  console.log(
    `  ${data.moduleCount} modulos, ${data.modulesWithVideo.length} com video, ` +
      `${Object.keys(data.completionsByUser).length} alunos com progresso, ` +
      `${data.activeCertificateCodes.length} certificados ativos.`,
  );
}

async function verify(): Promise<void> {
  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `Snapshot ausente (${SNAPSHOT_PATH}). Rode "npm run migration:snapshot" antes da migration.`,
    );
  }

  const before = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
  const failures: string[] = [];

  await withClient(async (client) => {
    const lessons = await client.query<{
      id: string;
      moduleId: string;
      order: number;
      hasVideo: boolean;
    }>(
      'SELECT "id", "moduleId", "order", "videoStoragePath" IS NOT NULL AS "hasVideo" FROM "lessons"',
    );

    // 1. Uma aula por modulo, todas em `order` 1.
    const byModule = new Map<string, number>();
    for (const lesson of lessons.rows) {
      byModule.set(lesson.moduleId, (byModule.get(lesson.moduleId) ?? 0) + 1);
    }

    if (byModule.size !== before.moduleCount) {
      failures.push(
        `Modulos com aula: ${byModule.size}, esperado ${before.moduleCount}.`,
      );
    }

    const duplicated = [...byModule.entries()].filter(([, count]) => count !== 1);
    if (duplicated.length > 0) {
      failures.push(`Modulos com numero de aulas diferente de 1: ${duplicated.length}.`);
    }

    // 2. O video seguiu para a aula.
    const lessonsWithVideo = lessons.rows.filter((row) => row.hasVideo).map((row) => row.moduleId);
    const missingVideo = before.modulesWithVideo.filter((id) => !lessonsWithVideo.includes(id));
    if (missingVideo.length > 0) {
      failures.push(`Modulos que tinham video e cuja aula ficou sem: ${missingVideo.join(', ')}.`);
    }

    // 3. Materiais repontuados, na mesma quantidade por modulo.
    const materials = await client.query<{ moduleId: string; count: string }>(
      `SELECT l."moduleId", COUNT(*)::text AS count
         FROM "materials" mat
         JOIN "lessons" l ON l."id" = mat."lessonId"
        GROUP BY l."moduleId"`,
    );
    const afterMaterials = Object.fromEntries(
      materials.rows.map((row) => [row.moduleId, Number(row.count)]),
    );

    for (const [moduleId, count] of Object.entries(before.materialsByModule)) {
      if (afterMaterials[moduleId] !== count) {
        failures.push(
          `Materiais do modulo ${moduleId}: ${afterMaterials[moduleId] ?? 0}, esperado ${count}.`,
        );
      }
    }

    const orphans = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "materials" WHERE "lessonId" IS NULL',
    );
    if (Number(orphans.rows[0].count) > 0) {
      failures.push(`Materiais sem aula: ${orphans.rows[0].count}.`);
    }

    // 4. Progresso preservado: a conclusao de cada modulo virou a conclusao da
    //    aula 1 daquele modulo, aluno por aluno.
    const progress = await client.query<{ key: string; value: string }>(
      `SELECT lp."userId" AS key, l."moduleId" AS value
         FROM "lesson_progress" lp
         JOIN "lessons" l ON l."id" = lp."lessonId"`,
    );
    const afterCompletions = group(progress.rows);

    for (const [userId, modules] of Object.entries(before.completionsByUser)) {
      const now = (afterCompletions[userId] ?? []).slice().sort();
      const then = modules.slice().sort();

      if (now.join(',') !== then.join(',')) {
        failures.push(
          `Progresso do aluno ${userId} mudou: antes [${then.join(', ')}], depois [${now.join(', ')}].`,
        );
      }
    }

    // 5. Nenhum diploma perdido nem revogado pela migration.
    const certificates = await client.query<{ code: string }>(
      `SELECT "code" FROM "certificates" WHERE "status" = 'ACTIVE' ORDER BY "code"`,
    );
    const afterCodes = certificates.rows.map((row) => row.code);
    const lost = before.activeCertificateCodes.filter((code) => !afterCodes.includes(code));

    if (lost.length > 0) {
      failures.push(`Certificados ativos que desapareceram: ${lost.join(', ')}.`);
    }

    // 6. O antigo saiu de verdade.
    const leftovers = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'module_progress'`,
    );
    if ((leftovers.rowCount ?? 0) > 0) {
      failures.push('A tabela "module_progress" ainda existe.');
    }

    const videoColumns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'modules'
          AND column_name IN ('videoStoragePath', 'muxAssetId', 'muxPlaybackId', 'videoStatus')`,
    );
    if ((videoColumns.rowCount ?? 0) > 0) {
      failures.push(
        `"modules" ainda tem colunas de video: ${videoColumns.rows.map((r) => r.column_name).join(', ')}.`,
      );
    }

    // 7. O diploma de modulo nao pode mais ser apagado em cascata (decisao 15).
    const rule = await client.query<{ confdeltype: string }>(
      `SELECT confdeltype FROM pg_constraint WHERE conname = 'certificates_moduleId_fkey'`,
    );
    if (rule.rows[0]?.confdeltype !== 'r') {
      failures.push(
        `FK certificates_moduleId_fkey com ON DELETE "${rule.rows[0]?.confdeltype}", esperado "r" (RESTRICT).`,
      );
    }
  });

  if (failures.length > 0) {
    console.error('Migration NAO preservou os dados:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log('Migration verificada: uma aula por modulo, video, materiais, progresso');
  console.log('e certificados preservados, estruturas antigas removidas.');
}

const mode = process.argv[2];

const run = mode === 'snapshot' ? snapshot : mode === 'verify' ? verify : null;

if (!run) {
  console.error('Uso: verify-lesson-migration.ts <snapshot|verify>');
  process.exit(1);
}

run().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
