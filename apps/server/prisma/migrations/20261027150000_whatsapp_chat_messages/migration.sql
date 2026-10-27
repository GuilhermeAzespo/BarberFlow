-- AlterTable
ALTER TABLE "WhatsAppConversation" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN IF NOT EXISTS "isAttendant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsAppConversation" ADD COLUMN IF NOT EXISTS "unreadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WhatsAppConversation" ADD COLUMN IF NOT EXISTS "lastMessage" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactJid" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "senderType" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "senderName" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppConversation_tenantId_isAttendant_lastMessageAt_idx" ON "WhatsAppConversation"("tenantId", "isAttendant", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_tenantId_conversationId_createdAt_idx" ON "WhatsAppMessage"("tenantId", "conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_tenantId_contactJid_idx" ON "WhatsAppMessage"("tenantId", "contactJid");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppMessage_tenantId_fkey') THEN
    ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppMessage_conversationId_fkey') THEN
    ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
