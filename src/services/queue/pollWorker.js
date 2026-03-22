/**
 * Poll Worker
 *
 * Processes "poll_account" jobs from the queue.
 * Fetches comments for an account's active automations, matches keywords,
 * creates triggers, and enqueues "send_dm" jobs.
 *
 * After processing, schedules the next poll using adaptive interval.
 */

const prisma = require('../../config/prisma');
const queue = require('./pgQueue');
const scheduler = require('./pollScheduler');
const KeywordMatcher = require('../instagram/keywordMatcher');
const officialApi = require('../instagram/officialApiService');
const { decryptAccountTokens } = require('../../utils/encryption');

let workerTimer = null;

// In-memory caches (per-process, fine for single instance)
const mediaCache = {};       // { accountId: { data, fetchedAt } }
const MEDIA_CACHE_TTL = 600000; // 10 minutes
const lastCommentFetch = {};  // { mediaId: unixTimestamp }

/**
 * Process a single poll_account job
 */
async function processJob(job) {
  const { igAccountId } = job.payload;
  let commentsFound = 0;

  try {
    const account = await prisma.instagramAccount.findUnique({
      where: { id: igAccountId },
      include: {
        automations: {
          where: { isActive: true },
          include: { keywords: true }
        }
      }
    });

    if (!account || account.isPaused || account.automations.length === 0) {
      await queue.complete(job.id);
      return;
    }

    decryptAccountTokens(account);

    // Check API budget
    const hasbudget = await scheduler.trackApiCalls(igAccountId, 1);
    if (!hasbudget) {
      console.log(`⏳ [PollWorker] @${account.username} — API budget exhausted, skipping`);
      await queue.complete(job.id);
      await scheduleNext(igAccountId, 0);
      return;
    }

    // Fetch media (cached)
    const media = await getAccountMedia(account);
    if (!media || media.length === 0) {
      await queue.complete(job.id);
      await scheduleNext(igAccountId, 0);
      return;
    }

    // Track API calls (1 for media + 1 per media for comments)
    await scheduler.trackApiCalls(igAccountId, media.length);

    // Process each media's comments against all automations
    for (const mediaItem of media) {
      const found = await processMediaComments(account, mediaItem);
      commentsFound += found;
    }

    console.log(`📡 [PollWorker] @${account.username} — ${commentsFound} new comment(s) matched`);

    await queue.complete(job.id);
    await scheduleNext(igAccountId, commentsFound);

  } catch (err) {
    console.error(`❌ [PollWorker] Error polling ${igAccountId}:`, err.message);

    // Handle Instagram API errors
    if (err.message?.includes('access_token') || err.response?.status === 401) {
      await pauseAccount(igAccountId, 'Access token expired', 3600000);
      await queue.complete(job.id); // Don't retry auth errors
    } else if (err.response?.status === 429) {
      await queue.fail(job.id, 'Rate limited', job.maxAttempts);
    } else {
      await queue.fail(job.id, err.message, job.maxAttempts);
    }

    await scheduleNext(igAccountId, 0);
  }
}

/**
 * Schedule the next poll for this account
 */
async function scheduleNext(igAccountId, commentsFound) {
  const nextInterval = await scheduler.updateInterval(igAccountId, commentsFound);

  await queue.enqueue('poll_account', { igAccountId }, {
    groupKey: igAccountId,
    runAt: new Date(Date.now() + nextInterval)
  });
}

/**
 * Get media for account (cached for 10 minutes)
 */
async function getAccountMedia(account) {
  const cached = mediaCache[account.id];
  if (cached && Date.now() - cached.fetchedAt < MEDIA_CACHE_TTL) {
    return cached.data;
  }

  // Evict stale entries to prevent memory growth
  for (const key in mediaCache) {
    if (Date.now() - mediaCache[key].fetchedAt > MEDIA_CACHE_TTL * 2) {
      delete mediaCache[key];
    }
  }
  for (const key in lastCommentFetch) {
    if (Date.now() / 1000 - lastCommentFetch[key] > 3600) { // 1 hour
      delete lastCommentFetch[key];
    }
  }

  try {
    const media = await officialApi.getUserMedia(account.accessToken, account.igUserId);
    mediaCache[account.id] = { data: media, fetchedAt: Date.now() };
    return media;
  } catch (err) {
    console.error(`❌ [PollWorker] Failed to get media for @${account.username}:`, err.message);
    return [];
  }
}

/**
 * Fetch comments for a media item and match against all automations
 */
async function processMediaComments(account, mediaItem) {
  const mediaId = mediaItem.id;
  let commentsFound = 0;

  // Use 'since' to only fetch new comments
  const since = lastCommentFetch[mediaId] || null;

  let comments;
  try {
    comments = await officialApi.getMediaComments(account.accessToken, mediaId, since);
  } catch (err) {
    console.error(`❌ [PollWorker] Failed to get comments for media ${mediaId}:`, err.message);
    return 0;
  }

  if (!comments || comments.length === 0) return 0;

  // Update the 'since' timestamp for next poll
  lastCommentFetch[mediaId] = Math.floor(Date.now() / 1000);

  // Filter automations that monitor this media
  const automations = account.automations.filter(a => {
    if (a.monitorAllPosts) return true;
    const selectedIds = a.selectedMediaIds || [];
    return selectedIds.includes(mediaId) || selectedIds.includes(mediaItem.permalink);
  });

  if (automations.length === 0) return 0;

  for (const comment of comments) {
    const commentId = comment.id;
    const commentText = comment.text;
    const commenterUsername = comment.username;
    const commenterUserId = comment.from?.id;

    if (!commentText || !commenterUsername) continue;

    // Skip comments from the account owner
    if (commenterUsername === account.username) continue;

    for (const automation of automations) {
      const matcher = new KeywordMatcher(automation.keywords?.map(k => k.keyword) || automation.keywords || []);
      const match = matcher.match(commentText);

      if (!match) continue;

      // === IDEMPOTENCY: Triple-layer dedup ===

      // Layer 1: Same comment + same automation
      const existingTrigger = await prisma.trigger.findFirst({
        where: { automationId: automation.id, commentId }
      });
      if (existingTrigger) continue;

      // Layer 2: Same user + same automation (different comment)
      const userDedupWhere = { automationId: automation.id };
      if (commenterUserId) {
        userDedupWhere.OR = [
          { commenterIgId: commenterUserId },
          { commenterUsername: commenterUsername }
        ];
      } else {
        userDedupWhere.commenterUsername = commenterUsername;
      }
      const existingUserTrigger = await prisma.trigger.findFirst({
        where: userDedupWhere
      });
      if (existingUserTrigger) continue;

      // Layer 3: Already queued DM for this user + account (check job_queue)
      const existingDm = await prisma.jobQueue.findFirst({
        where: {
          jobType: 'send_dm',
          groupKey: account.id,
          status: { in: ['pending', 'processing'] },
          payload: { path: ['recipientUsername'], equals: commenterUsername }
        }
      });
      if (existingDm) continue;

      // === CREATE TRIGGER ===
      const trigger = await prisma.trigger.create({
        data: {
          automationId: automation.id,
          commenterIgId: commenterUserId || commenterUsername,
          commenterUsername,
          commentId,
          commentText,
          matchedKeyword: match.keyword,
          status: 'pending'
        }
      });

      commentsFound++;
      console.log(`   🎯 @${commenterUsername} matched "${match.keyword}" in automation "${automation.name}"`);

      // === ENQUEUE DM JOB ===
      const delay = 10000 + Math.floor(Math.random() * 30000); // 10-40s
      await queue.enqueue('send_dm', {
        igAccountId: account.id,
        triggerId: trigger.id,
        automationId: automation.id,
        recipientIgId: commenterUserId || commenterUsername,
        recipientUsername: commenterUsername,
        commentId,
        commentText,
        matchedKeyword: match.keyword
      }, {
        groupKey: `dm:${trigger.id}`,
        runAt: new Date(Date.now() + delay)
      });

      // Update automation stats
      await prisma.automation.update({
        where: { id: automation.id },
        data: { triggerCount: { increment: 1 } }
      });
    }
  }

  return commentsFound;
}

/**
 * Pause account on error
 */
async function pauseAccount(igAccountId, reason, cooldownMs) {
  await prisma.instagramAccount.update({
    where: { id: igAccountId },
    data: {
      isPaused: true,
      pauseReason: reason,
      pausedUntil: new Date(Date.now() + cooldownMs)
    }
  });
  console.log(`⏸️ [PollWorker] Account ${igAccountId} paused: ${reason}`);
}

/**
 * Worker loop — dequeues and processes poll_account jobs
 */
async function processLoop() {
  try {
    const job = await queue.dequeueOne('poll_account');
    if (job) await processJob(job);
  } catch (err) {
    console.error('❌ [PollWorker] Loop error:', err.message);
  }
}

function start() {
  console.log('📡 [PollWorker] Started (checking every 10s)');
  workerTimer = setInterval(processLoop, 10000); // Check for jobs every 10s
  setTimeout(processLoop, 5000); // First check after 5s
}

function stop() {
  if (workerTimer) clearInterval(workerTimer);
  console.log('📡 [PollWorker] Stopped');
}

module.exports = { start, stop, processJob };
