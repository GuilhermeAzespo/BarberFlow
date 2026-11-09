-- Add activeAddons JSONB column to Subscription for Marketplace Add-ons billing & management
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "activeAddons" JSONB DEFAULT '[]';

