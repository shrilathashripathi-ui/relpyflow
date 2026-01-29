const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'replyflow',
});

const createTablesSQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  email_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  verification_token_expires TIMESTAMP,
  reset_token TEXT,
  reset_token_expires TIMESTAMP,
  subscription_plan TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'trial',
  trial_ends_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Instagram Accounts table
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ig_user_id TEXT,
  username TEXT NOT NULL,
  session_cookies TEXT,
  csrf_token TEXT,
  user_agent TEXT,
  assigned_proxy_ip TEXT,
  status TEXT DEFAULT 'active',
  last_activity_at TIMESTAMP,
  last_action_block_at TIMESTAMP,
  action_block_count INTEGER DEFAULT 0,
  account_age_days INTEGER DEFAULT 0,
  warmup_mode BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, username)
);

-- Monitored Reels table
CREATE TABLE IF NOT EXISTS monitored_reels (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  media_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  is_active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMP,
  custom_keywords TEXT[],
  custom_message_template_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ig_account_id, media_id)
);

-- Keywords table
CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  case_sensitive BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Message Templates table
CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  name TEXT,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- DM Queue table
CREATE TABLE IF NOT EXISTS dm_queue (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  monitored_reel_id TEXT NOT NULL REFERENCES monitored_reels(id) ON DELETE CASCADE,
  recipient_ig_id TEXT NOT NULL,
  recipient_username TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  comment_text TEXT,
  detected_keyword TEXT,
  message_to_send TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  scheduled_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  sent_at TIMESTAMP
);

-- DM History table
CREATE TABLE IF NOT EXISTS dm_history (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  monitored_reel_id TEXT REFERENCES monitored_reels(id) ON DELETE SET NULL,
  recipient_ig_id TEXT NOT NULL,
  recipient_username TEXT NOT NULL,
  comment_id TEXT,
  comment_text TEXT,
  detected_keyword TEXT,
  message_sent TEXT,
  status TEXT,
  error_message TEXT,
  dm_sent_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ig_account_id, monitored_reel_id, recipient_ig_id)
);

-- Rate Limit Config table
CREATE TABLE IF NOT EXISTS rate_limit_config (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT UNIQUE NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  max_dms_per_hour INTEGER DEFAULT 10,
  max_dms_per_day INTEGER DEFAULT 50,
  min_delay_seconds INTEGER DEFAULT 30,
  max_delay_seconds INTEGER DEFAULT 120,
  warmup_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notification Settings table
CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  email_action_block BOOLEAN DEFAULT true,
  email_session_expired BOOLEAN DEFAULT true,
  email_daily_limit BOOLEAN DEFAULT true,
  notification_email TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Daily Analytics table
CREATE TABLE IF NOT EXISTS daily_analytics (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  comments_detected INTEGER DEFAULT 0,
  dms_queued INTEGER DEFAULT 0,
  dms_sent INTEGER DEFAULT 0,
  dms_failed INTEGER DEFAULT 0,
  action_blocks INTEGER DEFAULT 0,
  UNIQUE(ig_account_id, date)
);

-- Username Filters table
CREATE TABLE IF NOT EXISTS username_filters (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  filter_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ig_account_id, username, filter_type)
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_provider TEXT,
  payment_provider_subscription_id TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage Tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  dms_sent_count INTEGER DEFAULT 0,
  ig_accounts_connected INTEGER DEFAULT 0,
  reels_monitored INTEGER DEFAULT 0,
  UNIQUE(user_id, period_start)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_monitored_reels_ig_account_id ON monitored_reels(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_keywords_ig_account_id ON keywords(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_dm_queue_status ON dm_queue(status);
CREATE INDEX IF NOT EXISTS idx_dm_queue_scheduled_at ON dm_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_dm_history_ig_account_id ON dm_history(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_daily_analytics_date ON daily_analytics(date);
`;

async function migrate() {
  console.log('🔄 Starting database migration...\n');

  try {
    await pool.query(createTablesSQL);
    console.log('✅ All tables created successfully!\n');

    // Verify tables
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('📊 Database tables:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    console.log(`\n✅ Migration complete! ${result.rows.length} tables created.\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
