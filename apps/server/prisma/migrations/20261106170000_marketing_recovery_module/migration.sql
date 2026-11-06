-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketingCampaignType') THEN
        CREATE TYPE "MarketingCampaignType" AS ENUM ('INACTIVE_RECOVERY', 'BIRTHDAY');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketingDeliveryStatus') THEN
        CREATE TYPE "MarketingDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketingConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "inactiveRecoveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inactiveDaysThreshold" INTEGER NOT NULL DEFAULT 30,
    "inactiveMessageTemplate" TEXT NOT NULL DEFAULT 'Olá, {cliente}! Sentimos sua falta aqui na {barbearia}. Que tal renovar o visual esta semana? Agende seu horário em 1 clique: {link}',
    "inactiveDiscountPercent" INTEGER,
    "birthdayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "birthdayMessageTemplate" TEXT NOT NULL DEFAULT '🎉 Parabéns, {cliente}! A equipe da {barbearia} deseja um feliz aniversário! Preparamos um presente especial para você: agende com desconto exclusivo pelo link: {link}',
    "birthdayDiscountPercent" INTEGER DEFAULT 15,
    "sendWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "sendWindowEnd" TEXT NOT NULL DEFAULT '19:00',
    "minDaysBetweenMessages" INTEGER NOT NULL DEFAULT 30,
    "maxDailyDispatches" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketingMessageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "MarketingCampaignType" NOT NULL,
    "status" "MarketingDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingConfig_tenantId_key" ON "MarketingConfig"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketingMessageLog_tenantId_type_sentAt_idx" ON "MarketingMessageLog"("tenantId", "type", "sentAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketingMessageLog_tenantId_customerId_sentAt_idx" ON "MarketingMessageLog"("tenantId", "customerId", "sentAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MarketingConfig_tenantId_fkey'
    ) THEN
        ALTER TABLE "MarketingConfig" ADD CONSTRAINT "MarketingConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MarketingMessageLog_tenantId_fkey'
    ) THEN
        ALTER TABLE "MarketingMessageLog" ADD CONSTRAINT "MarketingMessageLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MarketingMessageLog_customerId_fkey'
    ) THEN
        ALTER TABLE "MarketingMessageLog" ADD CONSTRAINT "MarketingMessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
