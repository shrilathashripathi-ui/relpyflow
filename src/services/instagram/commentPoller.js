const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const KeywordMatcher = require('./keywordMatcher');

const prisma = new PrismaClient();

class CommentPoller {
  constructor() {
    this.isRunning = false;
    this.pollInterval = 3 * 60 * 1000; // 3 minutes (safer than 30 seconds)
    this.intervalId = null;
    this.lastPollTime = {};  // Track last poll per account
    this.requestCount = {};  // Track requests per account
  }

  /**
   * Start the comment polling service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Comment poller is already running');
      return;
    }

    console.log('🚀 Starting comment poller (polling every 3 minutes)...');
    this.isRunning = true;

    // Wait 10 seconds before first poll to let things settle
    setTimeout(() => {
      this.poll();
      // Then poll at intervals
      this.intervalId = setInterval(() => this.poll(), this.pollInterval);
    }, 10000);
  }

  /**
   * Stop the comment polling service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
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
    console.log(`\n📡 [${new Date().toLocaleTimeString()}] Polling for comments...`);

    try {
      // Get all active Instagram accounts with active automations
      const accounts = await prisma.instagramAccount.findMany({
        where: {
          status: 'active',
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

      // Get user's recent media (posts/reels)
      const media = await this.getUserMedia(account);

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
        console.log(`      Monitoring ${postsToCheck.length} selected post(s)`);
      } else {
        console.log(`      No posts selected for monitoring`);
        return;
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
   * Handle polling errors and update account status
   */
  async handlePollingError(account, error) {
    const errorMessage = error.message || '';
    const statusCode = error.response?.status;

    // Check for automation detection
    if (errorMessage.includes('automated') || errorMessage.includes('suspicious')) {
      console.log(`      🚫 Automation detected for @${account.username} - pausing account`);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          status: 'automation_detected',
          lastActionBlockAt: new Date(),
          actionBlockCount: { increment: 1 }
        }
      });
      return;
    }

    // Check for session expiry
    if (errorMessage.includes('login') || statusCode === 401 || statusCode === 403) {
      console.log(`      ⚠️ Session expired for @${account.username}`);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { status: 'session_expired' }
      });
      return;
    }

    // Check for rate limiting
    if (statusCode === 429 || errorMessage.includes('rate') || errorMessage.includes('limit')) {
      console.log(`      ⏳ Rate limited for @${account.username} - waiting...`);
      // Don't disable, just skip this poll cycle
      return;
    }

    // Check for action block
    if (errorMessage.includes('block') || statusCode === 400) {
      console.log(`      🚫 Action blocked for @${account.username}`);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          status: 'action_blocked',
          lastActionBlockAt: new Date(),
          actionBlockCount: { increment: 1 }
        }
      });
    }
  }

  /**
   * Get user's recent media using web API
   */
  async getUserMedia(account) {
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
        timeout: 30000
      }
    );

    // Check if we got HTML instead of JSON (session issue)
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
      throw new Error('Session expired - received HTML instead of JSON');
    }

    return response.data?.items || [];
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
   * Get comments for a specific media
   */
  async getMediaComments(account, mediaId) {
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
        timeout: 30000
      }
    );

    // Check if we got HTML instead of JSON
    if (typeof response.data === 'string') {
      if (response.data.includes('<!DOCTYPE') || response.data.includes('automated')) {
        throw new Error('Received HTML - possible automation detection');
      }
    }

    return response.data?.comments || [];
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
      console.log(`         ⏭️ Already processed this comment`);
      return;
    }

    // Check if we already sent a DM to this user recently (prevent spam)
    const recentDM = await prisma.dmHistory.findFirst({
      where: {
        igAccountId: account.id,
        recipientUsername: commenterUsername,
        dmSentAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    if (recentDM) {
      console.log(`         ⏭️ Already sent DM to @${commenterUsername} in last 24h`);
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
