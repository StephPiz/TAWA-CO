-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('standard', 'vintage', 'refurbished');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('shopify', 'idealo', 'marketplace', 'manual', 'other');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('own', 'external', 'returns');

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "LotSourceType" AS ENUM ('manual_init', 'manual_receipt');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('available', 'held', 'non_sellable', 'repair');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('lot_create', 'manual_adjust', 'sale_out', 'return_in', 'transfer_out', 'transfer_in');

-- CreateEnum
CREATE TYPE "EanAliasSource" AS ENUM ('manual', 'marketplace', 'worten', 'idealo', 'shopify', 'other');

-- CreateTable
CREATE TABLE "holding_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StoreStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'standard',
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_channels" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,

    CONSTRAINT "sales_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holding_companies_name_key" ON "holding_companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stores_holdingId_code_key" ON "stores"("holdingId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "products_storeId_ean_key" ON "products"("storeId", "ean");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_storeId_code_key" ON "warehouses"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_channels_storeId_code_key" ON "sales_channels"("storeId", "code");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "holding_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
