const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware
 *
 * Protects against brute force attacks, API abuse, and DDoS.
 * Uses IP-based limiting via express-rate-limit.
 *
 * Behind a reverse proxy (DigitalOcean App Platform), req.ip
 * is set from X-Forwarded-For when trust proxy is enabled.
 */

// ─── Global API Limiter ──────────────────────────────────────────
// Applies to ALL /api/* routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // 200 requests per 15 min per IP
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,      // Disable X-RateLimit-* headers
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: '15 minutes',
  },
});

// ─── Auth Route Limiter (Strict) ─────────────────────────────────
// Login + Register: prevent brute force and credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    error: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
    retryAfter: '15 minutes',
  },
});

// ─── OAuth Route Limiter ─────────────────────────────────────────
// Instagram OAuth initiation: prevent abuse of redirect flow
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,                   // 15 OAuth attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many OAuth requests. Please wait before trying again.',
    retryAfter: '15 minutes',
  },
});

// ─── Media/Sync Limiter ─────────────────────────────────────────
// Instagram media fetch, account sync: prevent excessive API calls
const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 30,                    // 30 requests per 5 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many sync requests. Please wait before trying again.',
    retryAfter: '5 minutes',
  },
});

// ─── Webhook Limiter (Relaxed) ──────────────────────────────────
// Meta/Razorpay webhooks: higher limits since these come from Meta servers
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 100,                   // 100 per minute (Meta can burst)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Webhook rate limit exceeded.',
  },
});

// ─── Worker Control Limiter ─────────────────────────────────────
// Admin worker endpoints: very strict (already behind requireAdmin)
const workerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many worker control requests.',
  },
});

module.exports = {
  globalLimiter,
  authLimiter,
  oauthLimiter,
  syncLimiter,
  webhookLimiter,
  workerLimiter,
};
