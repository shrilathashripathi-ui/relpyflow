/**
 * Structured Logging with Pino
 *
 * Replaces raw console.log/error/warn across the entire codebase.
 * In production: JSON output (machine-parseable for DigitalOcean Logs).
 * In development: pretty-printed via pino-pretty.
 *
 * Sensitive fields are auto-redacted: tokens, passwords, cookies, secrets.
 *
 * Usage:
 *   const log = require('../utils/logger');
 *   log.info({ accountId, density60 }, 'DM sent successfully');
 *   log.warn({ riskScore }, 'Latency anomaly detected');
 *   log.error({ err }, 'Queue processing failed');
 *
 * To override console globally (zero-refactor migration for 300+ console.log statements):
 *   require('./utils/logger').overrideConsole();
 */
const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),

  // Redact sensitive fields — never leak tokens/passwords in logs
  redact: {
    paths: [
      'accessToken',
      'sessionCookies',
      'csrfToken',
      'encryptedPassword',
      'password',
      'passwordHash',
      'token',
      'secret',
      'webhookSecret',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },

  // Pretty print in development, raw JSON in production
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,

  // Base fields attached to every log line
  base: {
    service: 'replyflow',
    env: process.env.NODE_ENV || 'development',
  },

  // Timestamp in ISO 8601 format
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Override console.log/warn/error/info to route through Pino.
 *
 * This is a zero-refactor migration strategy: all 300+ existing console.log()
 * statements instantly become structured JSON logs without changing a single line.
 *
 * Call once at app startup: require('./utils/logger').overrideConsole()
 *
 * Strips emoji prefixes for cleaner structured output while preserving the message.
 */
function overrideConsole() {
  const stripEmoji = (msg) => {
    if (typeof msg !== 'string') return msg;
    // Remove leading emoji + space (e.g., "🚀 Starting..." → "Starting...")
    return msg.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}\u{2702}-\u{27B0}\u{E0020}-\u{E007F}✅❌⚠️🔴🔓🎰⏰🔻📊🔥💀📬⏱️🤖🔗🔍📤⏳⏭️🚀🛑]+\s*/u, '');
  };

  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };

  console.log = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? stripEmoji(a) : a);
    if (msg.length === 1 && typeof msg[0] === 'string') {
      logger.info(msg[0]);
    } else if (msg.length === 2 && typeof msg[0] === 'string' && typeof msg[1] === 'object') {
      logger.info(msg[1], msg[0]);
    } else {
      logger.info(msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' '));
    }
  };

  console.error = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? stripEmoji(a) : a);
    if (msg.length === 1 && typeof msg[0] === 'string') {
      logger.error(msg[0]);
    } else if (msg.length >= 2 && typeof msg[0] === 'string') {
      const rest = msg.slice(1);
      const errObj = rest.find(r => r instanceof Error);
      if (errObj) {
        logger.error({ err: errObj }, msg[0]);
      } else {
        logger.error(msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' '));
      }
    } else {
      logger.error(msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' '));
    }
  };

  console.warn = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? stripEmoji(a) : a);
    if (msg.length === 1 && typeof msg[0] === 'string') {
      logger.warn(msg[0]);
    } else {
      logger.warn(msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' '));
    }
  };

  console.info = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? stripEmoji(a) : a);
    if (msg.length === 1 && typeof msg[0] === 'string') {
      logger.info(msg[0]);
    } else {
      logger.info(msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' '));
    }
  };

  console.debug = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? stripEmoji(a) : a);
    if (msg.length === 1 && typeof msg[0] === 'string') {
      logger.debug(msg[0]);
    } else {
      logger.debug(msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' '));
    }
  };

  // Store originals in case we need to restore
  logger._originalConsole = originalConsole;
}

// Attach helper to the logger instance
logger.overrideConsole = overrideConsole;

module.exports = logger;
