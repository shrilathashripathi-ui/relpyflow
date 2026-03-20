-- Add phone column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Add CTA label column to automations table
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "ai_cta_label" TEXT;
