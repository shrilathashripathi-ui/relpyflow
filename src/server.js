const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
require('dotenv').config();

// Structured logging: override console.log/error/warn → Pino JSON output
// This converts all 300+ existing console.log() statements into structured logs
// with zero refactoring. In production: JSON for DigitalOcean. In dev: pretty-printed.
const logger = require('./utils/logger');
logger.overrideConsole();

const authRoutes = require('./routes/auth');
const instagramRoutes = require('./routes/instagram');
const automationRoutes = require('./routes/automation');
const subscriptionRoutes = require('./routes/subscription');
const conversationFlowRoutes = require('./routes/conversationFlow');
const analyticsRoutes = require('./routes/analytics');
const webhookRoutes = require('./routes/webhook');
const razorpayWebhookRoutes = require('./routes/razorpayWebhook');
const debugRoutes = require('./routes/debug');
const accountHealthRoutes = require('./routes/accountHealth');

// Rate limiting
const {
  globalLimiter,
  authLimiter,
  oauthLimiter,
  webhookLimiter,
  otpLimiter,
  registrationLimiter,
} = require('./middleware/rateLimit');

// Import services
const uptimeMonitor = require('./services/uptimeMonitor');

// Workers — run in-process (single DigitalOcean web service)
const commentPoller = require('./services/instagram/commentPoller');
const dmQueueWorker = require('./services/dmQueueWorker');
const dmConversationHandler = require('./services/dmConversationHandler');
const healthSnapshotWorker = require('./services/healthSnapshotWorker');
const followUpWorker = require('./services/followUpWorker');

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

// Security headers — protects against XSS, clickjacking, MIME sniffing, etc.
app.use(helmet({
  contentSecurityPolicy: false, // Disabled — API-only server, no HTML rendering
  crossOriginEmbedderPolicy: false, // Allow cross-origin requests from frontend
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
  },
}));

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

// HTTP request logging — structured JSON in production, pretty in dev
// Skips health check endpoints to avoid log noise
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/health/ping' || req.url === '/health/status',
  },
  // Redact auth headers from request logs
  redact: ['req.headers.authorization', 'req.headers.cookie'],
}));

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
app.use('/debug', globalLimiter, debugRoutes);
app.use('/api/account-health', globalLimiter, accountHealthRoutes);

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

const PORT = process.env.PORT || 5000;

// Database schema is synced via `prisma migrate deploy` in the start script (package.json)
// All schema changes must go through versioned migrations in prisma/migrations/

app.listen(PORT, async () => {
  console.log(`✅ ReplyFlow server running on port ${PORT}`);

  // Reset any OAuth accounts stuck in paused/expired state on startup
  try {
    const prisma = require('./config/prisma');
    const stuck = await prisma.instagramAccount.findMany({
      where: {
        useOfficialApi: true,
        OR: [
          { isPaused: true },
          { status: { in: ['session_expired', 'token_expired', 'action_blocked'] } },
        ],
      },
      select: { id: true, username: true, status: true, isPaused: true, pauseReason: true },
    });
    if (stuck.length > 0) {
      for (const acct of stuck) {
        console.log(`🔧 Resetting OAuth account @${acct.username}: status=${acct.status}, isPaused=${acct.isPaused}, reason=${acct.pauseReason}`);
      }
      const fixed = await prisma.instagramAccount.updateMany({
        where: { id: { in: stuck.map(a => a.id) } },
        data: {
          status: 'active',
          isPaused: false,
          pauseReason: null,
          pausedUntil: null,
          consecutiveFailures: 0,
          lastFailureAt: null,
        },
      });
      console.log(`🔧 Fixed ${fixed.count} OAuth account(s) on startup`);
    }
  } catch (err) {
    console.error('⚠️ OAuth account fix failed:', err.message);
  }

  // Initialize uptime monitor
  console.log('📊 Starting uptime monitor...');
  uptimeMonitor.start(60000); // Check every minute

  // Start workers in-process (comment poller, DM queue, conversation handler)
  console.log('🤖 Starting workers...');
  try {
    commentPoller.start();
    console.log('  ✅ Comment poller started');

    dmQueueWorker.start();
    console.log('  ✅ DM queue worker started');

    await dmConversationHandler.startConversationHandler();
    console.log('  ✅ Conversation handler started');

    healthSnapshotWorker.start();
    console.log('  ✅ Health snapshot worker started');

    followUpWorker.start();
    console.log('  ✅ Follow-up worker started');

    console.log('🚀 All workers running. Automation is live.');
  } catch (err) {
    console.error('❌ Worker startup failed:', err.message);
    // Don't crash the server — API still works, workers can be restarted
  }
});

// Graceful shutdown — stop both server and workers
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  uptimeMonitor.stop();
  commentPoller.stop();
  dmQueueWorker.stop();
  dmConversationHandler.stopConversationHandler();
  healthSnapshotWorker.stop();
  followUpWorker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  uptimeMonitor.stop();
  commentPoller.stop();
  dmQueueWorker.stop();
  dmConversationHandler.stopConversationHandler();
  healthSnapshotWorker.stop();
  followUpWorker.stop();
  process.exit(0);
});
