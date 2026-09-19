const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * Rate Limiting Middleware
 *
 * Protects against brute force attacks, API abuse, and DDoS.
 *
 * Strategy:
 * - Unauthenticated routes (login, register, OAuth): IP-based only
 *   This is correct — before auth, IP is the only identifier.
 * - Authenticated routes (API, sync, workers): User ID + IP hybrid
 *   Prevents shared-IP false positives (coworking spaces, mobile carriers)
 *   while still protecting against abuse.
 * - Webhooks: IP-based (Meta/Razorpay have known IPs, high burst)
 *
 * Behind a reverse proxy (DigitalOcean App Platform), req.ip
 * is set from X-Forwarded-For when trust proxy is enabled.
 */

// ─── Key Generator: User ID if authenticated, IP if not ─────────
const userOrIpKey = (req) => {
  // req.user is set by the protect middleware (JWT auth)
  if (req.user?.id) return `user_${req.user.id}`;
  // Normalize IP via the helper so IPv6 clients are keyed by subnet, not by a
  // single address they can trivially rotate to bypass the limit.
  return ipKeyGenerator(req.ip);
};

// ─── Global API Limiter ──────────────────────────────────────────
// Applies to ALL /api/* routes (keyed by user when authenticated)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // 200 requests per 15 min per user/IP
  keyGenerator: userOrIpKey,
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,      // Disable X-RateLimit-* headers
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: '15 minutes',
  },
});

// ─── Auth Route Limiter (Strict) ─────────────────────────────────
// Login + Register: IP-only (user is not yet authenticated)
// Prevents brute force and credential stuffing
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
// Instagram OAuth initiation: IP-only (prevent redirect abuse)
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
// Instagram media fetch, account sync: keyed by user
// (coworking space users shouldn't block each other)
const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 30,                    // 30 requests per 5 min per user/IP
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many sync requests. Please wait before trying again.',
    retryAfter: '5 minutes',
  },
});

// ─── Webhook Limiter (Relaxed) ──────────────────────────────────
// Meta/Razorpay webhooks: IP-based, higher limits (Meta can burst)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 100,                   // 100 per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Webhook rate limit exceeded.',
  },
});

// ─── Worker Control Limiter ─────────────────────────────────────
// Admin worker endpoints: IP-based, very strict (already behind requireAdmin)
const workerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many worker control requests.',
  },
});

// ─── OTP Verification Limiter (Very Strict) ─────────────────────
// Prevents brute-forcing 6-digit OTPs (1M combinations)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 OTP attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many verification attempts. Please wait 15 minutes.',
    retryAfter: '15 minutes',
  },
});

// ─── Account Creation Limiter (Strict) ───────────────────────────
// Prevents mass account creation by bots
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                     // 5 registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many accounts created. Please try again later.',
    retryAfter: '1 hour',
  },
});

module.exports = {
  globalLimiter,
  authLimiter,
  oauthLimiter,
  syncLimiter,
  webhookLimiter,
  workerLimiter,
  otpLimiter,
  registrationLimiter,
};
