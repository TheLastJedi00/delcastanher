-- Spec 019: o pacote de lancamento e os lotes.
--
--   `bundles`         pacote vendido como um item so na loja (decisao 2).
--   `bundle_modules`  os modulos do pacote, listados um a um.
--   `bundle_tiers`    os lotes, com preco e vagas. Nao ha coluna "lote atual":
--                     o vigente e derivado das vendas (decisao 3).
--   `orders`          ganha pacote, lote e os snapshots do nome de cada um
--                     (decisao 6), e o indice da contagem de vagas.
--
-- Esta migration so cria estrutura. Os precos reais e o pacote semeado vem na
-- migration seguinte, de dados, para que cada uma tenha um motivo so.
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "bundleId" TEXT,
ADD COLUMN     "bundleTierId" TEXT,
ADD COLUMN     "bundleTitleSnapshot" TEXT,
ADD COLUMN     "tierNameSnapshot" TEXT;

-- CreateTable
CREATE TABLE "bundles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_modules" (
    "bundleId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "bundle_modules_pkey" PRIMARY KEY ("bundleId","moduleId")
);

-- CreateTable
CREATE TABLE "bundle_tiers" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundle_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bundles_slug_key" ON "bundles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_tiers_bundleId_order_key" ON "bundle_tiers"("bundleId", "order");

-- CreateIndex
CREATE INDEX "orders_bundleTierId_status_idx" ON "orders"("bundleTierId", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_bundleTierId_fkey" FOREIGN KEY ("bundleTierId") REFERENCES "bundle_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_modules" ADD CONSTRAINT "bundle_modules_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_modules" ADD CONSTRAINT "bundle_modules_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_tiers" ADD CONSTRAINT "bundle_tiers_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

