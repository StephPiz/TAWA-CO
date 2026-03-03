-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "hashAlgo" TEXT DEFAULT 'sha256',
ADD COLUMN     "hashChain" TEXT,
ADD COLUMN     "prevHash" TEXT;
