-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'sent', 'priced', 'paid', 'preparing', 'checklist', 'tracking_received', 'in_transit', 'received', 'verified', 'closed', 'incident');

-- CreateEnum
CREATE TYPE "ThreePlLegStatus" AS ENUM ('planned', 'in_transit', 'delivered', 'delayed');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "city" TEXT,
    "country" TEXT,
    "defaultCurrencyCode" TEXT,
    "paymentMethod" TEXT,
    "catalogUrl" TEXT,
    "vacationNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "totalAmountEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "ean" TEXT,
    "quantityOrdered" INTEGER NOT NULL,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "unitCostOriginal" DECIMAL(14,4) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "fxToEur" DECIMAL(14,6) NOT NULL,
    "unitCostEurFrozen" DECIMAL(14,4) NOT NULL,
    "totalCostEur" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_payments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currencyCode" TEXT NOT NULL,
    "amountOriginal" DECIMAL(14,2) NOT NULL,
    "fxToEur" DECIMAL(14,6) NOT NULL,
    "amountEurFrozen" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "three_pl_shipments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "providerName" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "three_pl_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "three_pl_legs" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "legOrder" INTEGER NOT NULL,
    "originLabel" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "costCurrencyCode" TEXT,
    "costOriginal" DECIMAL(14,2),
    "fxToEur" DECIMAL(14,6),
    "costEurFrozen" DECIMAL(14,2),
    "status" "ThreePlLegStatus" NOT NULL DEFAULT 'planned',
    "departedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "three_pl_legs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_storeId_code_key" ON "suppliers"("storeId", "code");

-- CreateIndex
CREATE INDEX "suppliers_storeId_isActive_idx" ON "suppliers"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_storeId_poNumber_key" ON "purchase_orders"("storeId", "poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_storeId_status_orderedAt_idx" ON "purchase_orders"("storeId", "status", "orderedAt");

-- CreateIndex
CREATE INDEX "purchase_order_items_storeId_purchaseOrderId_idx" ON "purchase_order_items"("storeId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_items_storeId_productId_idx" ON "purchase_order_items"("storeId", "productId");

-- CreateIndex
CREATE INDEX "purchase_order_payments_storeId_paidAt_idx" ON "purchase_order_payments"("storeId", "paidAt");

-- CreateIndex
CREATE INDEX "purchase_order_payments_storeId_purchaseOrderId_idx" ON "purchase_order_payments"("storeId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "three_pl_shipments_storeId_referenceCode_key" ON "three_pl_shipments"("storeId", "referenceCode");

-- CreateIndex
CREATE INDEX "three_pl_shipments_storeId_createdAt_idx" ON "three_pl_shipments"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "three_pl_legs_shipmentId_legOrder_key" ON "three_pl_legs"("shipmentId", "legOrder");

-- CreateIndex
CREATE INDEX "three_pl_legs_shipmentId_status_idx" ON "three_pl_legs"("shipmentId", "status");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_payments" ADD CONSTRAINT "purchase_order_payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_payments" ADD CONSTRAINT "purchase_order_payments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_payments" ADD CONSTRAINT "purchase_order_payments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "three_pl_shipments" ADD CONSTRAINT "three_pl_shipments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "three_pl_shipments" ADD CONSTRAINT "three_pl_shipments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "three_pl_shipments" ADD CONSTRAINT "three_pl_shipments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "three_pl_legs" ADD CONSTRAINT "three_pl_legs_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "three_pl_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
