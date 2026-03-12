const PuppeteerDMService = require('./instagram/puppeteerDmService');
const officialApi = require('./instagram/officialApiService');
const { decryptAccountTokens } = require('../utils/encryption');
const { pool } = require('../config/database');
const enforcement = require('./enforcementLogger');
const crypto = require('crypto');

const prisma = require('../config/prisma');

// Circuit breaker thresholds
const CB_GENERIC_FAIL_LIMIT = 5;       // 5 consecutive generic failures → pause
const CB_GENERIC_COOLDOWN_MS = 30 * 60 * 1000;  // 30 min cooldown
const CB_RATELIMIT_FAIL_LIMIT = 3;     // 3 consecutive rate limits → pause
const CB_RATELIMIT_COOLDOWN_MS = 2 * 60 * 60 * 1000;  // 2 hour cooldown
const CB_BLOCKED_COOLDOWN_MS = 24 * 60 * 60 * 1000;    // 24 hour cooldown

// Risk score engine constants (Phase 2)
const RISK_WEIGHTS = {
  RATE_LIMITED:     2.0,   // Each rate limit event adds 2.0 risk
  ACTION_BLOCKED:   5.0,   // Each action block adds 5.0 risk (severe)
  SESSION_EXPIRED:  3.0,   // Session errors add 3.0 risk
  GENERIC:          1.0,   // Generic failure adds 1.0 risk
};
const RISK_DECAY_PER_HOUR = 0.17;    // ~1 point per 6 hours (sticky — prevents burst/cool oscillation)
const RISK_SUCCESS_DECAY = 0.03;     // Small per-success decay — 8 DMs/hr ≈ 0.24 decay/hr
const RISK_MAX = 10;                 // Cap at 10

// Risk → throughput multiplier mapping
// risk 0-1 → 100%, risk 2-3 → 80%, risk 4-5 → 50%, risk 6-7 → 30%, risk 8+ → 15%
const RISK_THROUGHPUT_MAP = [
  { maxRisk: 1,  multiplier: 1.0  },
  { maxRisk: 3,  multiplier: 0.8  },
  { maxRisk: 5,  multiplier: 0.5  },
  { maxRisk: 7,  multiplier: 0.3  },
  { maxRisk: 10, multiplier: 0.15 },
];

// Stochastic delay model (Phase 6) — weighted random mimicking human behavior
// Humans cluster around 6-9 minute gaps with occasional fast/slow outliers
const DELAY_BUCKETS = [
  { weight: 0.15, minS: 180,  maxS: 360  },  // 15% → 3-6 min (quick reply)
  { weight: 0.55, minS: 360,  maxS: 540  },  // 55% → 6-9 min (most common)
  { weight: 0.20, minS: 600,  maxS: 900  },  // 20% → 10-15 min (busy)
  { weight: 0.10, minS: 900,  maxS: 1500 },  // 10% → 15-25 min (distracted)
];

// Engagement freshness / TTL (Phase 4)
const DM_TTL_MS = 12 * 60 * 60 * 1000;  // 12 hours — DMs older than this are expired
const FRESHNESS_DECAY_HALF_LIFE_MS = 3 * 60 * 60 * 1000; // freshness halves every 3 hours

// Anti-over-throttle: minimum throughput floor
// Even at max risk + max throttle, never drop below this fraction of base hourly limit.
// Ensures the account always trickles at least 1-2 DMs/hr unless explicitly paused.
const MINIMUM_HOURLY_FLOOR = 0.15;  // 15% of base → e.g., 8/hr base → floor of 1/hr

// Kill threshold: auto-pause if ALL of these are simultaneously true
// This is the "hard stop, no heroics" safety net.
const KILL_RISK_THRESHOLD = 8;          // Risk score above this
const KILL_SUCCESS_RATE_THRESHOLD = 0.4; // Success rate below this (40%)
const KILL_LATENCY_MULTIPLIER = 3.0;    // Current latency > 3× baseline
const KILL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24-hour hard pause

// Latency anomaly detection
const LATENCY_ANOMALY_MULTIPLIER = 1.8; // Current > 1.8× baseline → anomaly
const LATENCY_ANOMALY_MIN_SAMPLES = 5;  // Need at least 5 recent samples
const LATENCY_ANOMALY_RISK_PENALTY = 1.5; // Risk points added on anomaly
const LATENCY_ANOMALY_THROUGHPUT_CUT = 0.75; // Reduce throughput by 25% on anomaly

class DMQueueWorker {
  constructor() {
    this.isRunning = false;
    this.processInterval = 60000; // Check queue every 60 seconds (safer)
    this.intervalId = null;
    this.isProcessing = false; // Prevent concurrent processing

    // Fallback limits (used when no RateLimitConfig exists for account)
    this.DEFAULT_MAX_PER_HOUR = 8;
    this.DEFAULT_MAX_PER_DAY = 50;

    // Delay bounds (Phase 6 replaces these with stochastic model)
    this.MIN_DELAY_SECONDS = 120; // 2 minutes minimum between DMs
    this.MAX_DELAY_SECONDS = 300; // 5 minutes maximum
  }

  // ─── Concurrency Safety ───

  /**
   * Acquire a Postgres advisory lock for an account.
   * Prevents two worker instances from processing the same account simultaneously.
   * Uses pg_try_advisory_xact_lock — non-blocking, transaction-scoped.
   *
   * @param {string} accountId - UUID of the Instagram account
   * @returns {{ client, acquired, release }} - client for the transaction, acquired flag, release function
   */
  async acquireAccountLock(accountId) {
    const client = await pool.connect();
    try {
      // Hash UUID to a 32-bit integer for pg_advisory_lock
      // Simple hash: sum of char codes modulo 2^31
      let hash = 0;
      for (let i = 0; i < accountId.length; i++) {
        hash = ((hash << 5) - hash + accountId.charCodeAt(i)) | 0;
      }

      await client.query('BEGIN');
      const result = await client.query('SELECT pg_try_advisory_xact_lock($1) AS acquired', [hash]);
      const acquired = result.rows[0].acquired;

      if (!acquired) {
        await client.query('ROLLBACK');
        client.release();
        return { client: null, acquired: false, release: () => {} };
      }

      return {
        client,
        acquired: true,
        release: async () => {
          try {
            await client.query('COMMIT');
          } finally {
            client.release();
          }
        },
      };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
      return { client: null, acquired: false, release: () => {} };
    }
  }

  /**
   * Run an async function with a timeout.
   * If fn doesn't resolve within timeoutMs, rejects with TIMEOUT error.
   */
  withTimeout(fn, timeoutMs, label = 'operation') {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`TIMEOUT: ${label} exceeded ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Start the DM queue worker
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ DM queue worker is already running');
      return;
    }

    console.log('🚀 Starting DM queue worker...');
    this.isRunning = true;

    // Process immediately on start
    this.processQueue();

    // Then process at intervals
    this.intervalId = setInterval(() => this.processQueue(), this.processInterval);
  }

  /**
   * Stop the DM queue worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 DM queue worker stopped');
  }

  /**
   * Auto-unpause accounts whose cooldown has expired
   */
  async unpauseExpiredAccounts() {
    const now = new Date();

    // Find accounts about to be unpaused (need IDs for enforcement logging)
    const aboutToUnpause = await prisma.instagramAccount.findMany({
      where: {
        isPaused: true,
        pausedUntil: { not: null, lte: now },
      },
      select: { id: true, pauseReason: true },
    });

    if (aboutToUnpause.length === 0) return;

    // Unpause them
    await prisma.instagramAccount.updateMany({
      where: {
        isPaused: true,
        pausedUntil: { not: null, lte: now },
      },
      data: {
        isPaused: false,
        pauseReason: null,
        pausedUntil: null,
        consecutiveFailures: 0,
      },
    });

    console.log(`   🔓 Auto-unpaused ${aboutToUnpause.length} account(s) after cooldown`);

    // Log recovery events + resolve matching enforcement events
    for (const acct of aboutToUnpause) {
      await enforcement.log(acct.id, {
        eventType: 'unpause',
        triggerSource: 'circuit_breaker',
        actionTaken: 'no_action',
        errorMessage: `Unpaused after cooldown (was: ${acct.pauseReason})`,
      });

      // Resolve the original enforcement event that caused the pause
      const pauseEventType = acct.pauseReason?.includes('action_blocked') ? 'action_blocked'
        : acct.pauseReason?.includes('rate_limited') ? 'rate_limited'
        : acct.pauseReason?.includes('kill_threshold') ? 'kill_triggered'
        : 'consecutive_failures';
      await enforcement.markResolved(acct.id, pauseEventType);
    }
  }

  /**
   * Expire overrides that have passed their 24h window.
   * Also accrues +0.5 risk/hr while override is active (continuous cost).
   */
  async expireOverrides() {
    const now = new Date();

    // Expire overrides past their deadline
    const expired = await prisma.instagramAccount.updateMany({
      where: {
        overrideActive: true,
        overrideExpiresAt: { not: null, lte: now },
      },
      data: {
        overrideActive: false,
        overrideExpiresAt: null,
      },
    });
    if (expired.count > 0) {
      console.log(`   🔓 Auto-expired ${expired.count} user override(s)`);
    }

    // Accrue override risk: quadratic pressure near kill threshold.
    // Base rate: 0.5/hr. Scales quadratically as risk approaches KILL_RISK_THRESHOLD.
    // Formula: baseRate * (1 + (currentRisk / killThreshold)^2)
    //   risk 0 → 0.5/hr, risk 4 → 0.625/hr, risk 6 → 0.78/hr, risk 7.8 → 0.98/hr
    // This creates nonlinear urgency: accounts near the kill zone feel exponential pressure.
    // processQueue runs every 60s, so divide hourly rate by 60.
    const activeOverrides = await prisma.instagramAccount.findMany({
      where: { overrideActive: true },
      select: { id: true, riskScore: true },
    });
    for (const acct of activeOverrides) {
      const currentRisk = acct.riskScore || 0;
      const baseRate = 0.5;
      const riskRatio = currentRisk / KILL_RISK_THRESHOLD; // 0.0 → 1.0 as risk approaches kill
      const hourlyRate = baseRate * (1 + Math.pow(riskRatio, 2));

      const perCycleRate = hourlyRate / 60;
      const newRisk = Math.min(RISK_MAX, currentRisk + perCycleRate);
      await prisma.instagramAccount.update({
        where: { id: acct.id },
        data: { riskScore: newRisk, riskUpdatedAt: new Date() },
      });
    }
  }

  /**
   * Run deterministic recovery checks for all accounts with unresolved enforcement events.
   * Recovery criteria (all must be true simultaneously):
   *   1. Account is not paused
   *   2. Success rate > 80% over 2h window (min 5 samples)
   *   3. Latency within 1.5× of 7-day baseline
   *   4. No enforcement events for 2h
   *
   * This replaces fuzzy "account unpaused = recovered" with provable recovery.
   */
  async checkRecoveries() {
    try {
      // Find accounts with unresolved enforcement events
      const accountsWithUnresolved = await prisma.enforcementEvent.findMany({
        where: {
          resolvedAt: null,
          eventType: { in: ['action_blocked', 'rate_limited', 'kill_triggered', 'latency_anomaly', 'session_expired'] },
        },
        select: { igAccountId: true },
        distinct: ['igAccountId'],
      });

      for (const { igAccountId } of accountsWithUnresolved) {
        await enforcement.checkRecovery(igAccountId);
      }
    } catch (err) {
      console.error('   ❌ Recovery check sweep error:', err.message);
    }
  }

  /**
   * Pause an account via circuit breaker
   */
  async pauseAccount(accountId, reason, cooldownMs) {
    const pausedUntil = new Date(Date.now() + cooldownMs);
    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: {
        isPaused: true,
        pauseReason: reason,
        pausedUntil,
        lastFailureAt: new Date(),
      },
    });
    const mins = Math.round(cooldownMs / 60000);
    console.log(`   🔴 Account ${accountId} paused: "${reason}" — cooldown ${mins}m`);
  }

  /**
   * Record a failure and trigger circuit breaker if threshold reached
   */
  async recordFailure(accountId, errorType, errorContext = {}) {
    const account = await prisma.instagramAccount.update({
      where: { id: accountId },
      data: {
        consecutiveFailures: { increment: 1 },
        lastFailureAt: new Date(),
      },
    });

    const failures = account.consecutiveFailures;
    const riskWeight = RISK_WEIGHTS[errorType] ?? RISK_WEIGHTS.GENERIC;

    // Phase 2: Feed risk engine
    await this.addRisk(accountId, errorType);

    if (errorType === 'ACTION_BLOCKED') {
      // Auto-revoke any active user override — action block proves the override was harmful
      if (account.overrideActive) {
        await prisma.instagramAccount.update({
          where: { id: accountId },
          data: { overrideActive: false, overrideExpiresAt: null },
        });
        console.log(`   🚫 Override auto-revoked for account ${accountId} — action blocked`);

        await enforcement.log(accountId, {
          eventType: 'override_revoked',
          triggerSource: 'circuit_breaker',
          actionTaken: 'override_revoked',
          errorMessage: 'Override revoked due to action block',
          sendAttemptId: errorContext.sendAttemptId,
        });
      }

      await enforcement.log(accountId, {
        eventType: 'action_blocked',
        triggerSource: errorContext.source || 'instagram_api',
        actionTaken: 'paused_24h',
        errorMessage: errorContext.errorMessage,
        httpStatusCode: errorContext.httpStatusCode,
        riskDelta: riskWeight,
        dmQueueId: errorContext.dmQueueId,
        recipientUsername: errorContext.recipientUsername,
        sendAttemptId: errorContext.sendAttemptId,
      });

      await this.pauseAccount(accountId, 'action_blocked', CB_BLOCKED_COOLDOWN_MS);
      return;
    }

    if (errorType === 'RATE_LIMITED' && failures >= CB_RATELIMIT_FAIL_LIMIT) {
      await enforcement.log(accountId, {
        eventType: 'rate_limited',
        triggerSource: errorContext.source || 'instagram_api',
        actionTaken: 'paused_2h',
        errorMessage: errorContext.errorMessage,
        httpStatusCode: errorContext.httpStatusCode || 429,
        riskDelta: riskWeight,
        dmQueueId: errorContext.dmQueueId,
        recipientUsername: errorContext.recipientUsername,
        sendAttemptId: errorContext.sendAttemptId,
      });

      await this.pauseAccount(accountId, 'rate_limited_repeat', CB_RATELIMIT_COOLDOWN_MS);
      return;
    }

    if (errorType === 'RATE_LIMITED') {
      // Log rate limit even if not pausing (haven't hit repeat threshold)
      await enforcement.log(accountId, {
        eventType: 'rate_limited',
        triggerSource: errorContext.source || 'instagram_api',
        actionTaken: 'risk_added',
        errorMessage: errorContext.errorMessage,
        httpStatusCode: errorContext.httpStatusCode || 429,
        riskDelta: riskWeight,
        dmQueueId: errorContext.dmQueueId,
        recipientUsername: errorContext.recipientUsername,
        sendAttemptId: errorContext.sendAttemptId,
      });
    }

    if (errorType === 'SESSION_EXPIRED') {
      await enforcement.log(accountId, {
        eventType: 'session_expired',
        triggerSource: errorContext.source || 'instagram_api',
        actionTaken: 'risk_added',
        errorMessage: errorContext.errorMessage,
        riskDelta: riskWeight,
        sendAttemptId: errorContext.sendAttemptId,
      });
    }

    if (failures >= CB_GENERIC_FAIL_LIMIT) {
      await enforcement.log(accountId, {
        eventType: errorType.toLowerCase(),
        triggerSource: 'circuit_breaker',
        actionTaken: 'paused_30m',
        errorMessage: `${failures} consecutive failures`,
        riskDelta: riskWeight,
      });

      await this.pauseAccount(accountId, 'consecutive_failures', CB_GENERIC_COOLDOWN_MS);
    }
  }

  /**
   * Record a success — reset consecutive failure counter
   */
  async recordSuccess(accountId) {
    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: { consecutiveFailures: 0 },
    });

    // Phase 2: Decay risk on success
    await this.decayRiskOnSuccess(accountId);
  }

  // ─── Rolling Window Throughput Controller (Phase 1) ───

  /**
   * Count DMs sent by an account within a rolling time window.
   * Queries DmHistory (indexed on [igAccountId, dmSentAt]).
   */
  async getRollingDensity(accountId, windowMinutes) {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    return prisma.dmHistory.count({
      where: {
        igAccountId: accountId,
        status: 'sent',
        dmSentAt: { gte: since },
      },
    });
  }

  /**
   * Fetch per-account rate limits from RateLimitConfig.
   * Falls back to conservative defaults if no config exists.
   */
  async getAccountLimits(accountId) {
    const config = await prisma.rateLimitConfig.findUnique({
      where: { igAccountId: accountId },
    });

    const maxHour = config?.maxDmsPerHour ?? this.DEFAULT_MAX_PER_HOUR;
    const maxDay = config?.maxDmsPerDay ?? this.DEFAULT_MAX_PER_DAY;

    // Burst cap: max DMs allowed in any 10-minute window.
    // Ensures even distribution: 8/hour → max 2 per 10min, 12/hour → max 2, etc.
    const maxBurst = Math.max(1, Math.ceil(maxHour / 6));

    return { maxHour, maxDay, maxBurst };
  }

  /**
   * Rolling window admission check.
   * Returns { allowed, reason, density60, density10, limits }
   *
   * Three gates:
   *   1. Daily cap   — hard stop for the day
   *   2. density60    — sends in last 60 minutes vs maxHour
   *   3. density10    — sends in last 10 minutes vs maxBurst (prevents front-loading)
   */
  async canSendDM(accountId) {
    // Phase 7: Check working hours
    const personality = await this.getPersonality(accountId);
    if (!this.isWithinWorkingHours(personality)) {
      return { allowed: false, reason: `outside_working_hours (${personality.workStart}:00-${personality.workEnd}:00)`, density60: 0, density10: 0, limits: {} };
    }

    const baseLimits = await this.getAccountLimits(accountId);

    // Phase 2: Apply risk-based throughput reduction
    const riskScore = await this.getRiskScore(accountId);
    const riskMult = this.getThroughputMultiplier(riskScore);

    // Phase 7: Apply personality-based throughput adjustment
    const personalityMult = this.getPersonalityMultiplier(personality);

    // Combined multiplier: risk × personality
    const combinedMult = riskMult * personalityMult;

    const limits = {
      maxHour: Math.max(1, Math.floor(baseLimits.maxHour * combinedMult)),
      maxDay: baseLimits.maxDay,  // Daily cap stays fixed — only pace is adjusted
      maxBurst: Math.max(1, Math.floor(baseLimits.maxBurst * combinedMult)),
      riskScore: Math.round(riskScore * 10) / 10,
      multiplier: Math.round(combinedMult * 100) / 100,
    };

    const [density60, density10, dailyCount, successRate, baselineSuccess, latencyAnomaly] = await Promise.all([
      this.getRollingDensity(accountId, 60),
      this.getRollingDensity(accountId, 10),
      this.getDailyDMCount(accountId),
      this.getSuccessRate(accountId),
      this.getBaselineSuccessRate(accountId),
      this.checkLatencyAnomaly(accountId),
    ]);

    // Adaptive success threshold: max(50%, baseline - 15pp)
    // Instead of static 70%, this adapts to each account's normal performance.
    // Account with 95% baseline triggers at 80%. Account with 75% baseline triggers at 60%.
    const adaptiveThreshold = Math.max(0.5, baselineSuccess.rate - 0.15);

    if (successRate.sufficient && successRate.rate < adaptiveThreshold) {
      limits.maxHour = Math.max(1, Math.floor(limits.maxHour * 0.5));
      limits.maxBurst = Math.max(1, Math.floor(limits.maxBurst * 0.5));
      limits.throttleReason = 'low_success_rate';
      console.log(`   ⚠️ Low success rate (${(successRate.rate * 100).toFixed(0)}% vs adaptive threshold ${(adaptiveThreshold * 100).toFixed(0)}%) — throttling to ${limits.maxHour}/hr`);
    }

    // Latency anomaly: apply throughput cut (stacks with success rate throttle)
    if (latencyAnomaly.isAnomaly) {
      limits.maxHour = Math.max(1, Math.floor(limits.maxHour * latencyAnomaly.cutFactor));
      limits.maxBurst = Math.max(1, Math.floor(limits.maxBurst * latencyAnomaly.cutFactor));
      limits.throttleReason = (limits.throttleReason ? limits.throttleReason + '+' : '') + 'latency_anomaly';
      console.log(`   ⚠️ Latency anomaly (${latencyAnomaly.currentMs}ms vs ${latencyAnomaly.baselineMs}ms baseline) — throughput cut to ${limits.maxHour}/hr`);
    }

    // THROUGHPUT FLOOR: never drop below minimum survival trickle unless explicitly paused.
    // Prevents the adaptive system from throttling an account into zero throughput.
    const floorHour = Math.max(1, Math.floor(baseLimits.maxHour * MINIMUM_HOURLY_FLOOR));
    const floorBurst = 1;
    if (limits.maxHour < floorHour) {
      limits.maxHour = floorHour;
      limits.maxBurst = Math.max(floorBurst, limits.maxBurst);
      limits.atFloor = true;
    }

    // USER OVERRIDE GOVERNANCE: if user has requested higher throughput,
    // allow up to 50% of base max — never full restoration.
    // The override is a privilege, not a right. It has costs (risk accrual, lifetime limit).
    const overrideAccount = await prisma.instagramAccount.findUnique({
      where: { id: accountId },
      select: { overrideActive: true },
    });
    if (overrideAccount?.overrideActive) {
      const overrideCap = Math.max(1, Math.floor(baseLimits.maxHour * 0.5)); // 50% of base
      if (limits.maxHour < overrideCap) {
        limits.maxHour = overrideCap;
        limits.maxBurst = Math.max(1, Math.floor(baseLimits.maxBurst * 0.5));
        limits.overrideActive = true;
      }
    }

    if (dailyCount >= limits.maxDay) {
      return { allowed: false, reason: `daily_limit (${dailyCount}/${limits.maxDay})`, density60, density10, limits };
    }

    if (density60 >= limits.maxHour) {
      return { allowed: false, reason: `hourly_window (${density60}/${limits.maxHour}, risk=${limits.riskScore}${limits.atFloor ? ', AT FLOOR' : ''})`, density60, density10, limits };
    }

    if (density10 >= limits.maxBurst) {
      return { allowed: false, reason: `burst_window (${density10}/${limits.maxBurst} per 10m, risk=${limits.riskScore})`, density60, density10, limits };
    }

    return { allowed: true, reason: null, density60, density10, limits };
  }

  // ─── Risk Score Engine (Phase 2) ───

  /**
   * Get current risk score for an account, applying time-based decay.
   * Risk decays RISK_DECAY_PER_HOUR for every hour since last update.
   */
  async getRiskScore(accountId) {
    const account = await prisma.instagramAccount.findUnique({
      where: { id: accountId },
      select: { riskScore: true, riskUpdatedAt: true },
    });

    let risk = account?.riskScore ?? 0;
    const lastUpdate = account?.riskUpdatedAt;

    // Apply time-based decay
    if (lastUpdate && risk > 0) {
      const hoursSince = (Date.now() - new Date(lastUpdate).getTime()) / (60 * 60 * 1000);
      const decay = hoursSince * RISK_DECAY_PER_HOUR;
      risk = Math.max(0, risk - decay);
    }

    return risk;
  }

  /**
   * Add risk points after a failure.
   * Called from recordFailure() — error type determines weight.
   */
  async addRisk(accountId, errorType) {
    const weight = RISK_WEIGHTS[errorType] ?? RISK_WEIGHTS.GENERIC;
    const currentRisk = await this.getRiskScore(accountId);
    const newRisk = Math.min(RISK_MAX, currentRisk + weight);

    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: { riskScore: newRisk, riskUpdatedAt: new Date() },
    });

    console.log(`   📊 Risk for account ${accountId}: ${currentRisk.toFixed(1)} → ${newRisk.toFixed(1)} (+${weight} ${errorType})`);
    return newRisk;
  }

  /**
   * Decay risk after a successful send.
   * Small per-success decay rewards consistent clean operation.
   */
  async decayRiskOnSuccess(accountId) {
    const currentRisk = await this.getRiskScore(accountId);
    if (currentRisk <= 0) return 0;

    const newRisk = Math.max(0, currentRisk - RISK_SUCCESS_DECAY);

    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: { riskScore: newRisk, riskUpdatedAt: new Date() },
    });

    return newRisk;
  }

  /**
   * Map risk score to throughput multiplier.
   * risk 0-1 → 100%, risk 4-5 → 50%, risk 8+ → 15%
   */
  getThroughputMultiplier(riskScore) {
    for (const tier of RISK_THROUGHPUT_MAP) {
      if (riskScore <= tier.maxRisk) return tier.multiplier;
    }
    return RISK_THROUGHPUT_MAP[RISK_THROUGHPUT_MAP.length - 1].multiplier;
  }

  // ─── Silent Throttle Detection ───

  /**
   * Get rolling success rate for an account (sent / total attempts in last 24h).
   * If success rate drops below 70%, something is wrong — silent throttling likely.
   */
  async getSuccessRate(accountId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sent, failed] = await Promise.all([
      prisma.dmHistory.count({
        where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since } },
      }),
      prisma.dmQueue.count({
        where: { igAccountId: accountId, status: { in: ['failed', 'blocked'] }, processedAt: { gte: since } },
      }),
    ]);

    const total = sent + failed;
    if (total < 5) return { rate: 1.0, sent, failed, total, sufficient: false }; // Not enough data

    return { rate: sent / total, sent, failed, total, sufficient: true };
  }

  /**
   * Get average send latency for an account (last 2 hours).
   * Rising latency signals Instagram is throttling responses.
   */
  async getAvgLatency(accountId) {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = await prisma.dmHistory.aggregate({
      where: {
        igAccountId: accountId,
        status: 'sent',
        dmSentAt: { gte: since },
        sendLatencyMs: { not: null },
      },
      _avg: { sendLatencyMs: true },
      _max: { sendLatencyMs: true },
      _count: { sendLatencyMs: true },
    });

    return {
      avgMs: Math.round(result._avg.sendLatencyMs || 0),
      maxMs: result._max.sendLatencyMs || 0,
      sampleSize: result._count.sendLatencyMs || 0,
    };
  }

  /**
   * Get 7-day baseline latency for an account.
   * This is the "normal" latency — used to detect anomalies vs a static threshold.
   * Excludes last 2 hours so current anomaly doesn't pollute the baseline.
   */
  async getBaselineLatency(accountId) {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const exclude2h = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const result = await prisma.dmHistory.aggregate({
      where: {
        igAccountId: accountId,
        status: 'sent',
        dmSentAt: { gte: since7d, lte: exclude2h },
        sendLatencyMs: { not: null },
      },
      _avg: { sendLatencyMs: true },
      _count: { sendLatencyMs: true },
    });

    return {
      avgMs: Math.round(result._avg.sendLatencyMs || 0),
      sampleSize: result._count.sendLatencyMs || 0,
    };
  }

  /**
   * Get 7-day baseline success rate for an account.
   * Used as the adaptive threshold instead of a static 70%.
   * If baseline is 95%, a drop to 80% is alarming.
   * If baseline is 75%, a drop to 70% is normal variance.
   *
   * Returns { rate, sampleSize, sufficient }
   * The adaptive threshold is: max(0.5, baseline - 0.15)
   *   - Always at least 50% floor
   *   - Triggers when current drops 15+ percentage points below normal
   */
  async getBaselineSuccessRate(accountId) {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const exclude24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sent, failed] = await Promise.all([
      prisma.dmHistory.count({
        where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since7d, lte: exclude24h } },
      }),
      prisma.dmQueue.count({
        where: { igAccountId: accountId, status: { in: ['failed', 'blocked'] }, processedAt: { gte: since7d, lte: exclude24h } },
      }),
    ]);

    const total = sent + failed;
    if (total < 20) return { rate: 0.95, sampleSize: total, sufficient: false }; // Default high baseline for new accounts

    return { rate: sent / total, sampleSize: total, sufficient: true };
  }

  /**
   * Get reply rate for an account — fraction of sent DMs that received a reply.
   * Tracks ranking suppression: if Instagram throttles message visibility,
   * replies drop even when sends "succeed".
   *
   * Uses 7-day window for meaningful signal (replies can arrive hours/days later).
   * Returns { rate, replied, sent, sufficient }
   */
  async getReplyRate(accountId) {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Exclude last 24h of DMs — they haven't had enough time to receive replies
    const exclude24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sent, replied] = await Promise.all([
      prisma.dmHistory.count({
        where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since7d, lte: exclude24h } },
      }),
      prisma.dmHistory.count({
        where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since7d, lte: exclude24h }, repliedAt: { not: null } },
      }),
    ]);

    if (sent < 10) return { rate: null, replied, sent, sufficient: false };

    return { rate: replied / sent, replied, sent, sufficient: true };
  }

  /**
   * Check for latency anomaly and take action.
   * Compares 2hr avg latency against 7-day baseline.
   * If current > 1.8× baseline AND sample size is sufficient:
   *   - Add 1.5 risk points (feeds into throughput multiplier)
   *   - Return a throughput cut factor (0.75 = 25% reduction)
   *
   * Returns { isAnomaly, currentMs, baselineMs, cutFactor }
   */
  async checkLatencyAnomaly(accountId) {
    const [current, baseline] = await Promise.all([
      this.getAvgLatency(accountId),
      this.getBaselineLatency(accountId),
    ]);

    const result = { isAnomaly: false, currentMs: current.avgMs, baselineMs: baseline.avgMs, cutFactor: 1.0 };

    // Need sufficient samples in both windows
    if (current.sampleSize < LATENCY_ANOMALY_MIN_SAMPLES || baseline.sampleSize < 10) {
      return result;
    }

    // Baseline can't be 0 (would be a division error)
    if (baseline.avgMs === 0) return result;

    const ratio = current.avgMs / baseline.avgMs;

    if (ratio >= LATENCY_ANOMALY_MULTIPLIER) {
      result.isAnomaly = true;
      result.cutFactor = LATENCY_ANOMALY_THROUGHPUT_CUT;

      // Add risk — but only once per anomaly window (check if we already added recently)
      // Use riskUpdatedAt: if risk was updated within last 30 min, skip to avoid stacking
      const account = await prisma.instagramAccount.findUnique({
        where: { id: accountId },
        select: { riskUpdatedAt: true },
      });
      const minsSinceRiskUpdate = account?.riskUpdatedAt
        ? (Date.now() - new Date(account.riskUpdatedAt).getTime()) / 60000
        : Infinity;

      if (minsSinceRiskUpdate > 30) {
        await this.addRisk(accountId, 'GENERIC'); // Uses GENERIC weight but we add extra
        // Add extra penalty for latency-specific signal
        const currentRisk = await this.getRiskScore(accountId);
        const extraPenalty = LATENCY_ANOMALY_RISK_PENALTY - RISK_WEIGHTS.GENERIC; // Net extra
        if (extraPenalty > 0) {
          const newRisk = Math.min(RISK_MAX, currentRisk + extraPenalty);
          await prisma.instagramAccount.update({
            where: { id: accountId },
            data: { riskScore: newRisk, riskUpdatedAt: new Date() },
          });
        }
        console.log(`   🔥 LATENCY ANOMALY @account ${accountId}: ${current.avgMs}ms vs baseline ${baseline.avgMs}ms (${ratio.toFixed(1)}×) — added ${LATENCY_ANOMALY_RISK_PENALTY} risk, throughput cut to ${(LATENCY_ANOMALY_THROUGHPUT_CUT * 100).toFixed(0)}%`);

        await enforcement.log(accountId, {
          eventType: 'latency_anomaly',
          triggerSource: 'latency_detector',
          actionTaken: 'throttled_25pct',
          errorMessage: `Latency ${current.avgMs}ms vs baseline ${baseline.avgMs}ms (${ratio.toFixed(1)}×)`,
          riskDelta: LATENCY_ANOMALY_RISK_PENALTY,
        });
      }
    }

    return result;
  }

  /**
   * Kill threshold check: if account is simultaneously showing extreme signals
   * across ALL three dimensions (risk + success + latency), auto-pause for 24h.
   *
   * This is the "no heroics, hard stop" safety net.
   * All three must be true simultaneously — single bad metrics don't trigger this.
   */
  async checkKillThreshold(accountId) {
    const [riskScore, successRate, current, baseline] = await Promise.all([
      this.getRiskScore(accountId),
      this.getSuccessRate(accountId),
      this.getAvgLatency(accountId),
      this.getBaselineLatency(accountId),
    ]);

    const latencyRatio = baseline.avgMs > 0 ? current.avgMs / baseline.avgMs : 0;

    // All three conditions must be true simultaneously
    const riskTriggered = riskScore >= KILL_RISK_THRESHOLD;
    const successTriggered = successRate.sufficient && successRate.rate < KILL_SUCCESS_RATE_THRESHOLD;
    const latencyTriggered = baseline.sampleSize >= 10 && current.sampleSize >= 3 && latencyRatio >= KILL_LATENCY_MULTIPLIER;

    if (riskTriggered && successTriggered && latencyTriggered) {
      console.log(`   💀 KILL THRESHOLD @account ${accountId}: risk=${riskScore.toFixed(1)}, successRate=${(successRate.rate * 100).toFixed(0)}%, latency=${latencyRatio.toFixed(1)}× — auto-pausing 24h`);

      await enforcement.log(accountId, {
        eventType: 'kill_triggered',
        triggerSource: 'kill_threshold',
        actionTaken: 'paused_24h',
        errorMessage: `Kill: risk=${riskScore.toFixed(1)}, success=${(successRate.rate * 100).toFixed(0)}%, latency=${latencyRatio.toFixed(1)}×`,
      });

      await this.pauseAccount(accountId, `kill_threshold: risk=${riskScore.toFixed(1)}, success=${(successRate.rate * 100).toFixed(0)}%, latency=${latencyRatio.toFixed(1)}×`, KILL_COOLDOWN_MS);
      return true;
    }

    return false;
  }

  // ─── Slot-Based Distribution (Phase 3) ───

  /**
   * Generate randomized time slots spread across the next window.
   * Instead of firing DMs sequentially, assigns each DM a future timestamp
   * so they trickle out naturally across the available capacity window.
   *
   * @param {number} count - How many slots to generate
   * @param {object} limits - From canSendDM() (maxHour, maxBurst, etc.)
   * @returns {Date[]} Array of scheduled send times, sorted ascending
   */
  generateTimeSlots(count, limits, seed = null, windowMs = 60 * 60 * 1000) {
    if (count === 0) return [];

    const now = Date.now();

    // Calculate spacing: spread evenly across the window, then add jitter
    const baseSpacing = windowMs / (limits.maxHour || 8); // e.g., 8/hr → ~7.5 min apart

    // Seed-based jitter amplitude: impatient accounts (low seed) get tighter clusters,
    // methodical accounts (high seed) get wider spacing variance
    const jitterFactor = seed !== null ? (0.2 + seed * 0.2) : 0.3; // 0.2-0.4 range vs fixed 0.3

    const slots = [];

    for (let i = 0; i < count; i++) {
      // Base position: evenly spaced from now
      const baseOffset = baseSpacing * i;

      // Seed-influenced jitter amplitude
      const jitter = baseSpacing * jitterFactor * (Math.random() * 2 - 1);
      const offsetMs = Math.max(0, baseOffset + jitter);

      slots.push(new Date(now + offsetMs));
    }

    // Sort ascending (jitter could swap neighbors)
    slots.sort((a, b) => a.getTime() - b.getTime());
    return slots;
  }

  /**
   * Assign time slots to unscheduled DMs for an account.
   * Only schedules DMs that are currently scheduledAt <= now (i.e., "ready but not slotted").
   * DMs that already have a future scheduledAt (retry backoff) are left alone.
   */
  async distributeSlots(accountId, pendingDMs) {
    // Filter to DMs that need slotting (scheduledAt is in the past = "ready now")
    const needsSlotting = pendingDMs.filter(dm => new Date(dm.scheduledAt) <= new Date());

    if (needsSlotting.length === 0) return;

    const admission = await this.canSendDM(accountId);
    if (!admission.allowed) return; // Don't slot if throttled

    // How many more can we send this hour?
    const remainingCapacity = Math.max(0, admission.limits.maxHour - admission.density60);
    const toSlot = needsSlotting.slice(0, remainingCapacity);

    if (toSlot.length === 0) return;

    const personality = await this.getPersonality(accountId);

    // Constrain slot window to remaining working hours
    const now = new Date();
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const endMinute = personality.workEnd * 60;
    const remainingWorkMinutes = endMinute > minuteOfDay ? endMinute - minuteOfDay : 0;
    const maxWindowMs = Math.min(60 * 60 * 1000, remainingWorkMinutes * 60 * 1000); // min(1hr, remaining work time)

    if (maxWindowMs < 5 * 60 * 1000) return; // Less than 5 min of work time left — don't slot

    const slots = this.generateTimeSlots(toSlot.length, admission.limits, personality.seed, maxWindowMs);

    // Assign slots — first DM gets earliest slot (priority already sorted)
    for (let i = 0; i < toSlot.length; i++) {
      await prisma.dmQueue.update({
        where: { id: toSlot[i].id },
        data: { scheduledAt: slots[i] },
      });
    }

    console.log(`   🎰 @account ${accountId}: Distributed ${toSlot.length} DM(s) across next ${Math.round((slots[slots.length - 1] - slots[0]) / 60000)}min`);
  }

  // ─── Engagement Freshness / TTL (Phase 4) ───

  /**
   * Expire DMs that have been in the queue longer than DM_TTL_MS.
   * A DM to a comment from 12+ hours ago looks suspicious and has near-zero conversion.
   * Expired DMs are marked 'expired' so they're never retried.
   */
  async expireStaleQueue() {
    const cutoff = new Date(Date.now() - DM_TTL_MS);
    const expired = await prisma.dmQueue.updateMany({
      where: {
        status: 'pending',
        createdAt: { lte: cutoff },
      },
      data: {
        status: 'expired',
        errorMessage: `TTL expired — queued longer than ${DM_TTL_MS / 3600000}h`,
      },
    });
    if (expired.count > 0) {
      console.log(`   ⏰ TTL: Expired ${expired.count} stale DM(s) older than ${DM_TTL_MS / 3600000}h`);
    }
    return expired.count;
  }

  /**
   * Calculate freshness score for a queued DM (0.0 → 1.0).
   * 1.0 = just created, 0.5 = 3 hours old, ~0.0 = 12+ hours old.
   * Used by Phase 5 backpressure to decide which DMs to drop first.
   */
  getFreshnessScore(dm) {
    const ageMs = Date.now() - new Date(dm.createdAt).getTime();
    // Exponential decay with half-life of 3 hours
    return Math.exp(-0.693 * ageMs / FRESHNESS_DECAY_HALF_LIFE_MS);
  }

  // ─── Intelligent Backpressure (Phase 5) ───

  /**
   * If an account's pending queue exceeds its remaining daily capacity,
   * drop the lowest-freshness DMs. This prevents dangerous backlogs
   * that would take multiple days to drain (which looks robotic).
   *
   * Safety margin: keeps queue at 80% of remaining capacity to leave room
   * for new high-priority DMs arriving later in the day.
   */
  async applyBackpressure(accountId) {
    const limits = await this.getAccountLimits(accountId);
    const dailySent = await this.getDailyDMCount(accountId);
    const remainingCapacity = Math.max(0, limits.maxDay - dailySent);
    const safeCapacity = Math.floor(remainingCapacity * 0.8); // 80% safety margin

    // Get all pending DMs for this account
    const pendingDMs = await prisma.dmQueue.findMany({
      where: { igAccountId: accountId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingDMs.length <= safeCapacity) return 0; // Queue fits within capacity

    // Score each DM by freshness
    const scored = pendingDMs.map(dm => ({
      id: dm.id,
      freshness: this.getFreshnessScore(dm),
      priority: dm.priority,
    }));

    // Sort by value: priority first, then freshness. Lowest value = first to drop.
    scored.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority; // lower priority first
      return a.freshness - b.freshness; // staler first
    });

    // Drop the excess
    const toDrop = scored.slice(0, pendingDMs.length - safeCapacity);
    const dropIds = toDrop.map(d => d.id);

    if (dropIds.length > 0) {
      await prisma.dmQueue.updateMany({
        where: { id: { in: dropIds } },
        data: {
          status: 'dropped',
          errorMessage: `Backpressure: queue (${pendingDMs.length}) exceeded safe capacity (${safeCapacity})`,
        },
      });

      // Audit log: individual drop records for accountability
      for (const drop of toDrop) {
        console.log(`   🔻 DROP id=${drop.id} freshness=${drop.freshness.toFixed(3)} priority=${drop.priority}`);
      }
      console.log(`   🔻 Backpressure @account ${accountId}: Dropped ${dropIds.length} lowest-value DM(s) [queue=${pendingDMs.length}, capacity=${safeCapacity}]`);
    }

    return dropIds.length;
  }

  // ─── Account Personality Profiles (Phase 7) ───

  /**
   * Get or initialize an account's personality profile.
   * behaviorSeed is set once on first access (immutable per-account randomness).
   */
  async getPersonality(accountId) {
    let account = await prisma.instagramAccount.findUnique({
      where: { id: accountId },
      select: {
        behaviorSeed: true,
        workingHoursStart: true,
        workingHoursEnd: true,
        aggressionFactor: true,
      },
    });

    // Initialize seed if not set (first run)
    if (account && account.behaviorSeed === null) {
      const seed = Math.random();
      await prisma.instagramAccount.update({
        where: { id: accountId },
        data: { behaviorSeed: seed },
      });
      account.behaviorSeed = seed;
    }

    return {
      seed: account?.behaviorSeed ?? Math.random(),
      workStart: account?.workingHoursStart ?? 9,
      workEnd: account?.workingHoursEnd ?? 22,
      aggression: account?.aggressionFactor ?? 1.0,
    };
  }

  /**
   * Check if the current time is within the account's working hours.
   * Returns false if it's "sleep time" — no DMs should be sent.
   *
   * Adds ±30 min daily jitter using seed + day-of-year so the account
   * doesn't wake/sleep at perfectly consistent times (fingerprintable).
   */
  isWithinWorkingHours(personality) {
    const now = new Date();
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();

    // Daily jitter: seed + day-of-year produces different offset each day
    // but consistent within the same day for the same account
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const dailySeed = ((personality.seed || 0.5) * 1000 + dayOfYear) % 1;
    const jitterMinutes = Math.floor(dailySeed * 60) - 30; // ±30 min

    const startMinute = personality.workStart * 60 + jitterMinutes;
    const endMinute = personality.workEnd * 60 - jitterMinutes; // opposite jitter for end

    // Handle overnight ranges (e.g., workStart=22, workEnd=6)
    if (startMinute <= endMinute) {
      return minuteOfDay >= startMinute && minuteOfDay < endMinute;
    } else {
      return minuteOfDay >= startMinute || minuteOfDay < endMinute;
    }
  }

  /**
   * Apply personality-based throughput adjustment.
   * Aggression factor scales the effective hourly limit.
   * Seed adds ±10% variance so no two accounts behave identically.
   */
  getPersonalityMultiplier(personality) {
    // Seed-based variance: ±10% (seed 0.0 → -10%, seed 1.0 → +10%)
    const seedVariance = 0.9 + (personality.seed * 0.2);

    // Aggression: 0.5 = cautious (half speed), 1.0 = normal, 1.5 = aggressive
    return personality.aggression * seedVariance;
  }

  // ─── Stochastic Delay Model (Phase 6) ───

  /**
   * Generate a human-like delay using weighted random buckets.
   * Instead of uniform random (2-5 min), this produces a realistic
   * distribution: most delays are 6-9 min, with occasional fast/slow outliers.
   *
   * @param {number|null} seed - behaviorSeed (0.0-1.0) to shift bucket weights per-account.
   *   seed < 0.3 → "impatient" profile (more quick replies)
   *   seed 0.3-0.7 → "normal" profile (default distribution)
   *   seed > 0.7 → "methodical" profile (more slow, deliberate gaps)
   * @returns {number} Delay in seconds
   */
  getStochasticDelay(seed = null) {
    // Shift bucket weights based on personality seed
    let buckets = DELAY_BUCKETS;

    if (seed !== null) {
      if (seed < 0.3) {
        // Impatient: shift weight toward fast bucket
        buckets = [
          { weight: 0.30, minS: 180,  maxS: 360  },  // 30% fast (was 15%)
          { weight: 0.45, minS: 360,  maxS: 540  },  // 45% normal (was 55%)
          { weight: 0.15, minS: 600,  maxS: 900  },  // 15% busy
          { weight: 0.10, minS: 900,  maxS: 1500 },  // 10% slow
        ];
      } else if (seed > 0.7) {
        // Methodical: shift weight toward slow buckets
        buckets = [
          { weight: 0.08, minS: 180,  maxS: 360  },  // 8% fast
          { weight: 0.42, minS: 360,  maxS: 540  },  // 42% normal (was 55%)
          { weight: 0.30, minS: 600,  maxS: 900  },  // 30% busy (was 20%)
          { weight: 0.20, minS: 900,  maxS: 1500 },  // 20% slow (was 10%)
        ];
      }
      // seed 0.3-0.7: use default DELAY_BUCKETS
    }

    const roll = Math.random();
    let cumulative = 0;

    for (const bucket of buckets) {
      cumulative += bucket.weight;
      if (roll <= cumulative) {
        return Math.floor(Math.random() * (bucket.maxS - bucket.minS)) + bucket.minS;
      }
    }

    const last = buckets[buckets.length - 1];
    return Math.floor(Math.random() * (last.maxS - last.minS)) + last.minS;
  }

  /**
   * Process pending DMs in the queue
   */
  async processQueue() {
    // Prevent concurrent processing (Puppeteer is resource intensive)
    if (this.isProcessing) {
      console.log('   ⏳ Still processing previous batch, skipping...');
      return;
    }

    try {
      this.isProcessing = true;

      // Auto-unpause accounts whose cooldown expired
      await this.unpauseExpiredAccounts();

      // Expire user overrides + accrue override risk
      await this.expireOverrides();

      // Deterministic recovery check: resolve enforcement events for accounts
      // that meet all 4 recovery criteria (not paused, SR>80%, latency<1.5× baseline, quiet 2h)
      await this.checkRecoveries();

      // Phase 4: Expire stale DMs before any processing
      await this.expireStaleQueue();

      // Phase 5: Apply backpressure per account (drop excess low-value DMs)
      const accountIds = await prisma.dmQueue.findMany({
        where: { status: 'pending', igAccount: { isPaused: false } },
        select: { igAccountId: true },
        distinct: ['igAccountId'],
      });
      for (const { igAccountId } of accountIds) {
        // Kill threshold: check if account needs emergency pause before any processing
        const killed = await this.checkKillThreshold(igAccountId);
        if (killed) continue; // Account was auto-paused — skip all further processing

        await this.applyBackpressure(igAccountId);
      }

      // Phase 3: Distribute time slots for unscheduled DMs.
      // SLOT STABILITY: Only DMs with scheduledAt <= now are candidates.
      // DMs already assigned a future slot (scheduledAt > now) are never re-slotted.
      // This ensures slots remain stable once assigned — no reshuffling.
      const unslottedDMs = await prisma.dmQueue.findMany({
        where: {
          status: 'pending',
          scheduledAt: { lte: new Date() },
          igAccount: { isPaused: false },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 50,
      });

      if (unslottedDMs.length > 0) {
        const byAccount = this.groupByAccount(unslottedDMs);
        for (const [accountId, dms] of Object.entries(byAccount)) {
          await this.distributeSlots(accountId, dms);
        }
      }

      // Now fetch only DMs whose slot time has arrived
      const readyDMs = await prisma.dmQueue.findMany({
        where: {
          status: 'pending',
          scheduledAt: { lte: new Date() },
          igAccount: { isPaused: false },
        },
        include: {
          igAccount: true
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' }
        ],
        take: 5 // Process max 5 DMs per cycle (Puppeteer is slower)
      });

      if (readyDMs.length === 0) {
        return; // No DMs ready to send right now
      }

      console.log(`\n📬 [${new Date().toLocaleTimeString()}] Processing ${readyDMs.length} ready DM(s)...`);

      // Group by account to respect rate limits
      const dmsByAccount = this.groupByAccount(readyDMs);

      for (const [accountId, dms] of Object.entries(dmsByAccount)) {
        await this.processAccountDMs(dms);
      }
    } catch (error) {
      console.error('❌ DM queue processing error:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Group DMs by Instagram account
   */
  groupByAccount(dms) {
    return dms.reduce((acc, dm) => {
      if (!acc[dm.igAccountId]) {
        acc[dm.igAccountId] = [];
      }
      acc[dm.igAccountId].push(dm);
      return acc;
    }, {});
  }

  /**
   * Process DMs for a specific account
   * Uses Official API if available, falls back to Puppeteer
   */
  async processAccountDMs(dms) {
    if (dms.length === 0) return;

    const account = dms[0].igAccount;

    // Acquire per-account advisory lock — prevents concurrent processing
    const lock = await this.acquireAccountLock(account.id);
    if (!lock.acquired) {
      console.log(`   🔒 @${account.username}: Another worker is processing this account, skipping`);
      return;
    }

    try {
      decryptAccountTokens(account);

      // Use Official Instagram API if account has it enabled
      if (account.useOfficialApi && account.accessToken) {
        console.log(`   🔗 @${account.username}: Using Official Instagram API for DMs`);
        await this.processAccountDMsOfficial(dms, account);
        return;
      }

      // Fallback to Puppeteer
      console.log(`   🤖 @${account.username}: Using Puppeteer for DMs (no official API)`);
      await this.processAccountDMsPuppeteer(dms, account);
    } finally {
      await lock.release();
    }
  }

  /**
   * Process DMs using the Official Instagram Messaging API
   */
  async processAccountDMsOfficial(dms, account) {
    // Rolling window admission check (replaces fixed hourly counter)
    const admission = await this.canSendDM(account.id);
    if (!admission.allowed) {
      console.log(`   ⚠️ @${account.username}: Throttled — ${admission.reason} [d60=${admission.density60}, d10=${admission.density10}]`);
      return;
    }

    for (const dm of dms) {
      // Re-check rolling window before each DM (density changes after each send)
      const preCheck = await this.canSendDM(account.id);
      if (!preCheck.allowed) {
        console.log(`   ⚠️ @${account.username}: Throttled mid-batch — ${preCheck.reason}`);
        break;
      }

      // Generate causal chain ID for this specific send attempt
      const sendAttemptId = crypto.randomUUID();

      try {
        // Mark as processing with sendAttemptId
        await prisma.dmQueue.update({
          where: { id: dm.id },
          data: { status: 'processing', processedAt: new Date(), sendAttemptId }
        });

        // Send via Official API (with latency tracking)
        const sendStart = Date.now();
        const result = await officialApi.sendDM(
          account.accessToken,
          account.igUserId,
          dm.recipientIgId,
          dm.messageToSend,
          dm.commentId  // Pass commentId for Private Reply (comment-triggered DMs)
        );
        const sendLatencyMs = Date.now() - sendStart;

        if (result.success) {
          // Mark as sent
          await prisma.dmQueue.update({
            where: { id: dm.id },
            data: { status: 'sent', sentAt: new Date() }
          });

          // Update trigger status
          if (dm.commentId) {
            await prisma.trigger.updateMany({
              where: { commentId: dm.commentId },
              data: { dmSent: true, dmSentAt: new Date(), status: 'dm_sent' }
            });
          }

          // Add to DM history (with latency + causal chain)
          await prisma.dmHistory.create({
            data: {
              igAccountId: dm.igAccountId,
              monitoredReelId: dm.monitoredReelId,
              recipientIgId: dm.recipientIgId,
              recipientUsername: dm.recipientUsername,
              commentId: dm.commentId,
              commentText: dm.commentText,
              detectedKeyword: dm.detectedKeyword,
              messageSent: dm.messageToSend,
              sendLatencyMs,
              sendAttemptId,
              status: 'sent',
              dmSentAt: new Date()
            }
          }).catch(() => {}); // Ignore duplicate errors

          // Update daily analytics
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.dailyAnalytics.upsert({
            where: { igAccountId_date: { igAccountId: dm.igAccountId, date: today } },
            update: { dmsSent: { increment: 1 } },
            create: { igAccountId: dm.igAccountId, date: today, dmsSent: 1 }
          });

          await this.recordSuccess(account.id);
          console.log(`   ✅ [Official API] DM sent to @${dm.recipientUsername} [d60=${preCheck.density60 + 1}/${preCheck.limits.maxHour}]`);

          // Official API: shorter stochastic delay (15-45s — Meta rate-limits server-side)
          if (dms.indexOf(dm) < dms.length - 1) {
            const delay = Math.floor(Math.random() * 30) + 15;
            console.log(`   ⏱️ Waiting ${delay}s before next DM (official API)...`);
            await this.sleep(delay * 1000);
          }
        }
      } catch (error) {
        console.error(`   ❌ [Official API] Failed to send DM to @${dm.recipientUsername}:`, error.message);

        // Determine error type for circuit breaker
        const errorMsg = error.message || '';
        let errorType = 'GENERIC';
        if (errorMsg.includes('rate') || errorMsg.includes('limit') || errorMsg.includes('429')) errorType = 'RATE_LIMITED';
        if (errorMsg.includes('block') || errorMsg.includes('ACTION_BLOCKED')) errorType = 'ACTION_BLOCKED';

        // Check if this is a permanent failure (private reply already sent, or comment too old)
        const isPermanentFailure =
          errorMsg.includes('already replied') ||
          errorMsg.includes('already been replied') ||
          errorMsg.includes('duplicate') ||
          errorMsg.includes('comment_id') ||
          errorMsg.includes('does not exist') ||
          errorMsg.includes('comment has been deleted') ||
          errorMsg.includes('Cannot reply to this comment') ||
          (errorMsg.includes('code: 100') && dm.commentId) ||  // Invalid parameter for private reply
          (errorMsg.includes('code: 10') && dm.commentId);     // Permission denied on comment

        await this.recordFailure(dm.igAccountId, errorType, {
          source: 'instagram_api',
          errorMessage: errorMsg.substring(0, 1000),
          httpStatusCode: error.response?.status || null,
          dmQueueId: dm.id,
          recipientUsername: dm.recipientUsername,
          sendAttemptId,
        });

        if (isPermanentFailure) {
          // Private reply errors are not retryable — mark as permanently failed
          console.log(`   🚫 Permanent failure for @${dm.recipientUsername} — not retrying (${errorMsg.substring(0, 100)})`);
          await prisma.dmQueue.update({
            where: { id: dm.id },
            data: {
              status: 'failed',
              errorMessage: `PERMANENT: ${error.message.substring(0, 480)}`,
              retryCount: dm.retryCount,
            }
          });
        } else {
          // Exponential backoff: 5min, 15min, 45min
          const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(3, dm.retryCount), 3 * 60 * 60 * 1000);

          await prisma.dmQueue.update({
            where: { id: dm.id },
            data: {
              status: dm.retryCount < 3 ? 'pending' : 'failed',
              errorMessage: error.message.substring(0, 500),
              retryCount: dm.retryCount < 3 ? { increment: 1 } : dm.retryCount,
              scheduledAt: dm.retryCount < 3 ? new Date(Date.now() + backoffMs) : dm.scheduledAt
            }
          });
        }

        // Update daily analytics for failures
        if (isPermanentFailure || dm.retryCount >= 3) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.dailyAnalytics.upsert({
            where: { igAccountId_date: { igAccountId: dm.igAccountId, date: today } },
            update: { dmsFailed: { increment: 1 } },
            create: { igAccountId: dm.igAccountId, date: today, dmsFailed: 1 }
          });
        }

        // If account was just paused by circuit breaker, stop processing this account's DMs
        const refreshed = await prisma.instagramAccount.findUnique({ where: { id: dm.igAccountId }, select: { isPaused: true } });
        if (refreshed?.isPaused) break;
      }
    }
  }

  /**
   * Process DMs using Puppeteer (legacy fallback)
   */
  async processAccountDMsPuppeteer(dms, account) {
    let dmService = null;

    try {
      // Initialize Puppeteer DM service
      dmService = new PuppeteerDMService(account);
      await dmService.init();

      // Check if session is valid
      const sessionValid = await dmService.isSessionValid();
      if (!sessionValid) {
        console.log(`   ❌ @${account.username}: Session expired, marking account for reconnection`);

        // Mark account as needing reconnection
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { status: 'session_expired' }
        });

        // Reschedule DMs for later
        await prisma.dmQueue.updateMany({
          where: {
            igAccountId: account.id,
            status: 'pending'
          },
          data: {
            scheduledAt: new Date(Date.now() + 30 * 60 * 1000), // Retry in 30 mins
            errorMessage: 'Session expired - please reconnect account'
          }
        });

        await dmService.close();
        return;
      }

      console.log(`   ✅ @${account.username}: Session valid, processing ${dms.length} DM(s)...`);

      // Rolling window admission check (replaces fixed hourly counter)
      const admission = await this.canSendDM(account.id);
      if (!admission.allowed) {
        console.log(`   ⚠️ @${account.username}: Throttled — ${admission.reason} [d60=${admission.density60}, d10=${admission.density10}]`);
        await dmService.close();
        return;
      }

      // Fetch personality seed for stochastic delay shaping
      const personality = await this.getPersonality(account.id);

      // Process one DM at a time with LONG delays
      for (const dm of dms) {
        // Re-check rolling window before each DM
        const preCheck = await this.canSendDM(account.id);
        if (!preCheck.allowed) {
          console.log(`   ⚠️ @${account.username}: Throttled mid-batch — ${preCheck.reason}`);
          break;
        }

        // Circuit breaker: check if account was paused mid-batch
        const acctState = await prisma.instagramAccount.findUnique({ where: { id: account.id }, select: { isPaused: true } });
        if (acctState?.isPaused) {
          console.log(`   🔴 @${account.username} paused by circuit breaker, stopping batch`);
          break;
        }

        // Wrap in timeout — prevents hung Puppeteer from stalling entire queue
        await this.withTimeout(
          () => this.processSingleDM(dm, dmService),
          180000, // 3 minutes max per DM
          `DM to @${dm.recipientUsername}`
        );

        // Phase 6: Stochastic human-like delay between DMs (shaped by account personality)
        if (dms.indexOf(dm) < dms.length - 1) {
          const delay = this.getStochasticDelay(personality.seed);
          console.log(`   ⏱️ Waiting ${Math.round(delay/60)}m ${delay%60}s before next DM (stochastic delay)...`);
          await this.sleep(delay * 1000);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error processing DMs for @${account.username}:`, error.message);
    } finally {
      // Always close browser
      if (dmService) {
        await dmService.close();
      }
    }
  }

  /**
   * Process a single DM
   */
  async processSingleDM(dm, dmService) {
    const { id, recipientUsername, messageToSend, igAccountId } = dm;

    // Generate causal chain ID for this specific send attempt
    const sendAttemptId = crypto.randomUUID();

    // Mark as processing with sendAttemptId
    await prisma.dmQueue.update({
      where: { id },
      data: { status: 'processing', processedAt: new Date(), sendAttemptId }
    });

    try {
      // Get the automation to check for Ask for Follow feature
      let automation = null;
      if (dm.commentId) {
        const trigger = await prisma.trigger.findFirst({
          where: { commentId: dm.commentId },
          include: { automation: true }
        });
        automation = trigger?.automation;
      }

      // Check if Ask for Follow is enabled
      if (automation?.askForFollowEnabled) {
        console.log(`   🔍 Ask for Follow enabled, checking follower status...`);

        const followerCheck = await dmService.checkIfFollower(recipientUsername);

        if (followerCheck.found && !followerCheck.isFollower) {
          console.log(`   ⚠️ @${recipientUsername} is not a follower`);

          // Update trigger with follower status
          if (dm.commentId) {
            await prisma.trigger.updateMany({
              where: { commentId: dm.commentId },
              data: { isFollower: false, followRequested: true }
            });
          }

          // If skipNonFollowers is enabled, skip this DM entirely
          if (automation.skipNonFollowers) {
            console.log(`   ⏭️ Skipping DM (skipNonFollowers enabled)`);
            await prisma.dmQueue.update({
              where: { id },
              data: { status: 'skipped', errorMessage: 'User is not a follower' }
            });
            return;
          }

          // Send the "Ask for Follow" message instead of the main message
          if (automation.askForFollowMessage) {
            console.log(`   📤 Sending "Ask for Follow" message instead...`);
            const askFollowResult = await dmService.sendDM(
              recipientUsername,
              automation.askForFollowMessage
            );

            if (askFollowResult.success) {
              // Update status to waiting_follow
              await prisma.dmQueue.update({
                where: { id },
                data: { status: 'waiting_follow', sentAt: new Date() }
              });

              if (dm.commentId) {
                await prisma.trigger.updateMany({
                  where: { commentId: dm.commentId },
                  data: { status: 'waiting_follow' }
                });
              }

              console.log(`   ✅ Ask for Follow message sent to @${recipientUsername}`);
            }
            return;
          }
        } else if (followerCheck.found && followerCheck.isFollower) {
          // Update trigger with follower status
          if (dm.commentId) {
            await prisma.trigger.updateMany({
              where: { commentId: dm.commentId },
              data: { isFollower: true }
            });
          }
          console.log(`   ✅ @${recipientUsername} is a follower, proceeding with DM`);
        }
      }

      // Send the DM (with slight variation to avoid detection)
      const variedMessage = this.addMessageVariation(messageToSend);
      const result = await dmService.sendDM(recipientUsername, variedMessage);

      if (result.success) {
        // Mark as sent
        await prisma.dmQueue.update({
          where: { id },
          data: { status: 'sent', sentAt: new Date() }
        });

        // Update trigger status
        if (dm.commentId) {
          await prisma.trigger.updateMany({
            where: { commentId: dm.commentId },
            data: { dmSent: true, dmSentAt: new Date(), status: 'dm_sent' }
          });
        }

        // Add to DM history (with causal chain)
        await prisma.dmHistory.create({
          data: {
            igAccountId: dm.igAccountId,
            monitoredReelId: dm.monitoredReelId,
            recipientIgId: dm.recipientIgId,
            recipientUsername: dm.recipientUsername,
            commentId: dm.commentId,
            commentText: dm.commentText,
            detectedKeyword: dm.detectedKeyword,
            messageSent: dm.messageToSend,
            sendAttemptId,
            status: 'sent',
            dmSentAt: new Date()
          }
        }).catch(() => {}); // Ignore duplicate errors

        // Update automation stats
        const trigger = await prisma.trigger.findFirst({
          where: { commentId: dm.commentId },
          select: { automationId: true }
        });

        if (trigger) {
          await prisma.automation.update({
            where: { id: trigger.automationId },
            data: { dmsSentCount: { increment: 1 } }
          });
        }

        // Update daily analytics
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await prisma.dailyAnalytics.upsert({
          where: {
            igAccountId_date: {
              igAccountId: dm.igAccountId,
              date: today
            }
          },
          update: {
            dmsSent: { increment: 1 }
          },
          create: {
            igAccountId: dm.igAccountId,
            date: today,
            dmsSent: 1
          }
        });

        await this.recordSuccess(igAccountId);
        console.log(`   ✅ DM sent to @${recipientUsername}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to send DM to @${recipientUsername}:`, error.message);

      const errorMessage = error.message;
      let newStatus = 'failed';
      let shouldRetry = false;
      let errorType = 'GENERIC';

      // Handle specific errors
      if (errorMessage.includes('ACTION_BLOCKED')) {
        newStatus = 'blocked';
        errorType = 'ACTION_BLOCKED';
      } else if (errorMessage.includes('RATE_LIMITED')) {
        newStatus = 'pending';
        shouldRetry = true;
        errorType = 'RATE_LIMITED';
      } else if (errorMessage.includes('SESSION_EXPIRED')) {
        newStatus = 'failed';
        errorType = 'SESSION_EXPIRED';
        await prisma.instagramAccount.update({
          where: { id: igAccountId },
          data: { status: 'session_expired' }
        });
      } else if (errorMessage.includes('DM_RESTRICTED') || errorMessage.includes('Message button')) {
        newStatus = 'failed';
        console.log(`   ⚠️ @${recipientUsername} has DM restrictions enabled`);
      } else if (errorMessage.includes('USER_NOT_FOUND')) {
        newStatus = 'failed';
      } else if (dm.retryCount < 3) {
        shouldRetry = true;
        newStatus = 'pending';
      }

      // Circuit breaker: track account-level failures (skip user-specific errors like DM_RESTRICTED / USER_NOT_FOUND)
      if (!errorMessage.includes('DM_RESTRICTED') && !errorMessage.includes('Message button') && !errorMessage.includes('USER_NOT_FOUND')) {
        await this.recordFailure(igAccountId, errorType, {
          source: 'puppeteer_dom',
          errorMessage: errorMessage.substring(0, 1000),
          dmQueueId: id,
          recipientUsername,
          sendAttemptId,
        });
      }

      // Exponential backoff: 5min, 15min, 45min (capped at 3 hours)
      const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(3, dm.retryCount), 3 * 60 * 60 * 1000);

      // Update queue item
      await prisma.dmQueue.update({
        where: { id },
        data: {
          status: newStatus,
          errorCode: error.code || 'UNKNOWN',
          errorMessage: errorMessage.substring(0, 500),
          retryCount: shouldRetry ? { increment: 1 } : dm.retryCount,
          scheduledAt: shouldRetry ? new Date(Date.now() + backoffMs) : dm.scheduledAt
        }
      });

      // Update trigger status
      if (dm.commentId && !shouldRetry) {
        await prisma.trigger.updateMany({
          where: { commentId: dm.commentId },
          data: { status: 'failed', errorMessage: errorMessage.substring(0, 500) }
        });
      }

      // Update daily analytics for failures
      if (!shouldRetry) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await prisma.dailyAnalytics.upsert({
          where: {
            igAccountId_date: {
              igAccountId: dm.igAccountId,
              date: today
            }
          },
          update: {
            dmsFailed: { increment: 1 }
          },
          create: {
            igAccountId: dm.igAccountId,
            date: today,
            dmsFailed: 1
          }
        });
      }
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get daily DM count for an account
   */
  async getDailyDMCount(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await prisma.dmHistory.count({
      where: {
        igAccountId: accountId,
        dmSentAt: { gte: today }
      }
    });

    return count;
  }

  /**
   * Add slight variation to messages to appear more human
   */
  addMessageVariation(message) {
    // Add random whitespace or emoji variations
    const variations = [
      msg => msg,
      msg => msg + ' ',
      msg => ' ' + msg,
      msg => msg.replace(/!$/, '!!'),
      msg => msg.replace(/\.$/, '...'),
    ];

    const randomVariation = variations[Math.floor(Math.random() * variations.length)];
    return randomVariation(message);
  }
}

// Export singleton instance
const dmQueueWorker = new DMQueueWorker();
module.exports = dmQueueWorker;
