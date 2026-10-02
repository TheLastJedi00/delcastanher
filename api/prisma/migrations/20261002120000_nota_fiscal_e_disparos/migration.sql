-- Spec 023: nota fiscal (NF-e pela Notaas) e disparos de e-mail.
--
-- So adicao, sem UPDATE de dado:
--
--   - `orders.payer*`: o destinatario da NF-e (decisao A3). Os pedidos que ja
--     existem ficam com nulo: o CPF vem do script de backfill, e o endereco
--     nao existe em lugar nenhum.
--   - `users.marketingOptOutAt`: o descadastro das campanhas (decisao B5).
--     Nulo e "recebe".
--   - `invoices`: uma nota por pedido (decisao A2).
--   - `email_campaigns` e `email_deliveries`: as campanhas e a lista congelada
--     de destinatarios (decisao B4).
-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('PENDING', 'PROCESSING', 'UNKNOWN', 'AUTHORIZED', 'DENIED', 'ERROR', 'CANCELLING', 'CANCELLED', 'CANCEL_ERROR', 'REFUND_PENDING');

-- CreateEnum
CREATE TYPE "email_segment" AS ENUM ('ALL_ACTIVE', 'INACTIVE_7D', 'COMPLETED');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('SENDING', 'SENT', 'PARTIAL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "marketingOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payerCity" TEXT,
ADD COLUMN     "payerCityIbge" TEXT,
ADD COLUMN     "payerComplement" TEXT,
ADD COLUMN     "payerDistrict" TEXT,
ADD COLUMN     "payerDocument" TEXT,
ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "payerNumber" TEXT,
ADD COLUMN     "payerState" TEXT,
ADD COLUMN     "payerStreet" TEXT,
ADD COLUMN     "payerZip" TEXT;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'PENDING',
    "environment" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "providerInvoiceId" TEXT,
    "number" TEXT,
    "series" TEXT,
    "accessKey" TEXT,
    "protocol" TEXT,
    "xmlPath" TEXT,
    "pdfPath" TEXT,
    "cancelXmlPath" TEXT,
    "lastError" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segment" "email_segment" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'SENDING',
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "resendId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_providerInvoiceId_key" ON "invoices"("providerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_accessKey_key" ON "invoices"("accessKey");

-- CreateIndex
CREATE INDEX "invoices_status_environment_updatedAt_idx" ON "invoices"("status", "environment", "updatedAt");

-- CreateIndex
CREATE INDEX "email_campaigns_createdAt_idx" ON "email_campaigns"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_campaignId_userId_key" ON "email_deliveries"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

