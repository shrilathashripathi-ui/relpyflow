-- AlterTable: Add DM flow fields to automations
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "opening_button" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "opening_dm_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "final_message" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "follow_up_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "follow_up_message" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "email_ask_message" TEXT;
