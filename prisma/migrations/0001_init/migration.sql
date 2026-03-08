-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" TEXT,
    "verification_token_expires" TIMESTAMP(3),
    "reset_token" TEXT,
    "reset_token_expires" TIMESTAMP(3),
    "subscription_plan" TEXT NOT NULL DEFAULT 'free',
    "subscription_status" TEXT NOT NULL DEFAULT 'trial',
    "trial_ends_at" TIMESTAMP(3),
    "subscription_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ig_user_id" TEXT,
    "username" TEXT NOT NULL,
    "profile_picture_url" TEXT,
    "access_token" TEXT,
    "access_token_expiry" TIMESTAMP(3),
    "page_id" TEXT,
    "use_official_api" BOOLEAN NOT NULL DEFAULT false,
    "session_cookies" TEXT,
    "csrf_token" TEXT,
    "user_agent" TEXT,
    "assigned_proxy_ip" TEXT,
    "encrypted_password" TEXT,
    "auto_relogin_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_relogin_at" TIMESTAMP(3),
    "relogin_fail_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_activity_at" TIMESTAMP(3),
    "last_action_block_at" TIMESTAMP(3),
    "action_block_count" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_failure_at" TIMESTAMP(3),
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "pause_reason" TEXT,
    "paused_until" TIMESTAMP(3),
    "risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk_updated_at" TIMESTAMP(3),
    "behavior_seed" DOUBLE PRECISION,
    "working_hours_start" INTEGER NOT NULL DEFAULT 9,
    "working_hours_end" INTEGER NOT NULL DEFAULT 22,
    "aggression_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "override_active" BOOLEAN NOT NULL DEFAULT false,
    "override_requested_at" TIMESTAMP(3),
    "override_expires_at" TIMESTAMP(3),
    "override_count" INTEGER NOT NULL DEFAULT 0,
    "account_age_days" INTEGER NOT NULL DEFAULT 0,
    "warmup_mode" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitored_reels" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "media_url" TEXT,
    "thumbnail_url" TEXT,
    "caption" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_checked_at" TIMESTAMP(3),
    "custom_keywords" TEXT[],
    "custom_message_template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitored_reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "case_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "name" TEXT,
    "content" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_queue" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "monitored_reel_id" TEXT NOT NULL,
    "recipient_ig_id" TEXT NOT NULL,
    "recipient_username" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "comment_text" TEXT,
    "detected_keyword" TEXT,
    "message_to_send" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "send_attempt_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "dm_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_history" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "monitored_reel_id" TEXT,
    "recipient_ig_id" TEXT NOT NULL,
    "recipient_username" TEXT NOT NULL,
    "comment_id" TEXT,
    "comment_text" TEXT,
    "detected_keyword" TEXT,
    "message_sent" TEXT,
    "status" TEXT,
    "error_message" TEXT,
    "send_latency_ms" INTEGER,
    "replied_at" TIMESTAMP(3),
    "send_attempt_id" TEXT,
    "dm_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_config" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "max_dms_per_hour" INTEGER NOT NULL DEFAULT 10,
    "max_dms_per_day" INTEGER NOT NULL DEFAULT 50,
    "min_delay_seconds" INTEGER NOT NULL DEFAULT 30,
    "max_delay_seconds" INTEGER NOT NULL DEFAULT 120,
    "warmup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "email_action_block" BOOLEAN NOT NULL DEFAULT true,
    "email_session_expired" BOOLEAN NOT NULL DEFAULT true,
    "email_daily_limit" BOOLEAN NOT NULL DEFAULT true,
    "notification_email" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_analytics" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "comments_detected" INTEGER NOT NULL DEFAULT 0,
    "dms_queued" INTEGER NOT NULL DEFAULT 0,
    "dms_sent" INTEGER NOT NULL DEFAULT 0,
    "dms_failed" INTEGER NOT NULL DEFAULT 0,
    "action_blocks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "username_filters" (
    "id" TEXT NOT NULL,
    "ig_account_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "filter_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "username_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payment_provider" TEXT,
    "payment_provider_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_tracking" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "dms_sent_count" INTEGER NOT NULL DEFAULT 0,
    "ig_accounts_connected" INTEGER NOT NULL DEFAULT 0,
    "reels_monitored" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "instagram_account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'comment',
    "keywords" TEXT[],
    "response_message" TEXT NOT NULL,
    "comment_reply_enabled" BOOLEAN NOT NULL DEFAULT false,
    "comment_reply_message" TEXT,
    "comment_replies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selected_media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "monitor_all_posts" BOOLEAN NOT NULL DEFAULT false,
    "ask_for_follow_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ask_for_follow_message" TEXT,
    "skip_non_followers" BOOLEAN NOT NULL DEFAULT false,
    "lead_collection_enabled" BOOLEAN NOT NULL DEFAULT false,
    "lead_fields" JSONB,
    "ai_reply_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_context" TEXT,
    "ai_product_info" TEXT,
    "ai_cta_url" TEXT,
    "webhook_enabled" BOOLEAN NOT NULL DEFAULT false,
    "webhook_url" TEXT,
    "webhook_secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trigger_count" INTEGER NOT NULL DEFAULT 0,
    "dms_sent_count" INTEGER NOT NULL DEFAULT 0,
    "leads_collected" INTEGER NOT NULL DEFAULT 0,
    "dms_opened" INTEGER NOT NULL DEFAULT 0,
    "links_clicked" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triggers" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "commenter_ig_id" TEXT NOT NULL,
    "commenter_username" TEXT NOT NULL,
    "comment_id" TEXT,
    "comment_text" TEXT,
    "matched_keyword" TEXT NOT NULL,
    "incoming_dm_text" TEXT,
    "dm_sent" BOOLEAN NOT NULL DEFAULT false,
    "dm_sent_at" TIMESTAMP(3),
    "comment_replied" BOOLEAN NOT NULL DEFAULT false,
    "comment_replied_at" TIMESTAMP(3),
    "is_follower" BOOLEAN,
    "follow_requested" BOOLEAN NOT NULL DEFAULT false,
    "followed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "conversation_step" TEXT NOT NULL DEFAULT 'opening',
    "button_clicked" BOOLEAN NOT NULL DEFAULT false,
    "button_clicked_at" TIMESTAMP(3),
    "email_collected" TEXT,
    "link_sent" BOOLEAN NOT NULL DEFAULT false,
    "link_sent_at" TIMESTAMP(3),
    "follow_up_sent" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
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

-- CreateTable
CREATE TABLE "conversation_flows" (
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

-- CreateTable
CREATE TABLE "conversation_steps" (
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

-- CreateTable
CREATE TABLE "conversations" (
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

-- CreateTable
CREATE TABLE "conversation_messages" (
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

-- CreateTable
CREATE TABLE "scheduled_reminders" (
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

-- CreateTable
CREATE TABLE "account_health_snapshots" (
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

-- CreateTable
CREATE TABLE "enforcement_events" (
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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_user_id_username_key" ON "instagram_accounts"("user_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "monitored_reels_ig_account_id_media_id_key" ON "monitored_reels"("ig_account_id", "media_id");

-- CreateIndex
CREATE INDEX "dm_history_ig_account_id_dm_sent_at_idx" ON "dm_history"("ig_account_id", "dm_sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "dm_history_ig_account_id_monitored_reel_id_recipient_ig_id_key" ON "dm_history"("ig_account_id", "monitored_reel_id", "recipient_ig_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_config_ig_account_id_key" ON "rate_limit_config"("ig_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_user_id_key" ON "notification_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_analytics_ig_account_id_date_key" ON "daily_analytics"("ig_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "username_filters_ig_account_id_username_filter_type_key" ON "username_filters"("ig_account_id", "username", "filter_type");

-- CreateIndex
CREATE UNIQUE INDEX "usage_tracking_user_id_period_start_key" ON "usage_tracking"("user_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "triggers_automation_id_comment_id_key" ON "triggers"("automation_id", "comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_automation_id_ig_user_id_key" ON "leads"("automation_id", "ig_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_flow_id_user_ig_id_key" ON "conversations"("flow_id", "user_ig_id");

-- CreateIndex
CREATE INDEX "account_health_snapshots_ig_account_id_date_idx" ON "account_health_snapshots"("ig_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "account_health_snapshots_ig_account_id_date_key" ON "account_health_snapshots"("ig_account_id", "date");

-- CreateIndex
CREATE INDEX "enforcement_events_ig_account_id_created_at_idx" ON "enforcement_events"("ig_account_id", "created_at");

-- CreateIndex
CREATE INDEX "enforcement_events_event_type_created_at_idx" ON "enforcement_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "enforcement_events_send_attempt_id_idx" ON "enforcement_events"("send_attempt_id");

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_reels" ADD CONSTRAINT "monitored_reels_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_queue" ADD CONSTRAINT "dm_queue_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_queue" ADD CONSTRAINT "dm_queue_monitored_reel_id_fkey" FOREIGN KEY ("monitored_reel_id") REFERENCES "monitored_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_history" ADD CONSTRAINT "dm_history_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_history" ADD CONSTRAINT "dm_history_monitored_reel_id_fkey" FOREIGN KEY ("monitored_reel_id") REFERENCES "monitored_reels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_limit_config" ADD CONSTRAINT "rate_limit_config_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_analytics" ADD CONSTRAINT "daily_analytics_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "username_filters" ADD CONSTRAINT "username_filters_ig_account_id_fkey" FOREIGN KEY ("ig_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_tracking" ADD CONSTRAINT "usage_tracking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_instagram_account_id_fkey" FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_steps" ADD CONSTRAINT "conversation_steps_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "conversation_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "conversation_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 7.4.2                       │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
