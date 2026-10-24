-- CreateEnum
CREATE TYPE "SaaSPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'EXPIRED', 'CANCELED');

-- AlterTable
ALTER TABLE "SystemSetting" ADD COLUMN "mpAccessToken" TEXT,
ADD COLUMN "mpPublicKey" TEXT,
ADD COLUMN "mpWebhookSecret" TEXT,
ADD COLUMN "mpSandbox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SaaSPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "status" "SaaSPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "mpPaymentId" TEXT,
    "mpStatus" TEXT,
    "mpStatusDetail" TEXT,
    "qrCode" TEXT,
    "qrCodeBase64" TEXT,
    "ticketUrl" TEXT,
    "installments" INTEGER DEFAULT 1,
    "cardBrand" TEXT,
    "cardLastFour" TEXT,
    "payerEmail" TEXT,
    "payerName" TEXT,
    "payerDoc" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaaSPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaaSPayment_mpPaymentId_key" ON "SaaSPayment"("mpPaymentId");

-- CreateIndex
CREATE INDEX "SaaSPayment_tenantId_createdAt_idx" ON "SaaSPayment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SaaSPayment_status_idx" ON "SaaSPayment"("status");

-- CreateIndex
CREATE INDEX "SaaSPayment_mpPaymentId_idx" ON "SaaSPayment"("mpPaymentId");

-- AddForeignKey
ALTER TABLE "SaaSPayment" ADD CONSTRAINT "SaaSPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaaSPayment" ADD CONSTRAINT "SaaSPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
