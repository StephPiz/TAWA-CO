-- CreateTable
CREATE TABLE "audit_anchors" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "anchorDay" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "lastAuditLogId" TEXT,
    "lastHash" TEXT,
    "hashAlgo" TEXT NOT NULL DEFAULT 'sha256',
    "prevAnchorHash" TEXT,
    "anchorHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_anchors_storeId_createdAt_idx" ON "audit_anchors"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_anchors_storeId_anchorDay_key" ON "audit_anchors"("storeId", "anchorDay");

-- AddForeignKey
ALTER TABLE "audit_anchors" ADD CONSTRAINT "audit_anchors_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_anchors" ADD CONSTRAINT "audit_anchors_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
