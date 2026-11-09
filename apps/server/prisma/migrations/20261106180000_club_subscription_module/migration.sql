-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClubSubscriptionStatus') THEN
        CREATE TYPE "ClubSubscriptionStatus" AS ENUM ('ACTIVE', 'PENDING_PAYMENT', 'CANCELED', 'EXPIRED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClubPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "maxUsagesPerMonth" INTEGER,
    "allowedDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClubPlanService" (
    "planId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "ClubPlanService_pkey" PRIMARY KEY ("planId","serviceId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "ClubSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "cycleStartDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleEndDate" TIMESTAMP(3) NOT NULL,
    "usagesCount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "lastPaymentAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClubUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "serviceId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ClubUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClubPlan_tenantId_isActive_idx" ON "ClubPlan"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "ClubPlanService_serviceId_idx" ON "ClubPlanService"("serviceId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSubscription_tenantId_customerId_key" ON "CustomerSubscription"("tenantId", "customerId");
CREATE INDEX IF NOT EXISTS "CustomerSubscription_tenantId_status_idx" ON "CustomerSubscription"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CustomerSubscription_tenantId_cycleEndDate_idx" ON "CustomerSubscription"("tenantId", "cycleEndDate");
CREATE INDEX IF NOT EXISTS "ClubUsage_subscriptionId_usedAt_idx" ON "ClubUsage"("subscriptionId", "usedAt");
CREATE INDEX IF NOT EXISTS "ClubUsage_tenantId_usedAt_idx" ON "ClubUsage"("tenantId", "usedAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubPlan_tenantId_fkey') THEN
        ALTER TABLE "ClubPlan" ADD CONSTRAINT "ClubPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubPlanService_planId_fkey') THEN
        ALTER TABLE "ClubPlanService" ADD CONSTRAINT "ClubPlanService_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ClubPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubPlanService_serviceId_fkey') THEN
        ALTER TABLE "ClubPlanService" ADD CONSTRAINT "ClubPlanService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSubscription_tenantId_fkey') THEN
        ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSubscription_customerId_fkey') THEN
        ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSubscription_planId_fkey') THEN
        ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ClubPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubUsage_subscriptionId_fkey') THEN
        ALTER TABLE "ClubUsage" ADD CONSTRAINT "ClubUsage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubUsage_appointmentId_fkey') THEN
        ALTER TABLE "ClubUsage" ADD CONSTRAINT "ClubUsage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubUsage_serviceId_fkey') THEN
        ALTER TABLE "ClubUsage" ADD CONSTRAINT "ClubUsage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true;


