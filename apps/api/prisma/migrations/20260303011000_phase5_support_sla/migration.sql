-- AlterTable
ALTER TABLE "support_tickets"
ADD COLUMN "slaFirstResponseDueAt" TIMESTAMP(3),
ADD COLUMN "slaResolutionDueAt" TIMESTAMP(3),
ADD COLUMN "slaBreached" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "slaBreachedAt" TIMESTAMP(3),
ADD COLUMN "slaBreachNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "support_tickets_storeId_slaBreached_status_idx" ON "support_tickets"("storeId", "slaBreached", "status");
