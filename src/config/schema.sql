-- ============================================
-- REPLYFLOW DATABASE SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  verification_token_expires TIMESTAMP,
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP,
  
  subscription_plan VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50) DEFAULT 'trial',
  trial_ends_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days',
  subscription_ends_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_token ON users(verification_token);
CREATE INDEX idx_users_reset_token ON users(reset_token);

-- ============================================
-- INSTAGRAM ACCOUNTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  ig_user_id VARCHAR(255),
  username VARCHAR(255) NOT NULL,
  
  session_cookies TEXT,
  csrf_token TEXT,
  user_agent TEXT,
  
  assigned_proxy_ip VARCHAR(50),
  
  status VARCHAR(50) DEFAULT 'active',
  last_activity_at TIMESTAMP,
  last_action_block_at TIMESTAMP,
  action_block_count INT DEFAULT 0,
  
  account_age_days INT DEFAULT 0,
  warmup_mode BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_user_username UNIQUE(user_id, username)
);

CREATE INDEX idx_ig_accounts_user ON instagram_accounts(user_id);
CREATE INDEX idx_ig_accounts_status ON instagram_accounts(status);
CREATE INDEX idx_ig_accounts_username ON instagram_accounts(username);

-- ============================================
-- MONITORED REELS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS monitored_reels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  
  media_id VARCHAR(255) NOT NULL,
  media_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  
  is_active BOOLEAN DEFAULT TRUE,
  last_checked_at TIMESTAMP,
  
  custom_keywords TEXT[],
  custom_message_template_id UUID,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_account_media UNIQUE(ig_account_id, media_id)
);

CREATE INDEX idx_monitored_reels_account ON monitored_reels(ig_account_id, is_active);
CREATE INDEX idx_monitored_reels_active ON monitored_reels(is_active, last_checked_at);

-- ============================================
-- KEYWORDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  
  keyword VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  case_sensitive BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_keywords_account ON keywords(ig_account_id, is_active);

-- ============================================
-- MESSAGE TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  
  name VARCHAR(255),
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_templates_account ON message_templates(ig_account_id);
CREATE INDEX idx_templates_default ON message_templates(ig_account_id, is_default);

-- ============================================
-- DM QUEUE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS dm_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  monitored_reel_id UUID REFERENCES monitored_reels(id) ON DELETE CASCADE,
  
  recipient_ig_id VARCHAR(255) NOT NULL,
  recipient_username VARCHAR(255) NOT NULL,
  
  comment_id VARCHAR(255) NOT NULL,
  comment_text TEXT,
  detected_keyword VARCHAR(100),
  
  message_to_send TEXT NOT NULL,
  
  priority INT DEFAULT 0,
  scheduled_at TIMESTAMP DEFAULT NOW(),
  
  status VARCHAR(50) DEFAULT 'pending',
  
  retry_count INT DEFAULT 0,
  error_code VARCHAR(100),
  error_message TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  sent_at TIMESTAMP
);

CREATE INDEX idx_dm_queue_status ON dm_queue(status, scheduled_at);
CREATE INDEX idx_dm_queue_account ON dm_queue(ig_account_id, status);
CREATE INDEX idx_dm_queue_processing ON dm_queue(status, priority DESC, scheduled_at ASC);

-- ============================================
-- DM HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS dm_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  monitored_reel_id UUID REFERENCES monitored_reels(id) ON DELETE SET NULL,
  
  recipient_ig_id VARCHAR(255) NOT NULL,
  recipient_username VARCHAR(255) NOT NULL,
  
  comment_id VARCHAR(255),
  comment_text TEXT,
  detected_keyword VARCHAR(100),
  
  message_sent TEXT,
  
  status VARCHAR(50),
  error_message TEXT,
  
  dm_sent_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_account_reel_recipient UNIQUE(ig_account_id, monitored_reel_id, recipient_ig_id)
);

CREATE INDEX idx_dm_history_account_time ON dm_history(ig_account_id, dm_sent_at DESC);
CREATE INDEX idx_dm_history_reel ON dm_history(monitored_reel_id);
CREATE INDEX idx_dm_history_recipient ON dm_history(recipient_ig_id);

-- ============================================
-- RATE LIMIT CONFIG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limit_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE UNIQUE,
  
  max_dms_per_hour INT DEFAULT 10,
  max_dms_per_day INT DEFAULT 50,
  min_delay_seconds INT DEFAULT 30,
  max_delay_seconds INT DEFAULT 120,
  
  warmup_enabled BOOLEAN DEFAULT TRUE,
  
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- NOTIFICATION SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  email_notifications BOOLEAN DEFAULT TRUE,
  email_action_block BOOLEAN DEFAULT TRUE,
  email_session_expired BOOLEAN DEFAULT TRUE,
  email_daily_limit BOOLEAN DEFAULT TRUE,
  
  notification_email VARCHAR(255),
  
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- DAILY ANALYTICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS daily_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  comments_detected INT DEFAULT 0,
  dms_queued INT DEFAULT 0,
  dms_sent INT DEFAULT 0,
  dms_failed INT DEFAULT 0,
  action_blocks INT DEFAULT 0,
  
  CONSTRAINT unique_account_date UNIQUE(ig_account_id, date)
);

CREATE INDEX idx_analytics_account_date ON daily_analytics(ig_account_id, date DESC);

-- ============================================
-- USERNAME FILTERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS username_filters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_account_id UUID REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  
  username VARCHAR(255) NOT NULL,
  filter_type VARCHAR(50) NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_account_username_filter UNIQUE(ig_account_id, username, filter_type)
);

CREATE INDEX idx_username_filters_account ON username_filters(ig_account_id, filter_type);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  
  payment_provider VARCHAR(50),
  payment_provider_subscription_id VARCHAR(255),
  
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ============================================
-- USAGE TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  dms_sent_count INT DEFAULT 0,
  ig_accounts_connected INT DEFAULT 0,
  reels_monitored INT DEFAULT 0,
  
  CONSTRAINT unique_user_period UNIQUE(user_id, period_start)
);

CREATE INDEX idx_usage_tracking_user ON usage_tracking(user_id, period_start DESC);