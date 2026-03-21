const axios = require('axios');
const KeywordMatcher = require('./keywordMatcher');
const officialApiService = require('./officialApiService');
const { decryptAccountTokens } = require('../../utils/encryption');

const prisma = require('../../config/prisma');

class CommentPoller {
  constructor() {
    this.isRunning = false;
    this.pollMinMs = 150 * 1000;  // 2.5 minutes
    this.pollMaxMs = 240 * 1000;  // 4 minutes
    this.timeoutId = null;
    this.lastPollTime = {};  // Track last poll per account
    this.requestCount = {};  // Track requests per account
    this.emptyResponseCount = {};  // Track consecutive empty/degraded responses per account
    this.mediaCache = {};     // Cache media list per account to save API calls
    this.mediaCacheTTL = 10 * 60 * 1000; // Cache media for 10 minutes (media doesn't change often)
    this.lastCommentFetch = {}; // Track last comment fetch time per media to use 'since' filter
  }

  /**
   * Get a jittered poll interval (2.5–4 minutes) to avoid bot heartbeat
   */
  getJitteredInterval() {
    return Math.floor(Math.random() * (this.pollMaxMs - this.pollMinMs)) + this.pollMinMs;
  }

  /**
   * Schedule the next poll with jitter
   */
  scheduleNextPoll() {
    if (!this.isRunning) return;
    const interval = this.getJitteredInterval();
    this.timeoutId = setTimeout(() => {
      this.poll();
      this.scheduleNextPoll();
    }, interval);
  }

  /**
   * Start the comment polling service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Comment poller is already running');
      return;
    }

    console.log('🚀 Starting comment poller (jittered 2.5–4 min interval)...');
    this.isRunning = true;

    // Wait 10 seconds before first poll to let things settle
    setTimeout(() => {
      this.poll();
      this.scheduleNextPoll();
    }, 10000);
  }

  /**
   * Stop the comment polling service
   */
  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isRunning = false;
    console.log('🛑 Comment poller stopped');
  }

  /**
   * Get random delay between min and max seconds
   */
  getRandomDelay(minSeconds, maxSeconds) {
    const delay = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
    return delay * 1000;
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main polling function
   */
  async poll() {
    // Global kill switch
    if (process.env.AUTOMATION_ENABLED === 'false') {
      return;
    }

    console.log(`\n📡 [${new Date().toLocaleTimeString()}] Polling for comments...`);

    try {
      // Get all active, non-paused Instagram accounts with active automations
      const accounts = await prisma.instagramAccount.findMany({
        where: {
          status: 'active',
          isPaused: false,
          automations: {
            some: { isActive: true }
          }
        },
        include: {
          automations: {
            where: { isActive: true }
          }
        }
      });

      if (accounts.length === 0) {
        console.log('   No active accounts with automations found');
        return;
      }

      console.log(`   Found ${accounts.length} active account(s)`);

      for (const account of accounts) {
        decryptAccountTokens(account);
        // Check if account was recently polled (rate limit protection)
        const lastPoll = this.lastPollTime[account.id];
        const minPollInterval = 2 * 60 * 1000; // Minimum 2 minutes between polls per account

        if (lastPoll && (Date.now() - lastPoll) < minPollInterval) {
          console.log(`   ⏳ Skipping @${account.username} - polled recently`);
          continue;
        }

        // Add random delay between accounts (5-15 seconds)
        if (accounts.indexOf(account) > 0) {
          const delay = this.getRandomDelay(5, 15);
          console.log(`   ⏱️ Waiting ${delay/1000}s before next account...`);
          await this.sleep(delay);
        }

        await this.pollAccountComments(account);
        this.lastPollTime[account.id] = Date.now();
      }
    } catch (error) {
      console.error('❌ Polling error:', error.message);
    }
  }

  /**
   * Poll comments for a specific Instagram account
   */
  async pollAccountComments(account) {
    console.log(`\n   📱 Checking @${account.username}...`);

    try {
      // Add random delay before API call (2-5 seconds)
      await this.sleep(this.getRandomDelay(2, 5));

      // Use cached media list if available (saves 1 API call per poll cycle)
      const cached = this.mediaCache[account.id];
      let media;
      if (cached && (Date.now() - cached.fetchedAt) < this.mediaCacheTTL) {
        media = cached.data;
        console.log(`      Using cached media (${media.length} items, ${Math.round((Date.now() - cached.fetchedAt) / 1000)}s old)`);
      } else {
        media = await this.getUserMedia(account);
        if (media && media.length > 0) {
          this.mediaCache[account.id] = { data: media, fetchedAt: Date.now() };
        }
      }

      if (!media || media.length === 0) {
        console.log(`      No recent media found for @${account.username}`);
        return;
      }

      console.log(`      Found ${media.length} media items`);

      // Get selected media IDs from all active automations
      const allSelectedMediaIds = new Set();
      let hasMonitorAllPosts = false;

      for (const automation of account.automations) {
        if (automation.monitorAllPosts) {
          hasMonitorAllPosts = true;
          break;
        }
        if (automation.selectedMediaIds && automation.selectedMediaIds.length > 0) {
          automation.selectedMediaIds.forEach(id => allSelectedMediaIds.add(id));
        }
      }

      // Filter posts to check
      let postsToCheck;
      const mediaIds = media.map(item => item.pk?.toString() || item.id?.toString());
      console.log(`      Media IDs from API: [${mediaIds.join(', ')}]`);
      console.log(`      Selected media IDs in DB: [${[...allSelectedMediaIds].join(', ')}]`);
      console.log(`      monitorAllPosts: ${hasMonitorAllPosts}`);

      if (hasMonitorAllPosts) {
        // Monitor all posts - check last 3
        postsToCheck = media.slice(0, 3);
        console.log(`      Monitoring ALL posts (last 3)`);
      } else if (allSelectedMediaIds.size > 0) {
        // Only check selected posts
        postsToCheck = media.filter(item => {
          const mediaId = item.pk?.toString() || item.id?.toString();
          return allSelectedMediaIds.has(mediaId);
        });
        if (postsToCheck.length === 0) {
          // ID mismatch — selected IDs don't match API IDs, fall back to all posts
          console.log(`      ⚠️ Selected IDs don't match any API media IDs — falling back to ALL posts`);
          postsToCheck = media.slice(0, 3);
        } else {
          console.log(`      Monitoring ${postsToCheck.length} selected post(s)`);
        }
      } else {
        // No selectedMediaIds and no monitorAllPosts — monitor all by default
        console.log(`      No specific posts selected — monitoring ALL posts (last 3)`);
        postsToCheck = media.slice(0, 3);
      }

      if (postsToCheck.length === 0) {
        console.log(`      No matching posts found to check`);
        return;
      }

      for (const item of postsToCheck) {
        // Add random delay between posts (3-8 seconds)
        if (postsToCheck.indexOf(item) > 0) {
          await this.sleep(this.getRandomDelay(3, 8));
        }
        await this.processMediaComments(account, item);
      }

      // Update last activity
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { lastActivityAt: new Date() }
      });

    } catch (error) {
      console.error(`      ❌ Error polling @${account.username}:`, error.message);

      // Handle different error types
      await this.handlePollingError(account, error);
    }
  }

  /**
   * Hard-pause an account via circuit breaker (uses same fields as dmQueueWorker)
   */
  async pauseAccountForPolling(account, reason, cooldownMs) {
    const pausedUntil = new Date(Date.now() + cooldownMs);
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: {
        isPaused: true,
        pauseReason: reason,
        pausedUntil,
        lastFailureAt: new Date(),
        consecutiveFailures: { increment: 1 },
      },
    });
    const hours = Math.round(cooldownMs / 3600000);
    const mins = Math.round(cooldownMs / 60000);
    const display = hours >= 1 ? `${hours}h` : `${mins}m`;
    console.log(`      🔴 @${account.username} PAUSED: "${reason}" — cooldown ${display}`);
  }

  /**
   * Handle polling errors and update account status
   */
  async handlePollingError(account, error) {
    const errorMessage = error.message || '';
    const statusCode = error.response?.status;
    const graphApiError = error.response?.data?.error; // Official Graph API error structure

    // ── Official Graph API error handling ──
    if (account.useOfficialApi && graphApiError) {
      const code = graphApiError.code;
      const subcode = graphApiError.error_subcode;

      // Token expired (code 190) — needs re-auth
      if (code === 190) {
        console.log(`      🚫 [Official API] Token expired for @${account.username} — pause 1 hour (needs re-auth)`);
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { status: 'token_expired' }
        });
        await this.pauseAccountForPolling(account, 'official_api_token_expired', 1 * 60 * 60 * 1000);
        return;
      }

      // Permissions error (code 10, 200, 803)
      if ([10, 200, 803].includes(code)) {
        console.log(`      🚫 [Official API] Permission denied for @${account.username}: ${graphApiError.message}`);
        await this.pauseAccountForPolling(account, 'official_api_permission_denied', 6 * 60 * 60 * 1000);
        return;
      }

      // Rate limited (code 4, 32, or subcode 2207051)
      if (code === 4 || code === 32 || subcode === 2207051) {
        console.log(`      ⏳ [Official API] Rate limited for @${account.username} — pause 1 hour`);
        await this.pauseAccountForPolling(account, 'official_api_rate_limited', 1 * 60 * 60 * 1000);
        return;
      }

      // Any other Graph API error — short pause, don't destroy status
      console.log(`      ⚠️ [Official API] Error for @${account.username}: code=${code} — ${graphApiError.message?.substring(0, 100)}`);
      await this.pauseAccountForPolling(account, `official_api_error_${code}`, 30 * 60 * 1000); // 30 min
      return;
    }

    // ── Web scraping error handling (existing logic) ──

    // 403: Forbidden — session invalid or detected
    if (statusCode === 403) {
      console.log(`      🚫 403 Forbidden for @${account.username} — hard pause 12 hours`);
      await this.pauseAccountForPolling(account, 'polling_403_forbidden', 12 * 60 * 60 * 1000);
      return;
    }

    // 429: Rate limited — Instagram explicitly told us to stop
    if (statusCode === 429) {
      console.log(`      🚫 429 Rate Limited for @${account.username} — hard pause 6 hours`);
      await this.pauseAccountForPolling(account, 'polling_429_rate_limited', 6 * 60 * 60 * 1000);
      return;
    }

    // 401: Unauthorized — session expired
    if (statusCode === 401) {
      console.log(`      🚫 401 Unauthorized for @${account.username} — session expired, hard pause 12 hours`);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { status: 'session_expired' }
      });
      await this.pauseAccountForPolling(account, 'polling_401_session_expired', 12 * 60 * 60 * 1000);
      return;
    }

    // Automation detection — harshest pause
    if (errorMessage.includes('automated') || errorMessage.includes('suspicious')) {
      console.log(`      🚫 Automation detected for @${account.username} — hard pause 24 hours`);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          status: 'automation_detected',
          lastActionBlockAt: new Date(),
          actionBlockCount: { increment: 1 }
        }
      });
      await this.pauseAccountForPolling(account, 'polling_automation_detected', 24 * 60 * 60 * 1000);
      return;
    }

    // Soft rate limit hints in error message
    if (errorMessage.includes('rate') || errorMessage.includes('limit')) {
      console.log(`      ⏳ Rate limit hint for @${account.username} — hard pause 6 hours`);
      await this.pauseAccountForPolling(account, 'polling_rate_hint', 6 * 60 * 60 * 1000);
      return;
    }

    // Session expiry hints
    if (errorMessage.includes('login')) {
      console.log(`      ⚠️ Session expired for @${account.username}`);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { status: 'session_expired' }
      });
      await this.pauseAccountForPolling(account, 'polling_session_expired', 12 * 60 * 60 * 1000);
      return;
    }

    // Action block
    if (errorMessage.includes('block') || statusCode === 400) {
      console.log(`      🚫 Action blocked for @${account.username} — hard pause 24 hours`);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          status: 'action_blocked',
          lastActionBlockAt: new Date(),
          actionBlockCount: { increment: 1 }
        }
      });
      await this.pauseAccountForPolling(account, 'polling_action_blocked', 24 * 60 * 60 * 1000);
      return;
    }

    // Unknown error — log but don't pause (could be network blip)
    console.log(`      ⚠️ Unknown polling error for @${account.username}: ${statusCode || 'no status'} — ${errorMessage.substring(0, 100)}`);
  }

  /**
   * Check response integrity — detect silent API degradation
   */
  validateMediaResponse(data, account) {
    // Got HTML instead of JSON
    if (typeof data === 'string') {
      if (data.includes('<!DOCTYPE') || data.includes('<html')) {
        throw new Error('Session expired - received HTML instead of JSON');
      }
      throw new Error('Unexpected string response from media endpoint');
    }

    // Response is not an object
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response shape: expected object, got ' + typeof data);
    }

    // Missing expected 'items' field — API structure may have changed
    if (!('items' in data)) {
      console.log(`      ⚠️ INTEGRITY: 'items' field missing from feed response for @${account.username}`);
      console.log(`      ⚠️ Response keys: ${Object.keys(data).join(', ')}`);
      // Track consecutive degraded responses
      this.emptyResponseCount[account.id] = (this.emptyResponseCount[account.id] || 0) + 1;
      if (this.emptyResponseCount[account.id] >= 3) {
        console.log(`      🚫 INTEGRITY: 3 consecutive degraded responses for @${account.username} — possible API change or soft block`);
        throw new Error('Response integrity failure: repeated missing items field');
      }
      return [];
    }

    // Reset degradation counter on healthy response
    this.emptyResponseCount[account.id] = 0;
    return data.items;
  }

  /**
   * Validate comment response integrity
   */
  validateCommentsResponse(data, account, mediaId) {
    if (typeof data === 'string') {
      if (data.includes('<!DOCTYPE') || data.includes('automated')) {
        throw new Error('Received HTML - possible automation detection');
      }
      throw new Error('Unexpected string response from comments endpoint');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid comments response shape: expected object');
    }

    if (!('comments' in data)) {
      console.log(`      ⚠️ INTEGRITY: 'comments' field missing for media ${mediaId} @${account.username}`);
      console.log(`      ⚠️ Response keys: ${Object.keys(data).join(', ')}`);
      return [];
    }

    return data.comments;
  }

  /**
   * Get user's recent media — routes to Official Graph API or web scraping
   */
  async getUserMedia(account) {
    if (account.useOfficialApi && account.accessToken) {
      return this.getUserMediaOfficial(account);
    }
    return this.getUserMediaScraping(account);
  }

  /**
   * Get user's recent media using Official Instagram Graph API
   */
  async getUserMediaOfficial(account) {
    const media = await officialApiService.getUserMedia(account.accessToken, account.igUserId);

    // Normalize to the same shape the rest of the poller expects
    return media.map(item => ({
      id: item.id,
      pk: item.id,
      code: item.permalink ? item.permalink.split('/').filter(Boolean).pop() : null,
      caption: { text: item.caption || '' },
      image_versions2: item.media_url ? { candidates: [{ url: item.media_url }] } : null,
      _isOfficialApi: true,
    }));
  }

  /**
   * Get user's recent media using web scraping API
   */
  async getUserMediaScraping(account) {
    const headers = this.getHeaders(account);

    const response = await axios.get(
      `https://www.instagram.com/api/v1/feed/user/${account.igUserId}/`,
      {
        headers: {
          ...headers,
          'X-IG-App-ID': '936619743392459',
        },
        params: {
          count: 12
        },
        timeout: 30000,
        validateStatus: (status) => {
          if (status !== 200) {
            console.log(`      ⚠️ Non-200 from feed endpoint: HTTP ${status} for @${account.username}`);
          }
          return status >= 200 && status < 300;
        }
      }
    );

    return this.validateMediaResponse(response.data, account);
  }

  /**
   * Process comments for a specific media item
   */
  async processMediaComments(account, media) {
    const mediaId = media.pk || media.id;
    const shortcode = media.code;

    try {
      // Get comments for this media
      const comments = await this.getMediaComments(account, mediaId);

      if (!comments || comments.length === 0) {
        return;
      }

      console.log(`      📝 Found ${comments.length} comments on ${shortcode}`);

      // Build keyword matcher from all active automations
      const allKeywords = account.automations.flatMap(a => a.keywords);
      const matcher = new KeywordMatcher(allKeywords);

      // Process each comment (with small delay between processing)
      for (const comment of comments) {
        await this.processComment(account, media, comment, matcher);
        // Tiny delay between comment processing
        await this.sleep(100);
      }
    } catch (error) {
      // Check if comments endpoint returned HTML
      if (error.message?.includes('HTML') || error.message?.includes('DOCTYPE')) {
        console.log(`      ⚠️ Comments blocked for ${shortcode} - possible automation detection`);
        throw new Error('automated behavior detected');
      }
      console.error(`      Error getting comments for ${shortcode}:`, error.message);
    }
  }

  /**
   * Get comments for a specific media — routes to Official API or web scraping
   */
  async getMediaComments(account, mediaId) {
    if (account.useOfficialApi && account.accessToken) {
      return this.getMediaCommentsOfficial(account, mediaId);
    }
    return this.getMediaCommentsScraping(account, mediaId);
  }

  /**
   * Get comments using Official Instagram Graph API
   */
  async getMediaCommentsOfficial(account, mediaId) {
    // Use 'since' to only fetch comments newer than last poll (saves API quota)
    const cacheKey = `${account.id}_${mediaId}`;
    const lastFetch = this.lastCommentFetch[cacheKey];
    const sinceTimestamp = lastFetch ? Math.floor(lastFetch / 1000) : null;

    const comments = await officialApiService.getMediaComments(account.accessToken, mediaId, sinceTimestamp);

    // Update last fetch time (use now, not comment timestamp, to avoid gaps)
    this.lastCommentFetch[cacheKey] = Date.now();

    // Normalize to the same shape the rest of the poller expects
    return comments.map(c => ({
      pk: c.id,
      id: c.id,
      text: c.text,
      user: {
        username: c.from?.username || c.username,
        pk: c.from?.id || null,
        id: c.from?.id || null,
      },
      _isOfficialApi: true,
    }));
  }

  /**
   * Get comments using web scraping API
   */
  async getMediaCommentsScraping(account, mediaId) {
    const headers = this.getHeaders(account);

    const response = await axios.get(
      `https://www.instagram.com/api/v1/media/${mediaId}/comments/`,
      {
        headers: {
          ...headers,
          'X-IG-App-ID': '936619743392459',
        },
        params: {
          can_support_threading: true,
          permalink_enabled: false
        },
        timeout: 30000,
        validateStatus: (status) => {
          if (status !== 200) {
            console.log(`      ⚠️ Non-200 from comments endpoint: HTTP ${status} for media ${mediaId}`);
          }
          return status >= 200 && status < 300;
        }
      }
    );

    return this.validateCommentsResponse(response.data, account, mediaId);
  }

  /**
   * Process a single comment
   */
  async processComment(account, media, comment, matcher) {
    const commentId = comment.pk?.toString() || comment.id;
    const commentText = comment.text;
    const commenterUsername = comment.user?.username;
    const commenterUserId = comment.user?.pk?.toString() || comment.user?.id;

    // Skip if no text or username
    if (!commentText || !commenterUsername) return;

    // Skip own comments
    if (commenterUsername === account.username) return;

    // Check for keyword match
    const matchResult = matcher.matches(commentText, { wholeWord: false });

    if (!matchResult.matched) return;

    console.log(`         🎯 Keyword "${matchResult.keyword}" matched in comment from @${commenterUsername}`);

    // Find the automation that has this keyword
    const automation = account.automations.find(a =>
      a.keywords.some(k => k.toLowerCase() === matchResult.keyword.toLowerCase())
    );

    if (!automation) return;

    // Check if we already processed this comment
    const existingTrigger = await prisma.trigger.findFirst({
      where: {
        automationId: automation.id,
        commentId: commentId
      }
    });

    if (existingTrigger) {
      // If DM was sent successfully, skip entirely
      if (existingTrigger.dmSent) {
        console.log(`         ⏭️ Already processed this comment (DM sent)`);
        return;
      }

      // DM was never sent — check if we should requeue
      const MAX_REQUEUE_ATTEMPTS = 3;

      // Check trigger-level retry count first (fastest check)
      if (existingTrigger.dmRetryCount >= MAX_REQUEUE_ATTEMPTS) {
        console.log(`         🚫 Max retries (${MAX_REQUEUE_ATTEMPTS}) on trigger for @${commenterUsername} — giving up`);
        return;
      }

      // Check if trigger was permanently failed
      if (existingTrigger.status === 'permanent_failed') {
        console.log(`         🚫 Permanent failure on trigger for @${commenterUsername} — ${existingTrigger.lastDmFailureReason?.substring(0, 60) || 'unknown'}`);
        return;
      }

      // Check if there's already a pending/processing DM in queue
      const activeDM = await prisma.dmQueue.findFirst({
        where: {
          commentId: commentId,
          status: { in: ['pending', 'processing'] }
        }
      });

      if (activeDM) {
        console.log(`         ⏭️ DM already queued for this comment (status: ${activeDM.status})`);
        return;
      }

      // Check the last failed DM to determine if failure was permanent
      const lastFailedDM = await prisma.dmQueue.findFirst({
        where: { commentId: commentId, status: 'failed' },
        orderBy: { createdAt: 'desc' }
      });

      if (lastFailedDM) {
        const isPermanent = lastFailedDM.errorMessage &&
          (lastFailedDM.errorMessage.startsWith('PERMANENT:') ||
           lastFailedDM.errorMessage.startsWith('EXPIRED:') ||
           lastFailedDM.errorMessage.includes('already replied') ||
           lastFailedDM.errorMessage.includes('Cannot reply') ||
           lastFailedDM.errorMessage.includes('does not exist') ||
           lastFailedDM.errorMessage.includes('comment has been deleted'));

        if (isPermanent) {
          // Mark trigger as permanently failed so we never check again
          await prisma.trigger.update({
            where: { id: existingTrigger.id },
            data: {
              status: 'permanent_failed',
              lastDmFailureReason: lastFailedDM.errorMessage?.substring(0, 500),
              lastDmAttemptAt: new Date()
            }
          });
          console.log(`         🚫 Permanent failure for @${commenterUsername} — marked trigger (${lastFailedDM.errorMessage?.substring(0, 80)})`);
          return;
        }
      }

      // Safe to requeue — update trigger retry count and create new DM job
      const newRetryCount = existingTrigger.dmRetryCount + 1;
      console.log(`         🔄 Requeuing DM for @${commenterUsername} (attempt ${newRetryCount}/${MAX_REQUEUE_ATTEMPTS})`);

      const mediaIdStr = media.pk?.toString() || media.id?.toString();
      const monitoredReel = await prisma.monitoredReel.findUnique({
        where: {
          igAccountId_mediaId: {
            igAccountId: account.id,
            mediaId: mediaIdStr
          }
        }
      });

      if (monitoredReel) {
        const scheduledDelay = this.getRandomDelay(60, 300); // 1-5 minutes

        // Update trigger retry tracking + create new DM job
        await prisma.trigger.update({
          where: { id: existingTrigger.id },
          data: {
            dmRetryCount: newRetryCount,
            lastDmAttemptAt: new Date(),
          }
        });

        await prisma.dmQueue.create({
          data: {
            igAccountId: account.id,
            monitoredReelId: monitoredReel.id,
            recipientIgId: commenterUserId,
            recipientUsername: commenterUsername,
            commentId: commentId,
            commentText: commentText,
            detectedKeyword: matchResult.keyword,
            messageToSend: automation.responseMessage,
            status: 'pending',
            scheduledAt: new Date(Date.now() + scheduledDelay)
          }
        });
        console.log(`         📬 DM requeued for ${Math.round(scheduledDelay/1000/60)} minutes from now`);
      }
      return;
    }

    // Check if this user already has ANY trigger for THIS automation (prevent spam per-automation)
    // Different automations should still trigger DMs to the same user
    const existingUserTrigger = await prisma.trigger.findFirst({
      where: {
        automationId: automation.id,
        commenterUsername: commenterUsername
      }
    });

    if (existingUserTrigger) {
      console.log(`         ⏭️ Already triggered for @${commenterUsername} in automation "${automation.name}" (status: ${existingUserTrigger.status})`);
      return;
    }

    // Create a trigger record
    await prisma.trigger.create({
      data: {
        automationId: automation.id,
        commenterIgId: commenterUserId,
        commenterUsername: commenterUsername,
        commentId: commentId,
        commentText: commentText,
        matchedKeyword: matchResult.keyword,
        status: 'pending'
      }
    });

    console.log(`         ✅ Created trigger for @${commenterUsername}`);

    // First, ensure the monitored reel exists
    const mediaIdStr = media.pk?.toString() || media.id?.toString();

    await prisma.monitoredReel.upsert({
      where: {
        igAccountId_mediaId: {
          igAccountId: account.id,
          mediaId: mediaIdStr
        }
      },
      update: {
        lastCheckedAt: new Date()
      },
      create: {
        igAccountId: account.id,
        mediaId: mediaIdStr,
        mediaUrl: media.image_versions2?.candidates?.[0]?.url || null,
        caption: media.caption?.text?.substring(0, 500) || null
      }
    });

    // Get the monitored reel ID
    const monitoredReel = await prisma.monitoredReel.findUnique({
      where: {
        igAccountId_mediaId: {
          igAccountId: account.id,
          mediaId: mediaIdStr
        }
      }
    });

    // Add to DM queue with a scheduled delay (random 3-10 minutes for safety)
    const scheduledDelay = this.getRandomDelay(180, 600); // 3-10 minutes (safer)
    const scheduledAt = new Date(Date.now() + scheduledDelay);

    await prisma.dmQueue.create({
      data: {
        igAccountId: account.id,
        monitoredReelId: monitoredReel.id,
        recipientIgId: commenterUserId,
        recipientUsername: commenterUsername,
        commentId: commentId,
        commentText: commentText,
        detectedKeyword: matchResult.keyword,
        messageToSend: automation.responseMessage,
        status: 'pending',
        scheduledAt: scheduledAt
      }
    });

    console.log(`         📬 DM scheduled for ${Math.round(scheduledDelay/1000/60)} minutes from now`);

    // Update automation stats
    await prisma.automation.update({
      where: { id: automation.id },
      data: { triggerCount: { increment: 1 } }
    });

    // Update daily analytics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyAnalytics.upsert({
      where: {
        igAccountId_date: {
          igAccountId: account.id,
          date: today
        }
      },
      update: {
        commentsDetected: { increment: 1 },
        dmsQueued: { increment: 1 }
      },
      create: {
        igAccountId: account.id,
        date: today,
        commentsDetected: 1,
        dmsQueued: 1
      }
    });
  }

  /**
   * Get headers for Instagram API requests
   */
  getHeaders(account) {
    return {
      'User-Agent': account.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': account.sessionCookies,
      'X-CSRFToken': account.csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };
  }
}

// Export singleton instance
const commentPoller = new CommentPoller();
module.exports = commentPoller;
