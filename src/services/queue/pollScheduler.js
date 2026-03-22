/**
 * Poll Scheduler
 *
 * Ensures every active Instagram account has a pending poll_account job.
 * Runs every 30 seconds. If an account has no pending poll job, creates one.
 *
 * Adaptive interval logic:
 * - Found comments → speed up (interval * 0.7, min 2min)
 * - No comments → slow down (3+ empty → interval * 1.5, max 30min)
 * - Add ±15% jitter to prevent heartbeat detection
 */

const prisma = require('../../config/prisma');
const queue = require('./pgQueue');

const MIN_INTERVAL = 120000;    // 2 minutes
const MAX_INTERVAL = 1800000;   // 30 minutes
const DEFAULT_INTERVAL = 300000; // 5 minutes

let schedulerTimer = null;

/**
 * Seed poll jobs for all active accounts
 */
async function seedPollJobs() {
  try {
    // Find all active accounts that have at least one active automation
    const activeAccounts = await prisma.instagramAccount.findMany({
      where: {
        useOfficialApi: true,
        isPaused: false,
        automations: { some: { isActive: true } }
      },
      select: { id: true, username: true }
    });

    for (const account of activeAccounts) {
      // Upsert poll state
      await prisma.pollState.upsert({
        where: { igAccountId: account.id },
        update: {},
        create: { igAccountId: account.id, intervalMs: DEFAULT_INTERVAL }
      });

      // Enqueue poll job (idempotent — won't create if one already pending)
      await queue.enqueue('poll_account', { igAccountId: account.id }, {
        groupKey: account.id
      });
    }

    if (activeAccounts.length > 0) {
      console.log(`📋 [Scheduler] Ensured poll jobs for ${activeAccounts.length} active accounts`);
    }
  } catch (err) {
    console.error('❌ [Scheduler] Failed to seed poll jobs:', err.message);
  }
}

/**
 * Update adaptive interval after a poll completes
 */
async function updateInterval(igAccountId, commentsFound) {
  const state = await prisma.pollState.findUnique({
    where: { igAccountId }
  });

  if (!state) return DEFAULT_INTERVAL;

  let interval = state.intervalMs;
  let consecutiveEmpty = state.consecutiveEmpty;
  let consecutiveActive = state.consecutiveActive;

  if (commentsFound > 0) {
    // Speed up — activity detected
    consecutiveActive++;
    consecutiveEmpty = 0;
    interval = Math.max(MIN_INTERVAL, Math.floor(interval * 0.7));
  } else {
    // Slow down
    consecutiveEmpty++;
    consecutiveActive = 0;
    if (consecutiveEmpty >= 3) {
      interval = Math.min(MAX_INTERVAL, Math.floor(interval * 1.5));
    } else {
      interval = Math.min(MAX_INTERVAL, Math.floor(interval * 1.1));
    }
  }

  // Add ±15% jitter
  const jitter = 0.85 + Math.random() * 0.30;
  const jitteredInterval = Math.floor(interval * jitter);

  // Clamp
  const finalInterval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, jitteredInterval));

  await prisma.pollState.update({
    where: { igAccountId },
    data: {
      intervalMs: interval, // Store base interval (without jitter) for stability
      consecutiveEmpty,
      consecutiveActive,
      lastPollAt: new Date(),
      ...(commentsFound > 0 ? { lastCommentAt: new Date() } : {})
    }
  });

  return finalInterval;
}

/**
 * Track API call budget (200 calls/user/hour)
 */
async function trackApiCalls(igAccountId, callCount) {
  const state = await prisma.pollState.findUnique({ where: { igAccountId } });
  if (!state) return true;

  const now = new Date();
  const hourReset = state.apiCallsHourReset;

  // Reset counter if hour has passed
  if (!hourReset || now > hourReset) {
    await prisma.pollState.update({
      where: { igAccountId },
      data: {
        apiCallsThisHour: callCount,
        apiCallsHourReset: new Date(now.getTime() + 3600000)
      }
    });
    return true;
  }

  const newTotal = state.apiCallsThisHour + callCount;

  // Budget: 200 calls/hour, leave 20% buffer for DM sending
  if (newTotal > 160) {
    console.warn(`⚠️ [Scheduler] API budget near limit for account ${igAccountId}: ${newTotal}/160`);
    return false;
  }

  await prisma.pollState.update({
    where: { igAccountId },
    data: { apiCallsThisHour: newTotal }
  });

  return true;
}

function start() {
  console.log('📋 [Scheduler] Started (seeding every 30s)');
  seedPollJobs(); // Run immediately
  schedulerTimer = setInterval(seedPollJobs, 30000);
}

function stop() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  console.log('📋 [Scheduler] Stopped');
}

module.exports = { start, stop, seedPollJobs, updateInterval, trackApiCalls };
