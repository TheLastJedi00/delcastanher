-- Spec 032: campanha de desconto (Black Friday) e o desconto gravado no pedido. So adiciona.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discountPercentSnapshot" INTEGER,
ADD COLUMN     "listAmountCents" INTEGER,
ADD COLUMN     "promotionId" TEXT,
ADD COLUMN     "promotionNameSnapshot" TEXT;

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedEarlyAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotions_startsAt_endsAt_idx" ON "promotions"("startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
