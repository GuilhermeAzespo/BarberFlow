-- AlterTable: add online payment metadata columns to CustomerSubscription
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "mpLastPaymentId" TEXT;
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "cardLastFour" TEXT;
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "cardBrand" TEXT;

-- CreateTable: TenantPaymentConfig for per-salon Mercado Pago credentials
CREATE TABLE IF NOT EXISTS "TenantPaymentConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mpPublicKey" TEXT,
    "mpAccessToken" TEXT,
    "mpWebhookSecret" TEXT,
    "pixEnabled" BOOLEAN NOT NULL DEFAULT true,
    "creditCardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recurringCardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPaymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TenantPaymentConfig_tenantId_key" ON "TenantPaymentConfig"("tenantId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenantPaymentConfig_tenantId_fkey'
    ) THEN
        ALTER TABLE "TenantPaymentConfig" ADD CONSTRAINT "TenantPaymentConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

