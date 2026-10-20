-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "bio" TEXT,
ADD COLUMN IF NOT EXISTS "instagram" TEXT,
ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TenantCover" (
    "tenantId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCover_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TenantGalleryImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TenantGalleryImage_tenantId_sortOrder_idx" ON "TenantGalleryImage"("tenantId", "sortOrder");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenantCover_tenantId_fkey'
    ) THEN
        ALTER TABLE "TenantCover" ADD CONSTRAINT "TenantCover_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenantGalleryImage_tenantId_fkey'
    ) THEN
        ALTER TABLE "TenantGalleryImage" ADD CONSTRAINT "TenantGalleryImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
