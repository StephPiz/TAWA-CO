-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('received', 'processed', 'failed', 'ignored', 'duplicate');

-- CreateTable
CREATE TABLE "store_integrations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecret" TEXT,
    "apiKey" TEXT,
    "configJson" JSONB,
    "lastWebhookAt" TIMESTAMP(3),
    "lastWebhookStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_webhook_events" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "integrationId" TEXT,
    "provider" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedByUserId" TEXT,
    "salesOrderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_integrations_storeId_isActive_idx" ON "store_integrations"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "store_integrations_storeId_provider_key" ON "store_integrations"("storeId", "provider");

-- CreateIndex
CREATE INDEX "integration_webhook_events_storeId_status_receivedAt_idx" ON "integration_webhook_events"("storeId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "integration_webhook_events_storeId_topic_receivedAt_idx" ON "integration_webhook_events"("storeId", "topic", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_webhook_events_storeId_provider_externalEventId_key" ON "integration_webhook_events"("storeId", "provider", "externalEventId");

-- AddForeignKey
ALTER TABLE "store_integrations" ADD CONSTRAINT "store_integrations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "store_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
