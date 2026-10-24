-- AlterTable
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProfessionalAvatar" (
    "professionalId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalAvatar_pkey" PRIMARY KEY ("professionalId")
);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ProfessionalAvatar_professionalId_fkey'
    ) THEN
        ALTER TABLE "ProfessionalAvatar" ADD CONSTRAINT "ProfessionalAvatar_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
