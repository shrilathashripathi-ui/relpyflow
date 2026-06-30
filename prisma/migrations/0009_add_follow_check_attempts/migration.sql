-- The `follow_check_attempts` field exists in schema.prisma and is queried by the
-- follow-up worker (services/followUpWorker.js), but no prior migration created the
-- column — causing "column triggers.follow_check_attempts does not exist" at runtime.
-- `follow_up_count` is added defensively too (it ships in 0007 but is repeated here
-- with IF NOT EXISTS so environments that missed 0007 converge safely).

ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "follow_check_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "follow_up_count" INTEGER NOT NULL DEFAULT 0;
