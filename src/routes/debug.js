const express = require('express');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../config/prisma');

/**
 * GET /debug/account/:id
 *
 * Admin debug endpoint — returns full adaptive system state for an account.
 * Protected by auth middleware (only the account owner can view).
 *
 * Returns:
 *   - riskScore (with time-decay applied)
 *   - density60, density10 (rolling window)
 *   - current effective throughput limits (after risk + personality multipliers)
 *   - queued / dropped / expired / sent counts (last 24h)
 *   - personality profile
 *   - circuit breaker state
 *   - recent send timestamps (for delay histogram)
 */
router.get('/account/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const account = await prisma.instagramAccount.findFirst({
      where: { id, userId: req.user.id },
      include: { rateLimitConfig: true },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found or not owned by you' });
    }

    const now = new Date();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last60m = new Date(Date.now() - 60 * 60 * 1000);
    const last10m = new Date(Date.now() - 10 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Rolling window densities
    const [density60, density10, dailyCount] = await Promise.all([
      prisma.dmHistory.count({
        where: { igAccountId: id, status: 'sent', dmSentAt: { gte: last60m } },
      }),
      prisma.dmHistory.count({
        where: { igAccountId: id, status: 'sent', dmSentAt: { gte: last10m } },
      }),
      prisma.dmHistory.count({
        where: { igAccountId: id, dmSentAt: { gte: todayStart } },
      }),
    ]);

    // Queue counts
    const [queuedCount, droppedCount24h, expiredCount24h, sentCount24h, failedCount24h] = await Promise.all([
      prisma.dmQueue.count({ where: { igAccountId: id, status: 'pending' } }),
      prisma.dmQueue.count({ where: { igAccountId: id, status: 'dropped', processedAt: { gte: last24h } } }),
      prisma.dmQueue.count({ where: { igAccountId: id, status: 'expired', processedAt: { gte: last24h } } }),
      prisma.dmHistory.count({ where: { igAccountId: id, status: 'sent', dmSentAt: { gte: last24h } } }),
      prisma.dmQueue.count({ where: { igAccountId: id, status: 'failed', processedAt: { gte: last24h } } }),
    ]);

    // Risk score with time-decay
    let riskScore = account.riskScore || 0;
    if (account.riskUpdatedAt && riskScore > 0) {
      const RISK_DECAY_PER_HOUR = 0.17; // Must match dmQueueWorker.js
      const hoursSince = (Date.now() - new Date(account.riskUpdatedAt).getTime()) / (60 * 60 * 1000);
      riskScore = Math.max(0, riskScore - hoursSince * RISK_DECAY_PER_HOUR);
    }
    riskScore = Math.round(riskScore * 100) / 100;

    // Throughput multiplier from risk
    const RISK_THROUGHPUT_MAP = [
      { maxRisk: 1, multiplier: 1.0 },
      { maxRisk: 3, multiplier: 0.8 },
      { maxRisk: 5, multiplier: 0.5 },
      { maxRisk: 7, multiplier: 0.3 },
      { maxRisk: 10, multiplier: 0.15 },
    ];
    let riskMultiplier = 0.15;
    for (const tier of RISK_THROUGHPUT_MAP) {
      if (riskScore <= tier.maxRisk) { riskMultiplier = tier.multiplier; break; }
    }

    // Personality
    const seed = account.behaviorSeed ?? null;
    const seedVariance = seed !== null ? (0.9 + seed * 0.2) : 1.0;
    const personalityMult = (account.aggressionFactor || 1.0) * seedVariance;
    const combinedMult = riskMultiplier * personalityMult;

    // Effective limits
    const baseMaxHour = account.rateLimitConfig?.maxDmsPerHour ?? 8;
    const baseMaxDay = account.rateLimitConfig?.maxDmsPerDay ?? 50;
    const effectiveMaxHour = Math.max(1, Math.floor(baseMaxHour * combinedMult));
    const effectiveMaxBurst = Math.max(1, Math.floor(Math.ceil(baseMaxHour / 6) * combinedMult));

    // Recent send timestamps (last 2 hours — for delay histogram)
    const recentSends = await prisma.dmHistory.findMany({
      where: { igAccountId: id, status: 'sent', dmSentAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
      select: { dmSentAt: true },
      orderBy: { dmSentAt: 'asc' },
    });

    // Calculate delay histogram (gaps between consecutive sends)
    const delays = [];
    for (let i = 1; i < recentSends.length; i++) {
      const gapSec = (new Date(recentSends[i].dmSentAt) - new Date(recentSends[i - 1].dmSentAt)) / 1000;
      delays.push(Math.round(gapSec));
    }

    const avgDelay = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;
    const minDelay = delays.length > 0 ? Math.min(...delays) : null;
    const maxDelay = delays.length > 0 ? Math.max(...delays) : null;

    // Success rate (rolling 24h)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [successSent, successFailed] = await Promise.all([
      prisma.dmHistory.count({ where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since24h } } }),
      prisma.dmQueue.count({ where: { igAccountId: id, status: { in: ['failed', 'blocked'] }, processedAt: { gte: since24h } } }),
    ]);
    const successTotal = successSent + successFailed;
    const successRate = successTotal >= 5 ? Math.round((successSent / successTotal) * 100) : null;

    // 7-day baseline success rate (excludes last 24h to avoid pollution)
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [baselineSent, baselineFailed] = await Promise.all([
      prisma.dmHistory.count({ where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since7d, lte: since24h } } }),
      prisma.dmQueue.count({ where: { igAccountId: id, status: { in: ['failed', 'blocked'] }, processedAt: { gte: since7d, lte: since24h } } }),
    ]);
    const baselineTotal = baselineSent + baselineFailed;
    const baselineSuccessRate = baselineTotal >= 20 ? Math.round((baselineSent / baselineTotal) * 100) : null;
    const adaptiveThreshold = baselineSuccessRate !== null
      ? Math.max(50, baselineSuccessRate - 15)
      : 70; // fallback for new accounts

    // Send latency (last 2 hours)
    const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const latencyResult = await prisma.dmHistory.aggregate({
      where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since2h }, sendLatencyMs: { not: null } },
      _avg: { sendLatencyMs: true },
      _max: { sendLatencyMs: true },
      _count: { sendLatencyMs: true },
    });

    // 7-day baseline latency (excludes last 2 hours)
    const baselineLatencyResult = await prisma.dmHistory.aggregate({
      where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since7d, lte: since2h }, sendLatencyMs: { not: null } },
      _avg: { sendLatencyMs: true },
      _count: { sendLatencyMs: true },
    });
    const baselineLatencyAvg = Math.round(baselineLatencyResult._avg.sendLatencyMs || 0);
    const currentLatencyAvg = Math.round(latencyResult._avg.sendLatencyMs || 0);
    const latencyRatio = baselineLatencyAvg > 0 ? currentLatencyAvg / baselineLatencyAvg : 0;

    // Working hours check
    const currentHour = now.getHours();
    const workStart = account.workingHoursStart ?? 9;
    const workEnd = account.workingHoursEnd ?? 22;
    let withinWorkingHours;
    if (workStart <= workEnd) {
      withinWorkingHours = currentHour >= workStart && currentHour < workEnd;
    } else {
      withinWorkingHours = currentHour >= workStart || currentHour < workEnd;
    }

    res.json({
      account: {
        id: account.id,
        username: account.username,
        status: account.status,
      },
      circuitBreaker: {
        isPaused: account.isPaused,
        pauseReason: account.pauseReason,
        pausedUntil: account.pausedUntil,
        consecutiveFailures: account.consecutiveFailures,
        lastFailureAt: account.lastFailureAt,
      },
      riskEngine: {
        riskScore,
        riskRaw: account.riskScore,
        riskUpdatedAt: account.riskUpdatedAt,
        riskMultiplier: Math.round(riskMultiplier * 100) / 100,
      },
      personality: {
        behaviorSeed: seed,
        workingHours: `${workStart}:00–${workEnd}:00`,
        withinWorkingHours,
        aggressionFactor: account.aggressionFactor,
        personalityMultiplier: Math.round(personalityMult * 100) / 100,
        combinedMultiplier: Math.round(combinedMult * 100) / 100,
      },
      throughput: {
        baseLimits: { maxHour: baseMaxHour, maxDay: baseMaxDay },
        effectiveLimits: { maxHour: effectiveMaxHour, maxDay: baseMaxDay, maxBurst: effectiveMaxBurst },
        floor: { minHour: Math.max(1, Math.floor(baseMaxHour * 0.15)), note: '15% of base — never drops below this unless paused' },
        rollingWindow: { density60, density10, dailySent: dailyCount },
        canSend: withinWorkingHours && density60 < effectiveMaxHour && density10 < effectiveMaxBurst && dailyCount < baseMaxDay,
      },
      queue: {
        pending: queuedCount,
        sentLast24h: sentCount24h,
        droppedLast24h: droppedCount24h,
        expiredLast24h: expiredCount24h,
        failedLast24h: failedCount24h,
      },
      silentThrottleDetection: {
        successRate24h: successRate !== null ? `${successRate}%` : 'insufficient data',
        successSent,
        successFailed,
        adaptiveBaseline: {
          baseline7d: baselineSuccessRate !== null ? `${baselineSuccessRate}%` : 'insufficient data (need 20+ attempts)',
          baselineSampleSize: baselineTotal,
          adaptiveThreshold: `${adaptiveThreshold}%`,
          usingStaticFallback: baselineSuccessRate === null,
        },
        isThrottled: successRate !== null && successRate < adaptiveThreshold,
        sendLatency: {
          currentAvgMs: currentLatencyAvg,
          maxMs: latencyResult._max.sendLatencyMs || 0,
          sampleSize: latencyResult._count.sendLatencyMs || 0,
          baseline7dAvgMs: baselineLatencyAvg,
          baselineSampleSize: baselineLatencyResult._count.sendLatencyMs || 0,
          latencyRatio: latencyRatio > 0 ? `${latencyRatio.toFixed(2)}×` : 'n/a',
          isLatencyAnomaly: latencyRatio >= 1.8 && (latencyResult._count.sendLatencyMs || 0) >= 5,
        },
        killThreshold: {
          riskTriggered: riskScore >= 8,
          successTriggered: successRate !== null && successRate < 40,
          latencyTriggered: latencyRatio >= 3.0 && (baselineLatencyResult._count.sendLatencyMs || 0) >= 10,
          wouldKill: (riskScore >= 8) && (successRate !== null && successRate < 40) && (latencyRatio >= 3.0),
        },
      },
      delayHistogram: {
        sampleSize: delays.length,
        avgDelaySec: avgDelay,
        minDelaySec: minDelay,
        maxDelaySec: maxDelay,
        recentDelays: delays.slice(-10), // last 10 gaps
      },
      meta: {
        timestamp: now.toISOString(),
        currentHour,
      },
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
