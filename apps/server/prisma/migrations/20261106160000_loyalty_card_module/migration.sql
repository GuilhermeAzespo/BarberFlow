-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LoyaltyTransactionType') THEN
    CREATE TYPE "LoyaltyTransactionType" AS ENUM ('STAMP_ADDED', 'REWARD_REDEEMED', 'MANUAL_ADJUSTMENT');
  END IF;
END $$;

-- CreateTable LoyaltyConfig
CREATE TABLE IF NOT EXISTS "LoyaltyConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "targetStamps" INTEGER NOT NULL DEFAULT 10,
    "rewardText" TEXT NOT NULL DEFAULT '1 Corte ou Barba Grátis',
    "autoSendWhatsApp" BOOLEAN NOT NULL DEFAULT true,
    "showInPublicShowcase" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyConfig_tenantId_key" ON "LoyaltyConfig"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyConfig_tenantId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyConfig"
      ADD CONSTRAINT "LoyaltyConfig_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable LoyaltyCard
CREATE TABLE IF NOT EXISTS "LoyaltyCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currentStamps" INTEGER NOT NULL DEFAULT 0,
    "completedCycles" INTEGER NOT NULL DEFAULT 0,
    "rewardsAvailable" INTEGER NOT NULL DEFAULT 0,
    "lastStampAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyCard_customerId_key" ON "LoyaltyCard"("customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyCard_tenantId_customerId_key" ON "LoyaltyCard"("tenantId", "customerId");
CREATE INDEX IF NOT EXISTS "LoyaltyCard_tenantId_customerId_idx" ON "LoyaltyCard"("tenantId", "customerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyCard_tenantId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyCard"
      ADD CONSTRAINT "LoyaltyCard_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyCard_customerId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyCard"
      ADD CONSTRAINT "LoyaltyCard_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable LoyaltyTransaction
CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loyaltyCardId" TEXT NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL DEFAULT 'STAMP_ADDED',
    "stampsChange" INTEGER NOT NULL DEFAULT 1,
    "appointmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoyaltyTransaction_loyaltyCardId_createdAt_idx" ON "LoyaltyTransaction"("loyaltyCardId", "createdAt");
CREATE INDEX IF NOT EXISTS "LoyaltyTransaction_tenantId_createdAt_idx" ON "LoyaltyTransaction"("tenantId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyTransaction_loyaltyCardId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyTransaction"
      ADD CONSTRAINT "LoyaltyTransaction_loyaltyCardId_fkey"
      FOREIGN KEY ("loyaltyCardId") REFERENCES "LoyaltyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyTransaction_appointmentId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyTransaction"
      ADD CONSTRAINT "LoyaltyTransaction_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
