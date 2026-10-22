-- Spec 030: pedido de teste e a configuracao do modulo de teste. So adiciona.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "testPayment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "payment_test_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accessKey" TEXT,
    "enabledAt" TIMESTAMP(3),
    "enabledById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_test_settings_pkey" PRIMARY KEY ("id")
);

