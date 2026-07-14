-- DropIndex
DROP INDEX "store_billing_profiles_countryCode_idx";

-- DropIndex
DROP INDEX "store_billing_profiles_fiscalCountry_idx";

-- AlterTable
ALTER TABLE "store_billing_profiles" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "phone" TEXT;
