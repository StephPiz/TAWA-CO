-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('pending_review', 'processed');

-- CreateEnum
CREATE TYPE "ReturnDecision" AS ENUM ('restock', 'discount', 'repair', 'scrap');

-- CreateEnum
CREATE TYPE "BackorderStatus" AS ENUM ('open', 'fulfilled', 'cancelled');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'backorder';

-- CreateTable
CREATE TABLE "return_cases" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "productId" TEXT,
    "trackingCode" TEXT,
    "reason" TEXT,
    "labelPayer" TEXT,
    "conditionState" TEXT,
    "packagingRecovered" BOOLEAN NOT NULL DEFAULT false,
    "decision" "ReturnDecision" NOT NULL DEFAULT 'restock',
    "status" "ReturnStatus" NOT NULL DEFAULT 'pending_review',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "returnCostEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "warehouseId" TEXT,
    "processedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "return_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backorder_lines" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productId" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "fulfilledQty" INTEGER NOT NULL DEFAULT 0,
    "missingQty" INTEGER NOT NULL,
    "status" "BackorderStatus" NOT NULL DEFAULT 'open',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backorder_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "return_cases_storeId_createdAt_idx" ON "return_cases"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "return_cases_storeId_status_idx" ON "return_cases"("storeId", "status");

-- CreateIndex
CREATE INDEX "backorder_lines_storeId_status_createdAt_idx" ON "backorder_lines"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "backorder_lines_storeId_productId_status_idx" ON "backorder_lines"("storeId", "productId", "status");

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backorder_lines" ADD CONSTRAINT "backorder_lines_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backorder_lines" ADD CONSTRAINT "backorder_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backorder_lines" ADD CONSTRAINT "backorder_lines_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backorder_lines" ADD CONSTRAINT "backorder_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
