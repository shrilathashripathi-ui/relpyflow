-- Sync production database: add any missing columns and tables
-- Uses IF NOT EXISTS so this is safe to run regardless of current DB state

-- ── instagram_accounts: official API fields ──
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "access_token" TEXT;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "access_token_expiry" TIMESTAMP(3);
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "page_id" TEXT;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "use_official_api" BOOLEAN NOT NULL DEFAULT false;

-- ── instagram_accounts: profile & relogin ──
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "profile_picture_url" TEXT;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "encrypted_password" TEXT;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "auto_relogin_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "last_relogin_at" TIMESTAMP(3);
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "relogin_fail_count" INTEGER NOT NULL DEFAULT 0;

-- ── instagram_accounts: circuit breaker ──
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "consecutive_failures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "last_failure_at" TIMESTAMP(3);
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "is_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "pause_reason" TEXT;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "paused_until" TIMESTAMP(3);

-- ── instagram_accounts: risk scoring ──
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "risk_updated_at" TIMESTAMP(3);

-- ── instagram_accounts: behavior model ──
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "behavior_seed" DOUBLE PRECISION;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "working_hours_start" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "working_hours_end" INTEGER NOT NULL DEFAULT 22;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "aggression_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- ── instagram_accounts: override governance ──
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "override_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "override_requested_at" TIMESTAMP(3);
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "override_expires_at" TIMESTAMP(3);
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "override_count" INTEGER NOT NULL DEFAULT 0;

-- ── instagram_accounts: warmup ──
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "account_age_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "instagram_accounts" ADD COLUMN IF NOT EXISTS "warmup_mode" BOOLEAN NOT NULL DEFAULT true;

-- ── automations: newer feature columns ──
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "comment_reply_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "comment_reply_message" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "comment_replies" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "selected_media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "monitor_all_posts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "ask_for_follow_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "ask_for_follow_message" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "skip_non_followers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "lead_collection_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "lead_fields" JSONB;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "ai_reply_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "ai_context" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "ai_product_info" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "ai_cta_url" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "webhook_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "webhook_url" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "webhook_secret" TEXT;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "leads_collected" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "dms_opened" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "links_clicked" INTEGER NOT NULL DEFAULT 0;

-- ── triggers: newer columns ──
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "incoming_dm_text" TEXT;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "comment_replied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "comment_replied_at" TIMESTAMP(3);
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "is_follower" BOOLEAN;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "follow_requested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "followed_at" TIMESTAMP(3);
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "conversation_step" TEXT NOT NULL DEFAULT 'opening';
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "button_clicked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "button_clicked_at" TIMESTAMP(3);
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "email_collected" TEXT;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "link_sent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "link_sent_at" TIMESTAMP(3);
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "follow_up_sent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "triggers" ADD COLUMN IF NOT EXISTS "follow_up_sent_at" TIMESTAMP(3);

-- ── dm_history: newer columns ──
ALTER TABLE "dm_history" ADD COLUMN IF NOT EXISTS "send_latency_ms" INTEGER;
ALTER TABLE "dm_history" ADD COLUMN IF NOT EXISTS "replied_at" TIMESTAMP(3);
ALTER TABLE "dm_history" ADD COLUMN IF NOT EXISTS "send_attempt_id" TEXT;

-- ── dm_queue: newer columns ──
ALTER TABLE "dm_queue" ADD COLUMN IF NOT EXISTS "send_attempt_id" TEXT;

-- ── account_health_snapshots table (may not exist) ──
CREATE TABLE IF NOT EXISTS "account_health_snapshots" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dms_sent" INTEGER NOT NULL DEFAULT 0,
    "dms_failed" INTEGER NOT NULL DEFAULT 0,
    "dms_dropped" INTEGER NOT NULL DEFAULT 0,
    "dms_expired" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DOUBLE PRECISION,
    "avg_latency_ms" INTEGER,
    "reply_rate" DOUBLE PRECISION,
    "risk_score_end" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "success_rate_stddev" DOUBLE PRECISION,
    "latency_stddev" DOUBLE PRECISION,
    "volume_stddev" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "account_health_snapshots_ig_account_id_date_idx"
    ON "account_health_snapshots"("ig_account_id", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "account_health_snapshots_ig_account_id_date_key"
    ON "account_health_snapshots"("ig_account_id", "date");

-- ── enforcement_events table (may not exist) ──
CREATE TABLE IF NOT EXISTS "enforcement_events" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "trigger_source" TEXT NOT NULL,
    "error_message" TEXT,
    "http_status_code" INTEGER,
    "error_subcode" TEXT,
    "risk_score_at_event" DOUBLE PRECISION NOT NULL,
    "success_rate_at_event" DOUBLE PRECISION,
    "latency_at_event" INTEGER,
    "density60_at_event" INTEGER,
    "daily_sent_at_event" INTEGER,
    "override_active_at_event" BOOLEAN NOT NULL DEFAULT false,
    "account_paused_at_event" BOOLEAN NOT NULL DEFAULT false,
    "volatility_level_at_event" TEXT,
    "control_model_version" TEXT NOT NULL DEFAULT '1.0.0',
    "send_attempt_id" TEXT,
    "action_taken" TEXT NOT NULL,
    "risk_delta" DOUBLE PRECISION,
    "throughput_before" INTEGER,
    "throughput_after" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "recovery_duration_ms" INTEGER,
    "dm_queue_id" TEXT,
    "recipient_username" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enforcement_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "enforcement_events_ig_account_id_created_at_idx"
    ON "enforcement_events"("ig_account_id", "created_at");
CREATE INDEX IF NOT EXISTS "enforcement_events_event_type_created_at_idx"
    ON "enforcement_events"("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "enforcement_events_send_attempt_id_idx"
    ON "enforcement_events"("send_attempt_id");

-- ── scheduled_reminders table (may not exist) ──
CREATE TABLE IF NOT EXISTS "scheduled_reminders" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "recipient_ig_id" TEXT NOT NULL,
    "recipient_username" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "attachment_url" TEXT,
    "attachment_type" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "reminder_type" TEXT NOT NULL,
    "recurring_interval" INTEGER,
    "max_reminders" INTEGER NOT NULL DEFAULT 3,
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "scheduled_reminders_pkey" PRIMARY KEY ("id")
);

-- ── conversation tables (may not exist) ──
CREATE TABLE IF NOT EXISTS "conversation_flows" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "flow_config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversation_flows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "conversation_steps" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "step_type" TEXT NOT NULL,
    "message_text" TEXT,
    "attachment_url" TEXT,
    "attachment_type" TEXT,
    "button_text" TEXT,
    "button_url" TEXT,
    "condition_type" TEXT,
    "condition_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "condition_operator" TEXT,
    "delay_minutes" INTEGER,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "next_step_on_success" TEXT,
    "next_step_on_failure" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "user_ig_id" TEXT NOT NULL,
    "user_username" TEXT NOT NULL,
    "current_step_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_follower" BOOLEAN,
    "last_message_sent_at" TIMESTAMP(3),
    "last_reply_received_at" TIMESTAMP(3),
    "last_reply_text" TEXT,
    "next_reminder_at" TIMESTAMP(3),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_flow_id_user_ig_id_key"
    ON "conversations"("flow_id", "user_ig_id");

CREATE TABLE IF NOT EXISTS "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "step_id" TEXT,
    "direction" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "attachment_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- ── leads table (may not exist) ──
CREATE TABLE IF NOT EXISTS "leads" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "ig_username" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "custom_data" JSONB,
    "source_comment_id" TEXT,
    "source_media_id" TEXT,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "leads_automation_id_ig_user_id_key"
    ON "leads"("automation_id", "ig_user_id");
