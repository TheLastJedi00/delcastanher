-- Spec 014: a plataforma passa a cobrar, e o acesso ao conteudo passa a ter dono.
--
-- Estrutura nova:
--
--   `modules.priceCents`  preco de venda em centavos (decisao 1). Nulo = "a
--                         definir": o modulo aparece como "em breve" na loja e
--                         nenhum pedido pode inclui-lo.
--   `orders`/`order_items` a transacao, com snapshot de preco e titulo do
--                         instante da compra (decisoes 3 e 6).
--   `module_access`       o DIREITO de acesso, que e quem abre o conteudo — e
--                         nao o pagamento (decisao 4).
--
-- Esta migration tem dois backfills, e os dois sao decisoes de produto:
--
--   1. PRECO: os modulos que ja existem sobem com 19900 (R$ 199,00), valor
--      provisorio definido pelo time para destravar a integracao (decisao 1).
--      O DEFAULT da coluna continua nulo de proposito: modulo cadastrado depois
--      daqui tem o preco decidido no painel, e nao herdado por descuido.
--
--   2. ACESSO: cada usuario existente recebe 6 meses em cada modulo existente,
--      com `source = LEGACY` (decisao 20). Sem isto, ligar o paywall tiraria de
--      alunos com progresso e certificado o que eles ja tinham. O backfill e
--      idempotente (`ON CONFLICT DO NOTHING`) e so alcanca quem ja estava aqui:
--      conta criada depois desta migration entra pela loja, como todo mundo.

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "payment_method_kind" AS ENUM ('PIX', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "access_source" AS ENUM ('PURCHASE', 'COURTESY', 'LEGACY');

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "priceCents" INTEGER;

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "method" "payment_method_kind" NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "mpOrderId" TEXT,
    "mpPaymentId" TEXT,
    "mpStatus" TEXT,
    "mpStatusDetail" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "source" "access_source" NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_mpOrderId_key" ON "orders"("mpOrderId");

-- CreateIndex
CREATE INDEX "orders_userId_createdAt_idx" ON "orders"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_moduleId_key" ON "order_items"("orderId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "module_access_userId_moduleId_key" ON "module_access"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "module_access_userId_expiresAt_idx" ON "module_access"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "module_access_orderId_idx" ON "module_access"("orderId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_access" ADD CONSTRAINT "module_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_access" ADD CONSTRAINT "module_access_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_access" ADD CONSTRAINT "module_access_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill 1 (decisao 1): preco provisorio de R$ 199,00 nos modulos existentes.
-- So alcanca quem ja estava cadastrado: a coluna nao ganha DEFAULT.
UPDATE "modules" SET "priceCents" = 19900 WHERE "priceCents" IS NULL;

-- Backfill 2 (decisao 20): 6 meses de acesso a todos os modulos para todas as
-- contas que ja existiam. `gen_random_uuid()` e nativo do Postgres 13+ (pgcrypto
-- embutido) e serve de id aqui — o formato cuid do Prisma so vale para linhas
-- criadas pela aplicacao, e nada le o id destas.
INSERT INTO "module_access" ("id", "userId", "moduleId", "grantedAt", "expiresAt", "source", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::TEXT,
    u."id",
    m."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '6 months',
    'LEGACY',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN "modules" m
ON CONFLICT ("userId", "moduleId") DO NOTHING;
