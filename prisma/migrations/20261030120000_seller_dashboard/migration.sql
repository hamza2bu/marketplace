-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hasDeal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "payoutBankEncrypted" TEXT,
ADD COLUMN     "payoutBankLast4" TEXT;

-- CreateIndex
CREATE INDEX "Discount_startsAt_idx" ON "Discount"("startsAt");

-- CreateIndex
CREATE INDEX "Discount_endsAt_idx" ON "Discount"("endsAt");

-- CreateIndex
CREATE INDEX "Product_hasDeal_idx" ON "Product"("hasDeal");


-- Backfill: products already marked down by a compare-at price.
UPDATE "Product" p SET "hasDeal" = EXISTS (
  SELECT 1 FROM "ProductVariant" v
  WHERE v."productId" = p.id AND v."isActive" AND v."compareAtMinor" > v."priceMinor"
);
