/**
 * Account Health API
 *
 * User-facing endpoint that surfaces account health signals.
 * Unlike /debug (admin-only internals), this provides actionable
 * health information for the dashboard.
 *
 * Architecture:
 *   Health Score (0-100)    — overall grade, shown on dashboard
 *   Confidence Level        — low/medium/high based on sample size
 *   Platform Friction Index — platform-only signals (latency, risk, 429s, success rate)
 *   Engagement Quality      — audience-side signals (reply rate, content relevance)
 *   Trend + Volatility      — 7-day direction + stability measurement
 *   Recovery Slope          — tracks whether throttled accounts are recovering
 *   Override Governance     — user override status + consequences
 */
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const enforcement = require('../services/enforcementLogger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/account-health/:id
 *
 * Returns health score, friction index, engagement quality, and trend.
 * Protected: only the account owner can view.
 */
router.get('/:id', protect, async (req, res) => {
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
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // ─── Current metrics (live) ───

    const [sent24h, failed24h, latencyResult, repliedCount24h, sent7d] = await Promise.all([
      prisma.dmHistory.count({
        where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since24h } },
      }),
      prisma.dmQueue.count({
        where: { igAccountId: id, status: { in: ['failed', 'blocked'] }, processedAt: { gte: since24h } },
      }),
      prisma.dmHistory.aggregate({
        where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since24h }, sendLatencyMs: { not: null } },
        _avg: { sendLatencyMs: true },
        _count: { sendLatencyMs: true },
      }),
      prisma.dmHistory.count({
        where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since24h }, repliedAt: { not: null } },
      }),
      prisma.dmHistory.count({
        where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since7d } },
      }),
    ]);

    const total24h = sent24h + failed24h;
    const successRate24h = total24h >= 3 ? sent24h / total24h : null;
    const replyRate24h = sent24h >= 3 ? repliedCount24h / sent24h : null;
    const avgLatency24h = Math.round(latencyResult._avg.sendLatencyMs || 0);

    // ─── Confidence Level ───
    // Based on total 7-day volume. Health score without data is a guess.

    let confidenceLevel;
    let confidenceNote;
    if (sent7d < 20) {
      confidenceLevel = 'low';
      confidenceNote = 'Less than 20 sends in 7 days. Health score is an estimate.';
    } else if (sent7d < 100) {
      confidenceLevel = 'medium';
      confidenceNote = `${sent7d} sends in 7 days. Health score is moderately reliable.`;
    } else {
      confidenceLevel = 'high';
      confidenceNote = `${sent7d} sends in 7 days. Health score is well-calibrated.`;
    }

    // ─── 7-day snapshots + trend + volatility ───

    const snapshots = await prisma.accountHealthSnapshot.findMany({
      where: { igAccountId: id, date: { gte: since7d } },
      orderBy: { date: 'asc' },
    });

    let trend = 'stable';
    let trendDetail = {};
    let volatility = { level: 'unknown', detail: {} };

    if (snapshots.length >= 4) {
      const mid = Math.floor(snapshots.length / 2);
      const firstHalf = snapshots.slice(0, mid);
      const secondHalf = snapshots.slice(mid);

      const avgOf = (arr, key) => {
        const vals = arr.map(s => s[key]).filter(v => v !== null);
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };

      const firstSuccessRate = avgOf(firstHalf, 'successRate');
      const secondSuccessRate = avgOf(secondHalf, 'successRate');
      const firstLatency = avgOf(firstHalf, 'avgLatencyMs');
      const secondLatency = avgOf(secondHalf, 'avgLatencyMs');
      const firstReplyRate = avgOf(firstHalf, 'replyRate');
      const secondReplyRate = avgOf(secondHalf, 'replyRate');
      const firstVolume = avgOf(firstHalf, 'dmsSent');
      const secondVolume = avgOf(secondHalf, 'dmsSent');

      trendDetail = {
        successRate: { first: round2(firstSuccessRate, 100), second: round2(secondSuccessRate, 100) },
        latency: { first: round2(firstLatency, 1), second: round2(secondLatency, 1) },
        replyRate: { first: round2(firstReplyRate, 100), second: round2(secondReplyRate, 100) },
        volume: { first: round2(firstVolume, 1), second: round2(secondVolume, 1) },
      };

      // Determine trend direction
      let degradingSignals = 0;
      let improvingSignals = 0;

      if (firstSuccessRate !== null && secondSuccessRate !== null) {
        if (secondSuccessRate < firstSuccessRate - 0.05) degradingSignals++;
        if (secondSuccessRate > firstSuccessRate + 0.05) improvingSignals++;
      }
      if (firstLatency !== null && secondLatency !== null && firstLatency > 0) {
        if (secondLatency > firstLatency * 1.3) degradingSignals++;
        if (secondLatency < firstLatency * 0.7) improvingSignals++;
      }
      // Reply rate trend: only for platform friction if it moves WITH success rate.
      // Reply rate alone is engagement quality, not friction.
      if (firstReplyRate !== null && secondReplyRate !== null) {
        if (secondReplyRate < firstReplyRate - 0.1) degradingSignals++;
        if (secondReplyRate > firstReplyRate + 0.1) improvingSignals++;
      }

      if (degradingSignals >= 2) trend = 'degrading';
      else if (improvingSignals >= 2) trend = 'improving';
      else trend = 'stable';

      // Volatility from latest snapshot's stddev values
      const latest = snapshots[snapshots.length - 1];
      const srStd = latest.successRateStddev;
      const latStd = latest.latencyStddev;
      const volStd = latest.volumeStddev;

      let volatileCount = 0;
      if (srStd !== null && srStd > 0.15) volatileCount++;     // >15pp success rate swing
      if (latStd !== null && latStd > 500) volatileCount++;     // >500ms latency swing
      if (volStd !== null && volStd > 15) volatileCount++;      // >15 DMs/day volume swing

      volatility = {
        level: volatileCount >= 2 ? 'high' : volatileCount === 1 ? 'moderate' : 'stable',
        detail: {
          successRateStddev: srStd !== null ? Math.round(srStd * 100) / 100 : null,
          latencyStddev: latStd !== null ? Math.round(latStd) : null,
          volumeStddev: volStd !== null ? Math.round(volStd * 10) / 10 : null,
        },
        note: volatileCount >= 2
          ? 'Metrics swinging wildly day-to-day. May indicate Instagram enforcement experimentation.'
          : null,
      };
    }

    // ─── Platform Friction Index (0-100, 100 = zero friction) ───
    // Only platform-caused signals. Reply rate is EXCLUDED.
    // This tells you: "Is Instagram blocking/throttling this account?"

    let frictionIndex = 100;
    const frictionSignals = [];

    const riskScore = account.riskScore || 0;
    if (riskScore > 0) {
      const riskPenalty = Math.min(35, riskScore * 3.5);
      frictionIndex -= riskPenalty;
      if (riskScore > 3) frictionSignals.push({ signal: 'elevated_risk', value: Math.round(riskScore * 10) / 10, penalty: Math.round(riskPenalty) });
    }

    if (successRate24h !== null) {
      const successPenalty = Math.max(0, (1 - successRate24h) * 70);
      frictionIndex -= Math.min(35, successPenalty);
      if (successRate24h < 0.85) frictionSignals.push({ signal: 'low_success_rate', value: `${Math.round(successRate24h * 100)}%`, penalty: Math.round(Math.min(35, successPenalty)) });
    }

    // Latency deviation from baseline
    const baselineLatencyResult = await prisma.dmHistory.aggregate({
      where: { igAccountId: id, status: 'sent', dmSentAt: { gte: since7d, lte: since24h }, sendLatencyMs: { not: null } },
      _avg: { sendLatencyMs: true },
      _count: { sendLatencyMs: true },
    });
    const baselineLatency = Math.round(baselineLatencyResult._avg.sendLatencyMs || 0);
    const latencyRatio = baselineLatency > 0 && avgLatency24h > 0 ? avgLatency24h / baselineLatency : 0;

    if (latencyRatio > 1.5 && (latencyResult._count.sendLatencyMs || 0) >= 3) {
      const latencyPenalty = Math.min(20, (latencyRatio - 1) * 10);
      frictionIndex -= latencyPenalty;
      frictionSignals.push({ signal: 'latency_spike', value: `${latencyRatio.toFixed(1)}× baseline`, penalty: Math.round(latencyPenalty) });
    }

    if (volatility.level === 'high') {
      frictionIndex -= 10;
      frictionSignals.push({ signal: 'high_volatility', value: 'Unstable metrics', penalty: 10 });
    }

    frictionIndex = Math.max(0, Math.round(frictionIndex));

    // ─── Engagement Quality (0-100, 100 = excellent engagement) ───
    // Audience-side signals only. Not platform health.
    // Low engagement ≠ enforcement. It may mean bad content/offer.

    let engagementScore = 100;
    const engagementSignals = [];

    if (replyRate24h !== null) {
      // Normalize: 30%+ reply rate = excellent, 10-30% = good, <10% = poor
      if (replyRate24h >= 0.3) {
        // No penalty
      } else if (replyRate24h >= 0.1) {
        engagementScore -= Math.round((0.3 - replyRate24h) * 100);
      } else {
        engagementScore -= 30;
        engagementSignals.push({ signal: 'very_low_reply_rate', value: `${Math.round(replyRate24h * 100)}%`, note: 'This may indicate content/offer issues OR message visibility throttling' });
      }
    }

    // When reply rate drops AND success rate drops simultaneously,
    // that's a stronger platform friction signal than either alone
    if (replyRate24h !== null && successRate24h !== null) {
      if (replyRate24h < 0.1 && successRate24h < 0.8) {
        engagementSignals.push({ signal: 'correlated_drop', note: 'Both reply rate and success rate are low — platform restriction likely, not just content' });
      }
    }

    engagementScore = Math.max(0, Math.round(engagementScore));

    // ─── Health Score (0-100) — composite of friction + engagement + trend ───

    let healthScore = 100;
    const signals = [];

    // Friction-based penalty (0-40 points)
    const frictionPenalty = Math.min(40, Math.round((100 - frictionIndex) * 0.4));
    healthScore -= frictionPenalty;

    // Engagement-based penalty (0-20 points) — CAPPED at 20.
    // Bad engagement should concern, not panic. Platform friction is the real danger.
    const engagementPenalty = Math.min(20, Math.round((100 - engagementScore) * 0.2));
    healthScore -= engagementPenalty;

    // Trend penalty (0-15 points)
    if (trend === 'degrading') {
      healthScore -= 15;
      signals.push({ signal: 'degrading_trend', severity: 'warning', value: '7-day metrics declining' });
    }

    // Paused penalty (0-10 points)
    if (account.isPaused) {
      healthScore -= 10;
      signals.push({ signal: 'account_paused', severity: 'critical', value: account.pauseReason });
    }

    // Volatility penalty (0-10 points)
    if (volatility.level === 'high') {
      healthScore -= 10;
      signals.push({ signal: 'high_volatility', severity: 'warning', value: 'Metrics unstable — possible enforcement experimentation' });
    }

    // Override penalty (0-5 points)
    if (account.overrideActive) {
      healthScore -= 5;
      signals.push({ signal: 'user_override_active', severity: 'info', value: `Override expires ${account.overrideExpiresAt?.toISOString() || 'unknown'}` });
    }

    healthScore = Math.max(0, Math.round(healthScore));

    // ─── Recovery Slope ───
    // If account is currently throttled (frictionIndex < 60), track whether it's recovering.
    // Recovery requires STRICTER improvement than degradation detection (hysteresis).
    // Degradation trigger: 5pp drop. Recovery requires: 7-10pp improvement.

    let recovery = null;
    if (frictionIndex < 60 && snapshots.length >= 3) {
      const recent3 = snapshots.slice(-3);
      const srValues = recent3.map(s => s.successRate).filter(v => v !== null);
      const latValues = recent3.map(s => s.avgLatencyMs).filter(v => v !== null);

      let recoveringSignals = 0;
      let stalledSignals = 0;

      if (srValues.length >= 2) {
        const srDelta = srValues[srValues.length - 1] - srValues[0];
        if (srDelta > 0.07) recoveringSignals++;       // 7pp improvement (hysteresis: degradation was 5pp)
        else if (srDelta < -0.03) stalledSignals++;
      }
      if (latValues.length >= 2 && latValues[0] > 0) {
        const latRatio = latValues[latValues.length - 1] / latValues[0];
        if (latRatio < 0.75) recoveringSignals++;       // 25% latency improvement
        else if (latRatio > 1.1) stalledSignals++;
      }

      let slope;
      if (recoveringSignals >= 2) slope = 'recovering';
      else if (stalledSignals >= 1) slope = 'stalled';
      else if (recoveringSignals >= 1) slope = 'slow_recovery';
      else slope = 'flat';

      recovery = {
        slope,
        note: slope === 'recovering'
          ? 'Account metrics are improving. System will gradually restore throughput.'
          : slope === 'stalled'
            ? 'Recovery has stalled. Consider pausing for 24 hours.'
            : 'Monitoring recovery trajectory.',
        hysteresis: 'Degradation triggers at 5pp drop. Recovery requires 7pp improvement. This prevents oscillation.',
      };
    }

    // ─── Confidence-adjusted grade ───

    let grade;
    if (healthScore >= 90) grade = 'A';
    else if (healthScore >= 75) grade = 'B';
    else if (healthScore >= 60) grade = 'C';
    else if (healthScore >= 40) grade = 'D';
    else grade = 'F';

    // ─── Recommendations ───

    const recommendations = [];

    if (account.isPaused) {
      recommendations.push({ priority: 'high', action: 'Account is paused', detail: `Reason: ${account.pauseReason}. Auto-resume at ${account.pausedUntil?.toISOString() || 'unknown'}.` });
    }
    if (frictionIndex < 40) {
      recommendations.push({ priority: 'high', action: 'High platform friction detected', detail: 'Instagram is likely restricting this account. The system has automatically throttled throughput. Let it recover for 24-48 hours.' });
    } else if (frictionIndex < 60) {
      recommendations.push({ priority: 'medium', action: 'Elevated platform friction', detail: 'Some friction detected. System is adjusting throughput. Monitor over the next 24 hours.' });
    }
    if (engagementScore < 50 && frictionIndex > 60) {
      recommendations.push({ priority: 'medium', action: 'Review message content', detail: 'Low engagement with healthy delivery suggests content/offer may need improvement. Platform delivery appears normal.' });
    }
    if (engagementScore < 50 && frictionIndex < 60) {
      recommendations.push({ priority: 'high', action: 'Check account status', detail: 'Both delivery and engagement are poor. Verify your account is not action-blocked on Instagram.' });
    }
    if (volatility.level === 'high') {
      recommendations.push({ priority: 'medium', action: 'Metrics unstable', detail: 'Day-to-day swings may indicate Instagram testing enforcement on this account. Consider reducing volume temporarily.' });
    }
    if (recovery?.slope === 'stalled') {
      recommendations.push({ priority: 'medium', action: 'Recovery stalled', detail: 'Throttled metrics are not improving. Consider pausing for 24 hours to fully reset.' });
    }
    if (account.overrideActive) {
      recommendations.push({ priority: 'info', action: 'Override active', detail: `You requested higher throughput. Throughput capped at 50% of base max. Override expires ${account.overrideExpiresAt?.toISOString() || 'in 24h'}. Any action block will revoke immediately.` });
    }
    if (healthScore >= 80 && recommendations.length === 0) {
      recommendations.push({ priority: 'info', action: 'All systems healthy', detail: 'Your account is operating within normal parameters.' });
    }

    // ─── Override governance status ───

    const overrideStatus = {
      active: account.overrideActive || false,
      expiresAt: account.overrideExpiresAt,
      lifetimeCount: account.overrideCount || 0,
      consequences: account.overrideActive
        ? 'Throughput capped at 50% of base max. +0.5 risk/hr accrual. Auto-revoked on action block or expiry.'
        : null,
      canRequest: !account.isPaused && !account.overrideActive && (account.overrideCount || 0) < 3,
      canRequestNote: (account.overrideCount || 0) >= 3
        ? 'Maximum lifetime overrides (3) reached. Account will follow system protection only.'
        : account.isPaused
          ? 'Cannot override while account is paused by safety system.'
          : null,
    };

    // ─── Response ───

    res.json({
      account: {
        id: account.id,
        username: account.username,
        status: account.status,
        isPaused: account.isPaused,
      },
      health: {
        score: healthScore,
        grade,
        confidence: {
          level: confidenceLevel,
          note: confidenceNote,
        },
        trend,
      },
      platformFriction: {
        index: frictionIndex,
        interpretation: frictionIndex >= 80 ? 'Low friction — platform is not restricting'
          : frictionIndex >= 60 ? 'Moderate friction — some throttling detected'
          : frictionIndex >= 40 ? 'High friction — active restriction likely'
          : 'Severe friction — account may be rate-limited or blocked',
        signals: frictionSignals,
      },
      engagementQuality: {
        score: engagementScore,
        interpretation: engagementScore >= 80 ? 'Good engagement — messages are resonating'
          : engagementScore >= 50 ? 'Moderate engagement — review message content'
          : 'Low engagement — messages may not be reaching or resonating with recipients',
        signals: engagementSignals,
        note: 'Low engagement does not necessarily indicate platform enforcement. Review your message content and targeting.',
      },
      current: {
        successRate: successRate24h !== null ? `${Math.round(successRate24h * 100)}%` : 'insufficient data',
        replyRate: replyRate24h !== null ? `${Math.round(replyRate24h * 100)}%` : 'insufficient data',
        avgLatencyMs: avgLatency24h || null,
        dmsSent24h: sent24h,
        dmsFailed24h: failed24h,
        riskScore: Math.round(riskScore * 10) / 10,
      },
      trend: {
        direction: trend,
        volatility,
        recovery,
        dataPoints: snapshots.length,
        detail: trendDetail,
        snapshots: snapshots.map(s => ({
          date: s.date,
          sent: s.dmsSent,
          failed: s.dmsFailed,
          successRate: s.successRate !== null ? `${Math.round(s.successRate * 100)}%` : null,
          avgLatencyMs: s.avgLatencyMs,
          replyRate: s.replyRate !== null ? `${Math.round(s.replyRate * 100)}%` : null,
          riskScore: Math.round(s.riskScoreEnd * 10) / 10,
          volatility: {
            successRateStddev: s.successRateStddev !== null ? Math.round(s.successRateStddev * 100) / 100 : null,
            latencyStddev: s.latencyStddev !== null ? Math.round(s.latencyStddev) : null,
            volumeStddev: s.volumeStddev !== null ? Math.round(s.volumeStddev * 10) / 10 : null,
          },
        })),
      },
      signals,
      recommendations,
      override: overrideStatus,
      meta: {
        timestamp: now.toISOString(),
        philosophy: 'Protection beats performance. Silence is better than suspension.',
      },
    });
  } catch (error) {
    console.error('Account health endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/account-health/:id/override
 *
 * User requests higher throughput despite system warnings.
 * Governed:
 *   - Capped at 50% of base max (never full)
 *   - Adds 0.5 risk/hr while active (continuous cost)
 *   - Auto-expires after 24h
 *   - Auto-revoked on first action block
 *   - Maximum 3 lifetime overrides per account
 *   - Cannot override while paused
 */
router.post('/:id/override', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const account = await prisma.instagramAccount.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Guard rails
    if (account.isPaused) {
      return res.status(403).json({
        error: 'Cannot override while account is paused by safety system',
        pauseReason: account.pauseReason,
        pausedUntil: account.pausedUntil,
      });
    }

    if (account.overrideActive) {
      return res.status(409).json({
        error: 'Override already active',
        expiresAt: account.overrideExpiresAt,
      });
    }

    if ((account.overrideCount || 0) >= 3) {
      return res.status(403).json({
        error: 'Maximum lifetime overrides (3) reached. Account will follow system protection only.',
        lifetimeCount: account.overrideCount,
        philosophy: 'Protection beats performance.',
      });
    }

    // Activate override with 24h expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.instagramAccount.update({
      where: { id },
      data: {
        overrideActive: true,
        overrideRequestedAt: new Date(),
        overrideExpiresAt: expiresAt,
        overrideCount: { increment: 1 },
      },
    });

    console.log(`⚠️ OVERRIDE ACTIVATED @${account.username} — lifetime count: ${(account.overrideCount || 0) + 1}/3, expires: ${expiresAt.toISOString()}`);

    await enforcement.log(id, {
      eventType: 'override_requested',
      triggerSource: 'user_action',
      actionTaken: 'override_granted',
      errorMessage: `User override #${(account.overrideCount || 0) + 1}/3, expires ${expiresAt.toISOString()}`,
    });

    res.json({
      success: true,
      override: {
        active: true,
        expiresAt,
        lifetimeCount: (account.overrideCount || 0) + 1,
        maxLifetime: 3,
        consequences: [
          'Throughput capped at 50% of base max (not full restoration)',
          'Risk score accrues +0.5/hr while override is active',
          'Override auto-revoked after 24 hours',
          'Any action block immediately revokes override',
          `You have ${3 - (account.overrideCount || 0) - 1} override(s) remaining`,
        ],
      },
    });
  } catch (error) {
    console.error('Override endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Helpers ───

function round2(val, multiplier = 1) {
  if (val === null) return null;
  return Math.round(val * multiplier * 100) / 100;
}

module.exports = router;
