-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastError" TEXT,
ALTER COLUMN "sentAt" DROP NOT NULL,
ALTER COLUMN "sentAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "flaggedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_flaggedAt_idx" ON "Review"("flaggedAt");


-- Before this, sentAt was the creation time. Keep it as createdAt, and only
-- treat rows that were actually delivered as sent.
UPDATE "EmailLog" SET "createdAt" = COALESCE("sentAt", now());
UPDATE "EmailLog" SET "sentAt" = NULL WHERE status = 'queued';
