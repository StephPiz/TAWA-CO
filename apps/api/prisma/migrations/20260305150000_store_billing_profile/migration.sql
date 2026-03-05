CREATE TABLE IF NOT EXISTS "store_billing_profiles" (
  "storeId" TEXT PRIMARY KEY,
  "companyName" TEXT,
  "fiscalAddress" TEXT,
  "countryCode" TEXT,
  "city" TEXT,
  "postalCode" TEXT,
  "phone" TEXT,
  "taxId" TEXT,
  "billingEmail" TEXT,
  "invoicePrefix" TEXT,
  "fiscalCountry" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_billing_profiles_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "store_billing_profiles_countryCode_idx" ON "store_billing_profiles"("countryCode");
CREATE INDEX IF NOT EXISTS "store_billing_profiles_fiscalCountry_idx" ON "store_billing_profiles"("fiscalCountry");
