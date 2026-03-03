/**
 * Account Health Snapshot Worker
 *
 * Runs once per day (triggered from workerEntry.js).
 * Records a snapshot of each active account's key metrics for trend detection.
 *
 * These daily snapshots enable:
 * - 7-day trend analysis (gradual 10% erosion detection)
 * - Long-term behavioral baselines
 * - Reply rate tracking over time
 * - Account health scoring for the user-facing dashboard
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class HealthSnapshotWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Start the worker — runs snapshot immediately, then every 24 hours.
   * Aligned to midnight by calculating ms until next midnight.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('📊 Starting health snapshot worker...');

    // Run first snapshot after 5 seconds (let other workers initialize)
    setTimeout(() => this.takeSnapshots(), 5000);

    // Then run every 24 hours
    this.intervalId = setInterval(() => this.takeSnapshots(), 24 * 60 * 60 * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📊 Health snapshot worker stopped');
  }

  /**
   * Take a daily health snapshot for every active account.
   * Runs once per day — idempotent (upserts on [igAccountId, date]).
   */
  async takeSnapshots() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all active Instagram accounts
      const accounts = await prisma.instagramAccount.findMany({
        where: { status: { not: 'disconnected' } },
        select: { id: true, riskScore: true },
      });

      let snapshotCount = 0;

      for (const account of accounts) {
        try {
          // Gather yesterday's metrics
          const [sent, failed, dropped, expired, latencyResult, repliedCount] = await Promise.all([
            prisma.dmHistory.count({
              where: { igAccountId: account.id, status: 'sent', dmSentAt: { gte: yesterday, lt: today } },
            }),
            prisma.dmQueue.count({
              where: { igAccountId: account.id, status: { in: ['failed', 'blocked'] }, processedAt: { gte: yesterday, lt: today } },
            }),
            prisma.dmQueue.count({
              where: { igAccountId: account.id, status: 'dropped', processedAt: { gte: yesterday, lt: today } },
            }),
            prisma.dmQueue.count({
              where: { igAccountId: account.id, status: 'expired', processedAt: { gte: yesterday, lt: today } },
            }),
            prisma.dmHistory.aggregate({
              where: { igAccountId: account.id, status: 'sent', dmSentAt: { gte: yesterday, lt: today }, sendLatencyMs: { not: null } },
              _avg: { sendLatencyMs: true },
            }),
            prisma.dmHistory.count({
              where: { igAccountId: account.id, status: 'sent', dmSentAt: { gte: yesterday, lt: today }, repliedAt: { not: null } },
            }),
          ]);

          const total = sent + failed;
          const successRate = total >= 3 ? sent / total : null;
          const replyRate = sent >= 3 ? repliedCount / sent : null;
          const avgLatencyMs = latencyResult._avg.sendLatencyMs
            ? Math.round(latencyResult._avg.sendLatencyMs)
            : null;

          // Skip accounts with zero activity
          if (sent === 0 && failed === 0) continue;

          // Compute 7-day rolling volatility (stddev) from previous snapshots
          const since7d = new Date();
          since7d.setDate(since7d.getDate() - 7);
          since7d.setHours(0, 0, 0, 0);

          const prevSnapshots = await prisma.accountHealthSnapshot.findMany({
            where: { igAccountId: account.id, date: { gte: since7d, lt: yesterday } },
            select: { successRate: true, avgLatencyMs: true, dmsSent: true },
          });

          let successRateStddev = null;
          let latencyStddev = null;
          let volumeStddev = null;

          if (prevSnapshots.length >= 3) {
            // Include today's values in the stddev calculation
            const srVals = prevSnapshots.map(s => s.successRate).filter(v => v !== null);
            if (successRate !== null) srVals.push(successRate);
            if (srVals.length >= 3) successRateStddev = this.stddev(srVals);

            const latVals = prevSnapshots.map(s => s.avgLatencyMs).filter(v => v !== null);
            if (avgLatencyMs !== null) latVals.push(avgLatencyMs);
            if (latVals.length >= 3) latencyStddev = this.stddev(latVals);

            const volVals = prevSnapshots.map(s => s.dmsSent);
            volVals.push(sent);
            if (volVals.length >= 3) volumeStddev = this.stddev(volVals);
          }

          await prisma.accountHealthSnapshot.upsert({
            where: {
              igAccountId_date: { igAccountId: account.id, date: yesterday },
            },
            update: {
              dmsSent: sent,
              dmsFailed: failed,
              dmsDropped: dropped,
              dmsExpired: expired,
              successRate,
              avgLatencyMs,
              replyRate,
              riskScoreEnd: account.riskScore || 0,
              successRateStddev,
              latencyStddev,
              volumeStddev,
            },
            create: {
              igAccountId: account.id,
              date: yesterday,
              dmsSent: sent,
              dmsFailed: failed,
              dmsDropped: dropped,
              dmsExpired: expired,
              successRate,
              avgLatencyMs,
              replyRate,
              riskScoreEnd: account.riskScore || 0,
              successRateStddev,
              latencyStddev,
              volumeStddev,
            },
          });

          snapshotCount++;
        } catch (err) {
          console.error(`   ❌ Health snapshot failed for account ${account.id}:`, err.message);
        }
      }

      if (snapshotCount > 0) {
        console.log(`📊 Recorded ${snapshotCount} health snapshot(s) for yesterday`);
      }
    } catch (err) {
      console.error('❌ Health snapshot worker error:', err.message);
    }
  }

  /**
   * Calculate standard deviation of an array of numbers.
   */
  stddev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1); // Sample stddev
    return Math.round(Math.sqrt(variance) * 1000) / 1000; // 3 decimal places
  }
}

const healthSnapshotWorker = new HealthSnapshotWorker();
module.exports = healthSnapshotWorker;
