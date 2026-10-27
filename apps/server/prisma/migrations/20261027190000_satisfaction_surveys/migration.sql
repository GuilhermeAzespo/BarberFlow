-- CreateTable
CREATE TABLE IF NOT EXISTS "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactJid" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerName" TEXT,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT,
    "appointmentId" TEXT,
    "conversationId" TEXT,
    "professionalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SatisfactionSurvey_tenantId_type_createdAt_idx" ON "SatisfactionSurvey"("tenantId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "SatisfactionSurvey_tenantId_rating_idx" ON "SatisfactionSurvey"("tenantId", "rating");
CREATE INDEX IF NOT EXISTS "SatisfactionSurvey_tenantId_contactJid_idx" ON "SatisfactionSurvey"("tenantId", "contactJid");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SatisfactionSurvey_tenantId_fkey') THEN
    ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SatisfactionSurvey_appointmentId_fkey') THEN
    ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SatisfactionSurvey_professionalId_fkey') THEN
    ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
