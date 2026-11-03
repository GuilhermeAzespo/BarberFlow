-- AlterTable SystemSetting: Add Cloudflare for SaaS (Custom Hostnames SSL) configuration
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "cfApiToken" TEXT;
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "cfZoneId" TEXT;
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "cfFallbackOrigin" TEXT DEFAULT 'barberflow.azespo.com.br';
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "cfEnabled" BOOLEAN NOT NULL DEFAULT false;
