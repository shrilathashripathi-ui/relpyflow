-- CreateTable: job_queue
CREATE TABLE "job_queue" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "group_key" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable: poll_state
CREATE TABLE "poll_state" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "interval_ms" INTEGER NOT NULL DEFAULT 300000,
    "consecutive_empty" INTEGER NOT NULL DEFAULT 0,
    "consecutive_active" INTEGER NOT NULL DEFAULT 0,
    "last_poll_at" TIMESTAMP(3),
    "last_comment_at" TIMESTAMP(3),
    "last_poll_error" TEXT,
    "api_calls_this_hour" INTEGER NOT NULL DEFAULT 0,
    "api_calls_hour_reset" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: job_queue performance indexes
CREATE INDEX "job_queue_status_run_at_idx" ON "job_queue"("status", "run_at");
CREATE INDEX "job_queue_job_type_group_key_idx" ON "job_queue"("job_type", "group_key");
CREATE INDEX "job_queue_status_locked_at_idx" ON "job_queue"("status", "locked_at");

-- CreateIndex: poll_state unique constraint
CREATE UNIQUE INDEX "poll_state_ig_account_id_key" ON "poll_state"("ig_account_id");

-- Add missing follow_up_count column to triggers
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "follow_up_count" INTEGER NOT NULL DEFAULT 0;
