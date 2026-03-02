/*
  Warnings:

  - The values [worten] on the enum `EanAliasSource` will be removed. If these variants are still used in the database, this will fail.
  - The values [standard] on the enum `ProductType` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `name` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `sales_channels` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `warehouses` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ChannelListingStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'packed', 'shipped', 'delivered', 'returned', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'partially_paid', 'paid');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'cancelled');

-- AlterEnum
BEGIN;
CREATE TYPE "EanAliasSource_new" AS ENUM ('manual', 'marketplace', 'idealo', 'shopify', 'other');
ALTER TYPE "EanAliasSource" RENAME TO "EanAliasSource_old";
ALTER TYPE "EanAliasSource_new" RENAME TO "EanAliasSource";
DROP TYPE "EanAliasSource_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LotSourceType" ADD VALUE 'purchase_order';
ALTER TYPE "LotSourceType" ADD VALUE 'return_restock';

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'receive_in';

-- AlterEnum
BEGIN;
CREATE TYPE "ProductType_new" AS ENUM ('watch', 'bag', 'perfume', 'accessory', 'vintage', 'refurbished', 'other');
ALTER TABLE "products" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "type" TYPE "ProductType_new" USING (
  CASE
    WHEN "type"::text = 'standard' THEN 'other'
    ELSE "type"::text
  END::"ProductType_new"
);
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
ALTER TYPE "ProductType_new" RENAME TO "ProductType";
DROP TYPE "ProductType_old";
ALTER TABLE "products" ALTER COLUMN "type" SET DEFAULT 'other';
COMMIT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "internalDescription" TEXT,
ADD COLUMN     "isInternalEan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mainImageUrl" TEXT,
ADD COLUMN     "modelRef" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "sku" TEXT,
ALTER COLUMN "type" SET DEFAULT 'other';

UPDATE "products"
SET "name" = COALESCE(NULLIF(TRIM(CONCAT(COALESCE("brand", ''), ' ', COALESCE("model", ''))), ''), "ean")
WHERE "name" IS NULL;

ALTER TABLE "products" ALTER COLUMN "name" SET NOT NULL;

-- AlterTable
ALTER TABLE "sales_channels" ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "cpaFixed" DECIMAL(14,2),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "feePercent" DECIMAL(8,4),
ADD COLUMN     "payoutTerms" TEXT,
ADD COLUMN     "status" "ChannelStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "baseCurrencyCode" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "invoicePrefix" TEXT,
ADD COLUMN     "invoiceSequenceNext" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "themeColor" TEXT;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "country" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "WarehouseStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "type" "WarehouseType" NOT NULL DEFAULT 'own',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ean_aliases" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "source" "EanAliasSource" NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ean_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_product_links" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "salesChannelId" TEXT NOT NULL,
    "productUrl" TEXT,
    "externalProductId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_product_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_channel_prices" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "salesChannelId" TEXT NOT NULL,
    "priceAmount" DECIMAL(14,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_channel_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_product_texts" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "salesChannelId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_product_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_channels" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "listingStatus" "ChannelListingStatus" NOT NULL DEFAULT 'active',
    "publicName" TEXT,
    "channelEan" TEXT,
    "listingUrl" TEXT,
    "priceOriginal" DECIMAL(14,2),
    "priceCurrencyCode" TEXT,
    "priceFxToEur" DECIMAL(14,6),
    "priceEurFrozen" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_texts" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "channelId" TEXT,
    "publicName" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_locations" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "lotCode" TEXT NOT NULL,
    "sourceType" "LotSourceType" NOT NULL DEFAULT 'manual_receipt',
    "status" "LotStatus" NOT NULL DEFAULT 'available',
    "supplierName" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantityReceived" INTEGER NOT NULL,
    "quantityAvailable" INTEGER NOT NULL,
    "unitCostOriginal" DECIMAL(14,4) NOT NULL,
    "costCurrencyCode" TEXT NOT NULL,
    "fxToEur" DECIMAL(14,6) NOT NULL,
    "unitCostEurFrozen" DECIMAL(14,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lotId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostEurFrozen" DECIMAL(14,4),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT,
    "fullName" TEXT,
    "country" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceChannelId" TEXT,
    "sourceLabel" TEXT,
    "customerId" TEXT,
    "customerCountryCode" TEXT,
    "currencyCode" TEXT NOT NULL,
    "grossAmountOriginal" DECIMAL(14,2) NOT NULL,
    "grossFxToEur" DECIMAL(14,6) NOT NULL,
    "grossAmountEurFrozen" DECIMAL(14,2) NOT NULL,
    "feesEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cpaEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingCostEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packagingCostEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returnCostEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cogsEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netProfitEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productEan" TEXT,
    "title" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceOriginal" DECIMAL(14,2) NOT NULL,
    "fxToEur" DECIMAL(14,6) NOT NULL,
    "unitPriceEurFrozen" DECIMAL(14,2) NOT NULL,
    "revenueEurFrozen" DECIMAL(14,2) NOT NULL,
    "cogsEurFrozen" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channelId" TEXT,
    "payoutRef" TEXT NOT NULL,
    "payoutDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amountOriginal" DECIMAL(14,2) NOT NULL,
    "fxToEur" DECIMAL(14,6) NOT NULL,
    "amountEurFrozen" DECIMAL(14,2) NOT NULL,
    "feesEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adjustmentsEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_order_matches" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountEur" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_order_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'issued',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "currencyCode" TEXT NOT NULL,
    "subtotalEur" DECIMAL(14,2) NOT NULL,
    "taxEur" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalEur" DECIMAL(14,2) NOT NULL,
    "billingName" TEXT,
    "billingAddress" TEXT,
    "billingCountry" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_currencies" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "baseCurrencyCode" TEXT NOT NULL,
    "quoteCurrencyCode" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ean_aliases_productId_idx" ON "ean_aliases"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ean_aliases_storeId_ean_key" ON "ean_aliases"("storeId", "ean");

-- CreateIndex
CREATE INDEX "product_images_productId_sortOrder_idx" ON "product_images"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "channel_product_links_productId_salesChannelId_key" ON "channel_product_links"("productId", "salesChannelId");

-- CreateIndex
CREATE INDEX "product_channel_prices_productId_salesChannelId_isActive_idx" ON "product_channel_prices"("productId", "salesChannelId", "isActive");

-- CreateIndex
CREATE INDEX "channel_product_texts_salesChannelId_locale_idx" ON "channel_product_texts"("salesChannelId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "channel_product_texts_productId_salesChannelId_locale_key" ON "channel_product_texts"("productId", "salesChannelId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_channels_productId_channelId_key" ON "product_channels"("productId", "channelId");

-- CreateIndex
CREATE INDEX "product_texts_storeId_locale_idx" ON "product_texts"("storeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_texts_productId_locale_channelId_key" ON "product_texts"("productId", "locale", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_locations_warehouseId_code_key" ON "warehouse_locations"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "inventory_lots_storeId_productId_receivedAt_idx" ON "inventory_lots"("storeId", "productId", "receivedAt");

-- CreateIndex
CREATE INDEX "inventory_lots_warehouseId_productId_idx" ON "inventory_lots"("warehouseId", "productId");

-- CreateIndex
CREATE INDEX "inventory_movements_storeId_productId_createdAt_idx" ON "inventory_movements"("storeId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_storeId_warehouseId_createdAt_idx" ON "inventory_movements"("storeId", "warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "customers_storeId_email_idx" ON "customers"("storeId", "email");

-- CreateIndex
CREATE INDEX "sales_orders_storeId_orderedAt_idx" ON "sales_orders"("storeId", "orderedAt");

-- CreateIndex
CREATE INDEX "sales_orders_storeId_sourceChannelId_idx" ON "sales_orders"("storeId", "sourceChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_storeId_orderNumber_key" ON "sales_orders"("storeId", "orderNumber");

-- CreateIndex
CREATE INDEX "sales_order_items_storeId_orderId_idx" ON "sales_order_items"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "sales_order_items_storeId_productId_idx" ON "sales_order_items"("storeId", "productId");

-- CreateIndex
CREATE INDEX "payouts_storeId_payoutDate_idx" ON "payouts"("storeId", "payoutDate");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_storeId_payoutRef_key" ON "payouts"("storeId", "payoutRef");

-- CreateIndex
CREATE INDEX "payout_order_matches_storeId_orderId_idx" ON "payout_order_matches"("storeId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_order_matches_payoutId_orderId_key" ON "payout_order_matches"("payoutId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE INDEX "invoices_storeId_issuedAt_idx" ON "invoices"("storeId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_storeId_invoiceNumber_key" ON "invoices"("storeId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "store_currencies_storeId_currencyCode_key" ON "store_currencies"("storeId", "currencyCode");

-- CreateIndex
CREATE INDEX "fx_rates_storeId_rateDate_idx" ON "fx_rates"("storeId", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_storeId_baseCurrencyCode_quoteCurrencyCode_rateDat_key" ON "fx_rates"("storeId", "baseCurrencyCode", "quoteCurrencyCode", "rateDate");

-- CreateIndex
CREATE INDEX "products_storeId_brand_model_idx" ON "products"("storeId", "brand", "model");

-- AddForeignKey
ALTER TABLE "ean_aliases" ADD CONSTRAINT "ean_aliases_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ean_aliases" ADD CONSTRAINT "ean_aliases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_product_links" ADD CONSTRAINT "channel_product_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_product_links" ADD CONSTRAINT "channel_product_links_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_prices" ADD CONSTRAINT "product_channel_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_prices" ADD CONSTRAINT "product_channel_prices_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_product_texts" ADD CONSTRAINT "channel_product_texts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_product_texts" ADD CONSTRAINT "channel_product_texts_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channels" ADD CONSTRAINT "product_channels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channels" ADD CONSTRAINT "product_channels_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_texts" ADD CONSTRAINT "product_texts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_texts" ADD CONSTRAINT "product_texts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_texts" ADD CONSTRAINT "product_texts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_sourceChannelId_fkey" FOREIGN KEY ("sourceChannelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_order_matches" ADD CONSTRAINT "payout_order_matches_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_order_matches" ADD CONSTRAINT "payout_order_matches_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_order_matches" ADD CONSTRAINT "payout_order_matches_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_currencies" ADD CONSTRAINT "store_currencies_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_currencies" ADD CONSTRAINT "store_currencies_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_baseCurrencyCode_fkey" FOREIGN KEY ("baseCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_quoteCurrencyCode_fkey" FOREIGN KEY ("quoteCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
