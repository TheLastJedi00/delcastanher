-- Spec 028: status FAILED, attemptId no pedido e a tabela payment_logs.
-- So adiciona: nenhuma linha existente e alterada.

-- CreateEnum
CREATE TYPE "payment_log_source" AS ENUM ('API', 'FRONT');

-- CreateEnum
CREATE TYPE "payment_log_level" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- AlterEnum
ALTER TYPE "order_status" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "attemptId" TEXT;

-- CreateTable
CREATE TABLE "payment_logs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "attemptId" TEXT,
    "userId" TEXT,
    "source" "payment_log_source" NOT NULL,
    "stage" TEXT NOT NULL,
    "level" "payment_log_level" NOT NULL,
    "httpStatus" INTEGER,
    "mpOrderId" TEXT,
    "mpStatus" TEXT,
    "mpStatusDetail" TEXT,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_logs_orderId_createdAt_idx" ON "payment_logs"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_logs_attemptId_idx" ON "payment_logs"("attemptId");

-- CreateIndex
CREATE INDEX "payment_logs_userId_createdAt_idx" ON "payment_logs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

