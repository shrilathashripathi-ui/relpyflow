-- AlterTable: Add DM retry tracking fields to triggers
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "dm_retry_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "last_dm_attempt_at" TIMESTAMP(3);
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "last_dm_failure_reason" TEXT;
