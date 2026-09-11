-- CreateEnum
CREATE TYPE "video_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'ERRORED');

-- DropIndex
DROP INDEX "certificates_userId_courseId_key";

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "moduleId" TEXT;

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "muxAssetId" TEXT,
ADD COLUMN     "muxPlaybackId" TEXT,
ADD COLUMN     "videoError" TEXT,
ADD COLUMN     "videoOriginalName" TEXT,
ADD COLUMN     "videoSizeBytes" INTEGER,
ADD COLUMN     "videoStatus" "video_status",
ADD COLUMN     "videoStoragePath" TEXT;

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "materials_storagePath_key" ON "materials"("storagePath");

-- CreateIndex
CREATE INDEX "materials_moduleId_order_idx" ON "materials"("moduleId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_userId_moduleId_key" ON "certificates"("userId", "moduleId");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Unicidade do diploma de CURSO (Spec 010, decisao 11).
--
-- O `@@unique([userId, moduleId])` acima cobre os diplomas de modulo, mas no
-- Postgres duas linhas com `module_id` NULL nunca colidem — sem o indice
-- parcial abaixo o mesmo aluno poderia acumular varios diplomas do curso.
-- O Prisma nao expressa indice parcial no schema, entao ele e escrito aqui e
-- fica fora do `prisma migrate diff`: nao remova ao gerar migrations futuras.
CREATE UNIQUE INDEX "certificates_user_course_unique"
  ON "certificates" ("userId", "courseId")
  WHERE "moduleId" IS NULL;
