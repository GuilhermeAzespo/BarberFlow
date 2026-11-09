-- AlterTable: adiciona coluna autoRenew na tabela Subscription (Assinatura SaaS do Salão) e garante em CustomerSubscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true;
