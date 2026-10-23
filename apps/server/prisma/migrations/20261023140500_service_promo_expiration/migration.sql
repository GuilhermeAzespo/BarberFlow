-- AlterTable
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "promoExpiresAt" TIMESTAMP(3);
