/**
 * Enforcement Event Logger
 *
 * Records every enforcement signal, state transition, and system decision
 * with full context snapshot. This is the ground truth table for:
 *
 *   - Validating kill logic (are we pausing at the right time?)
 *   - Calibrating health scores (do scores predict enforcement?)
 *   - Tuning throttle thresholds (are we over/under-reacting?)
 *   - Measuring recovery velocity (how long after pause until healthy?)
 *
 * Without this data, the entire adaptive system is hypothesis.
 *
 * Usage:
 *   const enforcement = require('./enforcementLogger');
 *   await enforcement.log(accountId, {
 *     eventType: 'action_blocked',
 *     triggerSource: 'instagram_api',
 *     actionTaken: 'paused_24h',
 *     errorMessage: 'ACTION_BLOCKED: ...',
 *     httpStatusCode: 400,
 *     riskDelta: 5.0,
 *     sendAttemptId: 'uuid-of-the-send-attempt',
 *   });
 */
const crypto = require('crypto');

const prisma = require('../config/prisma');

// Decision model version — bump this whenever thresholds or logic change.
// Without versioning, future calibration queries can't distinguish
// which logic version produced which outcomes.
const CONTROL_MODEL_VERSION = '1.1.0';

class EnforcementLogger {
  /**
   * Log an enforcement event with full account state snapshot.
   *
   * @param {string} accountId - Instagram account UUID
   * @param {object} event - Event data
   * @param {string} event.eventType - Classification of the event
   * @param {string} event.triggerSource - What system detected/triggered this
   * @param {string} event.actionTaken - What the system did in response
   * @param {string} [event.errorMessage] - Raw error message (truncated to 1000 chars)
   * @param {number} [event.httpStatusCode] - HTTP status code if available
   * @param {string} [event.errorSubcode] - Meta API error subcode
   * @param {number} [event.riskDelta] - Risk points added/removed
   * @param {number} [event.throughputBefore] - maxHour before event
   * @param {number} [event.throughputAfter] - maxHour after event
   * @param {string} [event.dmQueueId] - Specific DM that triggered this
   * @param {string} [event.recipientUsername] - Recipient of the DM
   * @param {string} [event.sendAttemptId] - Causal chain UUID from the DM send attempt
   */
  async log(accountId, event) {
    try {
      // Snapshot current account state at event time
      const [riskScore, successRate, latency, density60, dailySent, contextFlags] = await Promise.all([
        this.getCurrentRisk(accountId),
        this.getCurrentSuccessRate(accountId),
        this.getCurrentLatency(accountId),
        this.getDensity60(accountId),
        this.getDailySent(accountId),
        this.getContextFlags(accountId),
      ]);

      await prisma.enforcementEvent.create({
        data: {
          igAccountId: accountId,
          eventType: event.eventType,
          triggerSource: event.triggerSource,
          actionTaken: event.actionTaken,
          errorMessage: event.errorMessage ? event.errorMessage.substring(0, 1000) : null,
          httpStatusCode: event.httpStatusCode || null,
          errorSubcode: event.errorSubcode || null,
          // Account state snapshot (frozen at t=0)
          riskScoreAtEvent: riskScore,
          successRateAtEvent: successRate,
          latencyAtEvent: latency,
          density60AtEvent: density60,
          dailySentAtEvent: dailySent,
          // Contextual flags — without these, post-mortem analysis is noisy
          overrideActiveAtEvent: contextFlags.overrideActive,
          accountPausedAtEvent: contextFlags.isPaused,
          volatilityLevelAtEvent: contextFlags.volatilityLevel,
          // Model versioning — enables comparing calibration across logic changes
          controlModelVersion: CONTROL_MODEL_VERSION,
          // Causal chain
          sendAttemptId: event.sendAttemptId || null,
          // Decision context
          riskDelta: event.riskDelta || null,
          throughputBefore: event.throughputBefore || null,
          throughputAfter: event.throughputAfter || null,
          dmQueueId: event.dmQueueId || null,
          recipientUsername: event.recipientUsername || null,
        },
      });
    } catch (err) {
      // Enforcement logging is critical but must never block the main pipeline
      console.error(`   ❌ Enforcement log failed for account ${accountId}:`, err.message);
    }
  }

  /**
   * Mark the most recent unresolved event of a given type as resolved.
   * Called when an account passes deterministic recovery criteria.
   */
  async markResolved(accountId, eventType) {
    try {
      const event = await prisma.enforcementEvent.findFirst({
        where: {
          igAccountId: accountId,
          eventType,
          resolvedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (event) {
        const recoveryDurationMs = Date.now() - new Date(event.createdAt).getTime();
        await prisma.enforcementEvent.update({
          where: { id: event.id },
          data: {
            resolvedAt: new Date(),
            recoveryDurationMs,
          },
        });
        const hours = Math.round(recoveryDurationMs / 3600000 * 10) / 10;
        console.log(`   📊 Enforcement resolved: ${eventType} for account ${accountId} — recovery took ${hours}h`);
      }
    } catch (err) {
      console.error(`   ❌ Enforcement resolve failed:`, err.message);
    }
  }

  /**
   * Deterministic recovery check.
   *
   * Recovery is NOT fuzzy. All four criteria must be true simultaneously:
   *   1. Account is not paused (isPaused = false)
   *   2. Success rate > 80% over 2h window (minimum 5 samples)
   *   3. Latency within 1.5× of 7-day baseline
   *   4. No enforcement events for 2h
   *
   * If all four pass, resolve all unresolved enforcement events for the account.
   * Returns { recovered: boolean, criteria: {...} } for observability.
   */
  async checkRecovery(accountId) {
    try {
      // Check if there are any unresolved enforcement events to recover from
      const unresolvedCount = await prisma.enforcementEvent.count({
        where: {
          igAccountId: accountId,
          resolvedAt: null,
          eventType: { in: ['action_blocked', 'rate_limited', 'kill_triggered', 'latency_anomaly', 'session_expired'] },
        },
      });

      if (unresolvedCount === 0) return { recovered: false, reason: 'no_unresolved_events' };

      // Criterion 1: Account is not paused
      const account = await prisma.instagramAccount.findUnique({
        where: { id: accountId },
        select: { isPaused: true },
      });
      if (account?.isPaused) {
        return { recovered: false, criteria: { notPaused: false } };
      }

      // Criterion 2: Success rate > 80% over 2h window (min 5 samples)
      const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const [sent2h, failed2h] = await Promise.all([
        prisma.dmHistory.count({
          where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since2h } },
        }),
        prisma.dmQueue.count({
          where: { igAccountId: accountId, status: { in: ['failed', 'blocked'] }, processedAt: { gte: since2h } },
        }),
      ]);
      const total2h = sent2h + failed2h;
      const successRate2h = total2h >= 5 ? sent2h / total2h : null;
      const successPassed = successRate2h !== null && successRate2h > 0.8;

      if (!successPassed) {
        return { recovered: false, criteria: { notPaused: true, successRate: successRate2h, successPassed: false } };
      }

      // Criterion 3: Latency within 1.5× of 7-day baseline
      const [currentLatency, baselineLatency] = await Promise.all([
        this.getCurrentLatency(accountId),
        this.getBaselineLatency(accountId),
      ]);
      const latencyRatio = (baselineLatency && baselineLatency > 0 && currentLatency)
        ? currentLatency / baselineLatency
        : 0;
      // Pass if no baseline data (can't measure) or ratio is acceptable
      const latencyPassed = baselineLatency === null || baselineLatency === 0 || latencyRatio <= 1.5;

      if (!latencyPassed) {
        return { recovered: false, criteria: { notPaused: true, successPassed: true, latencyRatio: Math.round(latencyRatio * 10) / 10, latencyPassed: false } };
      }

      // Criterion 4: No enforcement events for 2h
      const recentEnforcement = await prisma.enforcementEvent.count({
        where: {
          igAccountId: accountId,
          createdAt: { gte: since2h },
          eventType: { in: ['action_blocked', 'rate_limited', 'kill_triggered', 'latency_anomaly'] },
        },
      });
      const quietPassed = recentEnforcement === 0;

      if (!quietPassed) {
        return { recovered: false, criteria: { notPaused: true, successPassed: true, latencyPassed: true, recentEvents: recentEnforcement, quietPassed: false } };
      }

      // ALL FOUR CRITERIA MET — resolve all unresolved enforcement events
      const unresolved = await prisma.enforcementEvent.findMany({
        where: {
          igAccountId: accountId,
          resolvedAt: null,
          eventType: { in: ['action_blocked', 'rate_limited', 'kill_triggered', 'latency_anomaly', 'session_expired', 'consecutive_failures'] },
        },
        select: { id: true, eventType: true, createdAt: true },
      });

      for (const evt of unresolved) {
        const recoveryDurationMs = Date.now() - new Date(evt.createdAt).getTime();
        await prisma.enforcementEvent.update({
          where: { id: evt.id },
          data: { resolvedAt: new Date(), recoveryDurationMs },
        });
      }

      // Log the recovery itself as an event
      await this.log(accountId, {
        eventType: 'recovery_detected',
        triggerSource: 'recovery_checker',
        actionTaken: 'no_action',
        errorMessage: `Deterministic recovery: resolved ${unresolved.length} event(s). ` +
          `SR=${(successRate2h * 100).toFixed(0)}%, latency=${latencyRatio.toFixed(1)}×, quiet=2h`,
      });

      console.log(`   ✅ RECOVERY @account ${accountId}: all 4 criteria met, resolved ${unresolved.length} event(s)`);

      return {
        recovered: true,
        criteria: {
          notPaused: true,
          successRate: Math.round(successRate2h * 100) / 100,
          successPassed: true,
          latencyRatio: Math.round(latencyRatio * 10) / 10,
          latencyPassed: true,
          recentEvents: 0,
          quietPassed: true,
        },
        resolved: unresolved.length,
      };
    } catch (err) {
      console.error(`   ❌ Recovery check failed for account ${accountId}:`, err.message);
      return { recovered: false, error: err.message };
    }
  }

  /**
   * Generate a sendAttemptId (UUID v4) for causal chain linking.
   * Called at the start of each DM send attempt.
   */
  generateSendAttemptId() {
    return crypto.randomUUID();
  }

  // ─── Internal helpers (fast, non-blocking) ───

  /**
   * Get contextual flags for the account at event time.
   * These prevent noisy post-mortem analysis.
   */
  async getContextFlags(accountId) {
    const account = await prisma.instagramAccount.findUnique({
      where: { id: accountId },
      select: { overrideActive: true, isPaused: true },
    });

    // Get latest volatility level from most recent health snapshot
    const latestSnapshot = await prisma.accountHealthSnapshot.findFirst({
      where: { igAccountId: accountId },
      orderBy: { date: 'desc' },
      select: { successRateStddev: true, latencyStddev: true, volumeStddev: true },
    });

    let volatilityLevel = 'unknown';
    if (latestSnapshot) {
      let volatileCount = 0;
      if (latestSnapshot.successRateStddev !== null && latestSnapshot.successRateStddev > 0.15) volatileCount++;
      if (latestSnapshot.latencyStddev !== null && latestSnapshot.latencyStddev > 500) volatileCount++;
      if (latestSnapshot.volumeStddev !== null && latestSnapshot.volumeStddev > 15) volatileCount++;
      volatilityLevel = volatileCount >= 2 ? 'high' : volatileCount === 1 ? 'moderate' : 'stable';
    }

    return {
      overrideActive: account?.overrideActive || false,
      isPaused: account?.isPaused || false,
      volatilityLevel,
    };
  }

  async getCurrentRisk(accountId) {
    const acct = await prisma.instagramAccount.findUnique({
      where: { id: accountId },
      select: { riskScore: true, riskUpdatedAt: true },
    });
    let risk = acct?.riskScore ?? 0;
    if (acct?.riskUpdatedAt && risk > 0) {
      const hoursSince = (Date.now() - new Date(acct.riskUpdatedAt).getTime()) / 3600000;
      risk = Math.max(0, risk - hoursSince * 0.17); // Same decay as dmQueueWorker
    }
    return Math.round(risk * 100) / 100;
  }

  async getCurrentSuccessRate(accountId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sent, failed] = await Promise.all([
      prisma.dmHistory.count({ where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since } } }),
      prisma.dmQueue.count({ where: { igAccountId: accountId, status: { in: ['failed', 'blocked'] }, processedAt: { gte: since } } }),
    ]);
    const total = sent + failed;
    return total >= 3 ? Math.round((sent / total) * 100) / 100 : null;
  }

  async getCurrentLatency(accountId) {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = await prisma.dmHistory.aggregate({
      where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since }, sendLatencyMs: { not: null } },
      _avg: { sendLatencyMs: true },
    });
    return result._avg.sendLatencyMs ? Math.round(result._avg.sendLatencyMs) : null;
  }

  async getBaselineLatency(accountId) {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const exclude2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = await prisma.dmHistory.aggregate({
      where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since7d, lte: exclude2h }, sendLatencyMs: { not: null } },
      _avg: { sendLatencyMs: true },
    });
    return result._avg.sendLatencyMs ? Math.round(result._avg.sendLatencyMs) : null;
  }

  async getDensity60(accountId) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    return prisma.dmHistory.count({
      where: { igAccountId: accountId, status: 'sent', dmSentAt: { gte: since } },
    });
  }

  async getDailySent(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return prisma.dmHistory.count({
      where: { igAccountId: accountId, dmSentAt: { gte: today } },
    });
  }
}

const enforcementLogger = new EnforcementLogger();
module.exports = enforcementLogger;
