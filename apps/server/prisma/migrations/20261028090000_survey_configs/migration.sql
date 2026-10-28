-- AlterTable WhatsAppConfig
ALTER TABLE "WhatsAppConfig" ADD COLUMN IF NOT EXISTS "attendantSurveyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WhatsAppConfig" ADD COLUMN IF NOT EXISTS "attendantSurveyMessage" TEXT;
ALTER TABLE "WhatsAppConfig" ADD COLUMN IF NOT EXISTS "serviceSurveyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WhatsAppConfig" ADD COLUMN IF NOT EXISTS "serviceSurveyMessage" TEXT;
