const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const instagramRoutes = require('./routes/instagram');
const automationRoutes = require('./routes/automation');
const subscriptionRoutes = require('./routes/subscription');
const conversationFlowRoutes = require('./routes/conversationFlow');
const analyticsRoutes = require('./routes/analytics');
const webhookRoutes = require('./routes/webhook');
const razorpayWebhookRoutes = require('./routes/razorpayWebhook');

// Rate limiting
const {
  globalLimiter,
  authLimiter,
  oauthLimiter,
  webhookLimiter,
  workerLimiter,
} = require('./middleware/rateLimit');

// Import workers and services
const commentPoller = require('./services/instagram/commentPoller');
const dmQueueWorker = require('./services/dmQueueWorker');
const uptimeMonitor = require('./services/uptimeMonitor');
// const aiReplyService = require('./services/aiReplyService');
const dmConversationHandler = require('./services/dmConversationHandler');

const app = express();

// Trust proxy (DigitalOcean App Platform uses a reverse proxy / load balancer)
// Required for express-rate-limit to get correct client IP from X-Forwarded-For
app.set('trust proxy', 1);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server, health checks)
    if (!origin) return callback(null, true);

    if (process.env.NODE_ENV === 'production') {
      // Production: strict whitelist only
      const productionOrigins = [
        'https://app.replyflows.in',
        'https://replyflows.in',
      ];
      if (process.env.FRONTEND_URL) {
        productionOrigins.push(process.env.FRONTEND_URL);
      }
      if (productionOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }

    // Development: allow all origins (localhost, ngrok, etc.)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// Razorpay webhook needs raw body BEFORE express.json() parses it
app.use('/api/razorpay/webhook', webhookLimiter, express.raw({ type: 'application/json' }), razorpayWebhookRoutes);

// Middleware
app.use(cors(corsOptions));
app.use(express.json({
  // Save raw body for Meta webhook signature verification
  verify: (req, res, buf) => {
    if (req.originalUrl.startsWith('/webhook') || req.originalUrl.startsWith('/api/meta/webhook')) {
      req.rawBody = buf;
    }
  }
}));
app.use(cookieParser());

// Note: Static marketing content (index.html) is served from Vercel at replyflows.in
// Only serve legal pages from public/ for Meta App Review compatibility

// Routes — with rate limiting per group
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/instagram', globalLimiter, instagramRoutes);
app.use('/api/automation', globalLimiter, automationRoutes);
app.use('/api/subscription', globalLimiter, subscriptionRoutes);
app.use('/api/conversation-flow', globalLimiter, conversationFlowRoutes);
app.use('/api/analytics', globalLimiter, analyticsRoutes);
app.use('/webhook', webhookLimiter, webhookRoutes);
app.use('/api/meta/webhook', webhookLimiter, webhookRoutes);

// Legal pages
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'privacy-policy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'terms.html')));
app.get('/data-deletion', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'data-deletion.html')));

// Enhanced health check with uptime monitoring
app.get('/health', (req, res) => {
  const status = uptimeMonitor.getStatus();
  res.json({
    status: status.status,
    uptime: status.uptime.formatted,
    message: 'ReplyFlow API is running',
    workers: {
      commentPoller: commentPoller.isRunning,
      dmQueueWorker: dmQueueWorker.isRunning
    },
    database: status.database,
    sessions: status.sessions
  });
});

// Public health endpoint (for external monitoring services)
app.get('/health/ping', (req, res) => {
  res.send('pong');
});

// Simple health endpoint for DigitalOcean App Platform / external uptime monitors
app.get('/health/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Admin-only middleware for worker control
const requireAdmin = (req, res, next) => {
  const adminSecret = process.env.ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'];
  if (!adminSecret || provided !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Worker control endpoints (protected + rate limited)
app.post('/api/workers/start', workerLimiter, requireAdmin, (req, res) => {
  commentPoller.start();
  dmQueueWorker.start();
  dmConversationHandler.startConversationHandler();

  // Update uptime monitor
  uptimeMonitor.setWorkerStatus('commentPoller', true);
  uptimeMonitor.setWorkerStatus('dmQueueWorker', true);
  uptimeMonitor.setWorkerStatus('dmConversationHandler', true);

  res.json({ message: 'Workers started' });
});

app.post('/api/workers/stop', workerLimiter, requireAdmin, (req, res) => {
  commentPoller.stop();
  dmQueueWorker.stop();
  dmConversationHandler.stopConversationHandler();

  // Update uptime monitor
  uptimeMonitor.setWorkerStatus('commentPoller', false);
  uptimeMonitor.setWorkerStatus('dmQueueWorker', false);
  uptimeMonitor.setWorkerStatus('dmConversationHandler', false);

  res.json({ message: 'Workers stopped' });
});

// Worker status endpoint (protected + rate limited)
app.get('/api/workers/status', workerLimiter, requireAdmin, (req, res) => {
  res.json({
    commentPoller: {
      running: commentPoller.isRunning,
      interval: commentPoller.pollInterval
    },
    dmQueueWorker: {
      running: dmQueueWorker.isRunning,
      processing: dmQueueWorker.isProcessing,
      interval: dmQueueWorker.processInterval
    }
  });
});

const PORT = process.env.PORT || 5000;

// Run pending database migrations (raw SQL - works even when prisma db push fails)
const { pool } = require('./config/database');
(async () => {
  try {
    await pool.query(`ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;`);
    console.log('✅ Database schema verified');
  } catch (err) {
    console.error('⚠️ Schema migration warning:', err.message);
  }
})();

app.listen(PORT, () => {
  console.log(`✅ ReplyFlow server running on port ${PORT}`);

  // Initialize services
  console.log('📊 Starting uptime monitor...');
  uptimeMonitor.start(60000); // Check every minute


  // Auto-start workers in production or if explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.AUTO_START_WORKERS === 'true') {
    console.log('🤖 Auto-starting automation workers...');
    commentPoller.start();
    dmQueueWorker.start();
    dmConversationHandler.startConversationHandler();

    uptimeMonitor.setWorkerStatus('commentPoller', true);
    uptimeMonitor.setWorkerStatus('dmQueueWorker', true);
    uptimeMonitor.setWorkerStatus('dmConversationHandler', true);
  } else {
    console.log('💡 Workers not auto-started. Use POST /api/workers/start to begin automation.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  commentPoller.stop();
  dmQueueWorker.stop();
  dmConversationHandler.stopConversationHandler();
  uptimeMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  commentPoller.stop();
  dmQueueWorker.stop();
  dmConversationHandler.stopConversationHandler();
  uptimeMonitor.stop();
  process.exit(0);
});
