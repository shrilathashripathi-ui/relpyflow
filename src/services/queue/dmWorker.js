/**
 * DM Worker
 *
 * Processes "send_dm" jobs from the queue.
 * Sends the opening DM via Instagram API with rate limiting per account.
 * Updates trigger status and creates DM history records.
 *
 * Rate Limits:
 * - Per-account: respects RateLimitConfig (default 20/hr, 100/day)
 * - Global: max 3 DMs processed per tick (15s interval)
 * - Exponential backoff on failure
 */

const prisma = require('../../config/prisma');
const queue = require('./pgQueue');
const officialApi = require('../instagram/officialApiService');
const { decryptAccountTokens, decrypt } = require('../../utils/encryption');

let workerTimer = null;

/**
 * Check rate limits for an account using DB-based counting (survives restarts)
 */
async function canSendDM(igAccountId) {
  // Get configured limits
  const config = await prisma.rateLimitConfig.findUnique({
    where: { igAccountId }
  });
  const maxPerHour = config?.maxDmsPerHour || 20;
  const maxPerDay = config?.maxDmsPerDay || 100;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const oneDayAgo = new Date(now.getTime() - 86400000);

  // Count DMs sent in last hour from DmHistory (persistent, survives restarts)
  const [hourlyCount, dailyCount] = await Promise.all([
    prisma.dmHistory.count({
      where: {
        igAccountId,
        status: 'sent',
        dmSentAt: { gte: oneHourAgo }
      }
    }),
    prisma.dmHistory.count({
      where: {
        igAccountId,
        status: 'sent',
        dmSentAt: { gte: oneDayAgo }
      }
    })
  ]);

  if (hourlyCount >= maxPerHour) {
    return { allowed: false, reason: `Hourly limit reached (${hourlyCount}/${maxPerHour}/hr)` };
  }
  if (dailyCount >= maxPerDay) {
    return { allowed: false, reason: `Daily limit reached (${dailyCount}/${maxPerDay}/day)` };
  }

  return { allowed: true };
}

/**
 * Process a single send_dm job
 */
async function processJob(job) {
  const {
    igAccountId, triggerId, automationId,
    recipientIgId, recipientUsername,
    commentId, commentText, matchedKeyword
  } = job.payload;

  try {
    // Check rate limits
    const rateCheck = await canSendDM(igAccountId);
    if (!rateCheck.allowed) {
      console.log(`⏳ [DmWorker] Rate limited for account ${igAccountId}: ${rateCheck.reason}`);
      // Reschedule for later (5 minutes)
      await queue.fail(job.id, rateCheck.reason, 10); // High max to keep retrying
      return;
    }

    // Get account
    const account = await prisma.instagramAccount.findUnique({
      where: { id: igAccountId }
    });
    if (!account || account.isPaused) {
      await queue.complete(job.id);
      return;
    }

    // Decrypt token
    let accessToken;
    try {
      accessToken = decrypt(account.accessToken);
    } catch (decryptErr) {
      // If decryption fails, token might be stored unencrypted (legacy)
      console.warn(`⚠️ [DmWorker] Token decrypt failed for account ${igAccountId}, using raw token`);
      accessToken = account.accessToken;
    }

    // Get automation for message content
    const automation = await prisma.automation.findUnique({
      where: { id: automationId }
    });
    if (!automation) {
      await queue.complete(job.id);
      return;
    }

    // === IDEMPOTENCY: Check if DM already sent for this trigger ===
    // Use atomic updateMany with condition to prevent race between concurrent workers
    const lockResult = await prisma.trigger.updateMany({
      where: { id: triggerId, dmSent: false },
      data: { status: 'processing' }
    });
    if (lockResult.count === 0) {
      // Either trigger doesn't exist or DM already sent
      await queue.complete(job.id);
      return;
    }

    // Send the DM
    const startTime = Date.now();
    const message = automation.responseMessage || 'Hey there! Thanks so much for your interest 😊\n\nI\'ve got something special for you!';

    // Try sending as private reply (attached to comment) first, then direct DM
    let sent = false;
    try {
      if (commentId) {
        await officialApi.sendDM(accessToken, account.igUserId, recipientIgId, message, commentId);
      } else {
        await officialApi.sendDM(accessToken, account.igUserId, recipientIgId, message);
      }
      sent = true;
    } catch (err) {
      // If private reply fails, try direct DM
      if (commentId && !sent) {
        try {
          await officialApi.sendDM(accessToken, account.igUserId, recipientIgId, message);
          sent = true;
        } catch (directErr) {
          throw directErr; // Let outer catch handle it
        }
      } else {
        throw err;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Send opening button as quick reply if configured
    if (sent && automation.openingButton) {
      try {
        await officialApi.sendQuickReply(
          accessToken, account.igUserId, recipientIgId,
          'Tap below to get started 👇',
          [{ title: automation.openingButton, payload: 'opening_button' }]
        );
      } catch (e) {
        console.warn(`⚠️ [DmWorker] Quick reply failed for @${recipientUsername}:`, e.message);
      }
    }

    // Update trigger
    await prisma.trigger.update({
      where: { id: triggerId },
      data: {
        dmSent: true,
        status: 'dm_sent',
        conversationStep: automation.openingButton ? 'waiting_button' : 'completed',
        lastDmAttemptAt: new Date()
      }
    });

    // Create DM history record
    await prisma.dmHistory.create({
      data: {
        igAccountId,
        recipientIgId,
        recipientUsername,
        messageSent: message,
        commentId,
        status: 'sent',
        sendLatencyMs: latencyMs,
        dmSentAt: new Date()
      }
    });

    // Update automation stats
    await prisma.automation.update({
      where: { id: automationId },
      data: { dmsSentCount: { increment: 1 } }
    });

    console.log(`✅ [DmWorker] DM sent to @${recipientUsername} (${latencyMs}ms)`);
    await queue.complete(job.id);

  } catch (err) {
    console.error(`❌ [DmWorker] Failed to DM @${recipientUsername}:`, err.message);

    // Update trigger with failure
    if (triggerId) {
      await prisma.trigger.update({
        where: { id: triggerId },
        data: {
          lastDmAttemptAt: new Date(),
          lastDmFailureReason: err.message?.substring(0, 500),
          dmRetryCount: { increment: 1 }
        }
      }).catch(() => {});
    }

    // Determine if error is permanent
    const isPermanent = err.message?.includes('does not exist') ||
                        err.message?.includes('Cannot reply') ||
                        err.message?.includes('has been deleted') ||
                        err.response?.status === 400;

    if (isPermanent) {
      // Don't retry permanent errors
      if (triggerId) {
        await prisma.trigger.update({
          where: { id: triggerId },
          data: { status: 'permanent_failed' }
        }).catch(() => {});
      }
      await queue.complete(job.id);
    } else {
      await queue.fail(job.id, err.message, job.maxAttempts || 3);
    }
  }
}

/**
 * Worker loop — dequeues and processes send_dm jobs (max 3 per tick)
 */
async function processLoop() {
  try {
    for (let i = 0; i < 3; i++) {
      const job = await queue.dequeueOne('send_dm');
      if (!job) break;
      await processJob(job);

      // Small delay between DMs
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error('❌ [DmWorker] Loop error:', err.message);
  }
}

function start() {
  console.log('📬 [DmWorker] Started (checking every 15s, max 3 per tick)');
  workerTimer = setInterval(processLoop, 15000);
  setTimeout(processLoop, 8000); // First check after 8s
}

function stop() {
  if (workerTimer) clearInterval(workerTimer);
  console.log('📬 [DmWorker] Stopped');
}

module.exports = { start, stop, processJob };
