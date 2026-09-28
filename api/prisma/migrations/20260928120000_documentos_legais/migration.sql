-- Spec 022: os documentos legais saem do codigo e passam a morar no banco.
--
--   `legal_document_versions`  versoes publicadas. **Imutaveis**: nenhuma rota
--                              altera ou apaga, porque o aceite gravado no
--                              `users` aponta para o texto que estava em vigor
--                              (decisao 2).
--   `legal_document_drafts`    um rascunho por documento. Publicar copia o
--                              rascunho para uma versao nova e o apaga.
--
-- Migration estrutural: as tabelas nascem vazias. A carga inicial da
-- Privacidade e da Cookies e a migration seguinte (decisao 10).

-- CreateEnum
CREATE TYPE "legal_document_kind" AS ENUM ('TERMS', 'PRIVACY', 'COOKIES');

-- CreateEnum
CREATE TYPE "legal_change_kind" AS ENUM ('INITIAL', 'NEW_VERSION', 'CORRECTION');

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" TEXT NOT NULL,
    "kind" "legal_document_kind" NOT NULL,
    "content" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "changeKind" "legal_change_kind" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "publishedByEmail" TEXT,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_drafts" (
    "kind" "legal_document_kind" NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedByEmail" TEXT NOT NULL,

    CONSTRAINT "legal_document_drafts_pkey" PRIMARY KEY ("kind")
);

-- CreateIndex
CREATE INDEX "legal_document_versions_kind_publishedAt_idx" ON "legal_document_versions"("kind", "publishedAt" DESC);

