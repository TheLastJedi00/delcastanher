-- Spec 012: o modulo vira container de aulas.
--
-- Esta migration nao e apenas estrutural: ela **move dados**. Ha 12 modulos
-- semeados com video real no Mux, materiais no bucket, progresso de alunos e
-- certificados emitidos. A ordem abaixo e a da decisao 3 do `context.md` —
-- criar o novo, repontuar, converter e só então derrubar o antigo — para que
-- no corte nenhum aluno veja o percentual mudar e nenhum diploma deixe de
-- valer.
--
-- Cada modulo de hoje vira um modulo com **uma** aula (`order` 1), que carrega
-- o video e recebe os materiais daquele modulo.

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "videoStoragePath" TEXT,
    "videoOriginalName" TEXT,
    "videoSizeBytes" INTEGER,
    "muxAssetId" TEXT,
    "muxPlaybackId" TEXT,
    "videoStatus" "video_status",
    "videoError" TEXT,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lessons_moduleId_order_key" ON "lessons"("moduleId", "order");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_userId_lessonId_key" ON "lesson_progress"("userId", "lessonId");

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- DADOS 1/3: uma aula por modulo, carregando o video que era do modulo.
--
-- O id nao e um cuid (o banco nao gera cuid), e nao precisa ser: id e opaco, e
-- o que o codigo faz com ele e comparar e referenciar. As aulas criadas daqui
-- em diante, pelo Prisma, seguem nascendo com cuid.
INSERT INTO "lessons" (
    "id", "moduleId", "order", "title", "summary",
    "videoStoragePath", "videoOriginalName", "videoSizeBytes",
    "muxAssetId", "muxPlaybackId", "videoStatus", "videoError",
    "createdAt", "updatedAt"
)
SELECT
    replace(gen_random_uuid()::text, '-', ''),
    m."id",
    1,
    m."title",
    m."summary",
    m."videoStoragePath",
    m."videoOriginalName",
    m."videoSizeBytes",
    m."muxAssetId",
    m."muxPlaybackId",
    m."videoStatus",
    m."videoError",
    m."createdAt",
    CURRENT_TIMESTAMP
FROM "modules" m;


-- DADOS 2/3: os materiais passam a pertencer a aula do seu modulo.
ALTER TABLE "materials" ADD COLUMN "lessonId" TEXT;

UPDATE "materials" mat
SET "lessonId" = l."id"
FROM "lessons" l
WHERE l."moduleId" = mat."moduleId" AND l."order" = 1;

-- Material sem aula correspondente nao existe (toda aula 1 foi criada acima),
-- mas a coluna so pode virar NOT NULL depois do UPDATE.
ALTER TABLE "materials" ALTER COLUMN "lessonId" SET NOT NULL;

DROP INDEX "materials_moduleId_order_idx";

ALTER TABLE "materials" DROP CONSTRAINT "materials_moduleId_fkey";

ALTER TABLE "materials" DROP COLUMN "moduleId";

-- CreateIndex
CREATE INDEX "materials_lessonId_order_idx" ON "materials"("lessonId", "order");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- DADOS 3/3: cada conclusao de modulo vira a conclusao da aula equivalente.
--
-- E aqui que o percentual do aluno se preserva: com uma aula por modulo,
-- "modulo concluido" e "aula concluida" contam a mesma coisa, e a conclusao
-- derivada do modulo (decisao 5) devolve exatamente o estado anterior.
INSERT INTO "lesson_progress" ("id", "userId", "lessonId", "completedAt")
SELECT
    replace(gen_random_uuid()::text, '-', ''),
    mp."userId",
    l."id",
    mp."completedAt"
FROM "module_progress" mp
JOIN "lessons" l ON l."moduleId" = mp."moduleId" AND l."order" = 1;


-- Só agora o antigo sai: o video deixa de ser coluna de modulo e a conclusao
-- por modulo deixa de ser tabela.
ALTER TABLE "modules" DROP COLUMN "videoStoragePath",
DROP COLUMN "videoOriginalName",
DROP COLUMN "videoSizeBytes",
DROP COLUMN "muxAssetId",
DROP COLUMN "muxPlaybackId",
DROP COLUMN "videoStatus",
DROP COLUMN "videoError";

DROP TABLE "module_progress";


-- `Restrict` no lugar de `Cascade` (decisao 15): com a administracao de
-- modulos aberta pela Spec 012, apagar um modulo em `Cascade` apagaria os
-- diplomas emitidos dele em silencio. O indice unico parcial
-- `certificates_user_course_unique` da Spec 010 nao e tocado aqui e continua
-- valendo — nao o remova ao gerar migrations futuras.
ALTER TABLE "certificates" DROP CONSTRAINT "certificates_moduleId_fkey";

ALTER TABLE "certificates" ADD CONSTRAINT "certificates_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
