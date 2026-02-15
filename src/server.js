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

// Import workers and services
const commentPoller = require('./services/instagram/commentPoller');
const dmQueueWorker = require('./services/dmQueueWorker');
const uptimeMonitor = require('./services/uptimeMonitor');
const aiReplyService = require('./services/aiReplyService');
const dmConversationHandler = require('./services/dmConversationHandler');

const app = express();

// CORS configuration for ngrok and local development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Allowed origins
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];

    // Allow ngrok URLs
    if (origin.includes('ngrok') || origin.includes('ngrok-free.app')) {
      return callback(null, true);
    }

    // Allow production frontend
    if (origin === 'https://app.replyflows.in') {
      return callback(null, true);
    }

    // Allow custom frontend URL from env
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }

    // Check against allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow all
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// Razorpay webhook needs raw body BEFORE express.json() parses it
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }), razorpayWebhookRoutes);

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Serve static files (privacy policy, terms, data deletion pages)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/conversation-flow', conversationFlowRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api/meta/webhook', webhookRoutes);

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

// Worker control endpoints
app.post('/api/workers/start', (req, res) => {
  commentPoller.start();
  dmQueueWorker.start();
  dmConversationHandler.startConversationHandler();

  // Update uptime monitor
  uptimeMonitor.setWorkerStatus('commentPoller', true);
  uptimeMonitor.setWorkerStatus('dmQueueWorker', true);
  uptimeMonitor.setWorkerStatus('dmConversationHandler', true);

  res.json({ message: 'Workers started' });
});

app.post('/api/workers/stop', (req, res) => {
  commentPoller.stop();
  dmQueueWorker.stop();
  dmConversationHandler.stopConversationHandler();

  // Update uptime monitor
  uptimeMonitor.setWorkerStatus('commentPoller', false);
  uptimeMonitor.setWorkerStatus('dmQueueWorker', false);
  uptimeMonitor.setWorkerStatus('dmConversationHandler', false);

  res.json({ message: 'Workers stopped' });
});

// Worker status endpoint
app.get('/api/workers/status', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`✅ ReplyFlow server running on port ${PORT}`);

  // Initialize services
  console.log('📊 Starting uptime monitor...');
  uptimeMonitor.start(60000); // Check every minute

  // Initialize AI service if API key is set
  if (process.env.OPENAI_API_KEY) {
    aiReplyService.init();
  } else {
    console.log('⚠️ OPENAI_API_KEY not set - AI replies disabled');
  }

  // Auto-start workers in production or if enabled
  if (process.env.AUTO_START_WORKERS === 'true') {
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
