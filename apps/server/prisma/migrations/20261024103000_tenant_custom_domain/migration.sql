-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_customDomain_key" ON "Tenant"("customDomain");
