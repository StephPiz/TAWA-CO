-- CreateEnum
CREATE TYPE "IntegrationOutboxStatus" AS ENUM ('pending', 'processing', 'sent', 'failed', 'dead');

-- CreateTable
CREATE TABLE "integration_outbox_events" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "integrationId" TEXT,
    "provider" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IntegrationOutboxStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_outbox_events_storeId_status_nextAttemptAt_idx" ON "integration_outbox_events"("storeId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "integration_outbox_events_storeId_provider_createdAt_idx" ON "integration_outbox_events"("storeId", "provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_outbox_events_storeId_provider_dedupeKey_key" ON "integration_outbox_events"("storeId", "provider", "dedupeKey");

-- AddForeignKey
ALTER TABLE "integration_outbox_events" ADD CONSTRAINT "integration_outbox_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbox_events" ADD CONSTRAINT "integration_outbox_events_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "store_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbox_events" ADD CONSTRAINT "integration_outbox_events_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
