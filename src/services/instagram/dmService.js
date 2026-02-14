const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class InstagramDMService {
  constructor(account) {
    this.account = account;
    this.sessionCookies = account.sessionCookies;
    this.csrfToken = account.csrfToken;
    this.userAgent = account.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  getHeaders() {
    return {
      'User-Agent': this.userAgent,
      'Cookie': this.sessionCookies,
      'X-CSRFToken': this.csrfToken,
      'X-Instagram-AJAX': '1',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.instagram.com',
      'Referer': 'https://www.instagram.com/direct/inbox/',
    };
  }

  /**
   * Get user ID from username
   */
  async getUserId(username) {
    try {
      const response = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        headers: {
          ...this.getHeaders(),
          'X-IG-App-ID': '936619743392459',
        }
      });

      const userId = response.data?.data?.user?.id;
      if (!userId) {
        throw new Error(`Could not find user ID for @${username}`);
      }

      return userId;
    } catch (error) {
      console.error(`Failed to get user ID for @${username}:`, error.message);
      throw error;
    }
  }

  /**
   * Create or get existing direct message thread
   */
  async getOrCreateThread(recipientUserId) {
    try {
      const response = await axios.post(
        'https://www.instagram.com/api/v1/direct_v2/create_group_thread/',
        `recipient_users=[${recipientUserId}]`,
        { headers: this.getHeaders() }
      );

      return response.data?.thread_id;
    } catch (error) {
      // If thread already exists, try to get it differently
      console.error('Create thread error:', error.message);
      throw error;
    }
  }

  /**
   * Send a direct message to a user
   */
  async sendDM(recipientUsername, message) {
    console.log(`📤 Sending DM to @${recipientUsername}...`);

    try {
      // Step 1: Get recipient's user ID
      const recipientUserId = await this.getUserId(recipientUsername);
      console.log(`   User ID: ${recipientUserId}`);

      // Step 2: Send the message using the web API
      const response = await axios.post(
        'https://www.instagram.com/api/v1/direct_v2/threads/broadcast/text/',
        new URLSearchParams({
          'action': 'send_item',
          'recipient_users': `[[${recipientUserId}]]`,
          'client_context': this.generateClientContext(),
          'text': message,
        }).toString(),
        { headers: this.getHeaders() }
      );

      if (response.data?.status === 'ok') {
        console.log(`✅ DM sent successfully to @${recipientUsername}`);
        return {
          success: true,
          threadId: response.data?.payload?.thread_id,
          itemId: response.data?.payload?.item_id,
        };
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      console.error(`❌ Failed to send DM to @${recipientUsername}:`, error.message);

      // Check for specific error types
      if (error.response?.status === 400) {
        const errorData = error.response?.data;

        // Check for action block
        if (errorData?.spam || errorData?.message?.includes('block')) {
          await this.handleActionBlock();
          throw new Error('ACTION_BLOCKED: Instagram has temporarily blocked DM sending');
        }

        // Check for rate limit
        if (errorData?.message?.includes('rate') || errorData?.message?.includes('limit')) {
          throw new Error('RATE_LIMITED: Too many DMs sent, please wait');
        }
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('SESSION_EXPIRED: Instagram session has expired, please reconnect');
      }

      throw error;
    }
  }

  /**
   * Generate a unique client context for the message
   */
  generateClientContext() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000000);
    return `${timestamp}${random}`;
  }

  /**
   * Handle action block
   */
  async handleActionBlock() {
    try {
      await prisma.instagramAccount.update({
        where: { id: this.account.id },
        data: {
          lastActionBlockAt: new Date(),
          actionBlockCount: { increment: 1 },
          status: 'action_blocked',
        },
      });

      // Update daily analytics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.dailyAnalytics.upsert({
        where: {
          igAccountId_date: {
            igAccountId: this.account.id,
            date: today,
          },
        },
        update: {
          actionBlocks: { increment: 1 },
        },
        create: {
          igAccountId: this.account.id,
          date: today,
          actionBlocks: 1,
        },
      });
    } catch (error) {
      console.error('Failed to update action block status:', error.message);
    }
  }

  /**
   * Check if account can send DMs (rate limiting)
   */
  async canSendDM() {
    try {
      // Get rate limit config
      const rateLimitConfig = await prisma.rateLimitConfig.findUnique({
        where: { igAccountId: this.account.id },
      });

      const maxPerHour = rateLimitConfig?.maxDmsPerHour || 10;
      const maxPerDay = rateLimitConfig?.maxDmsPerDay || 50;

      // Count DMs sent in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const dmsLastHour = await prisma.dmHistory.count({
        where: {
          igAccountId: this.account.id,
          dmSentAt: { gte: oneHourAgo },
          status: 'sent',
        },
      });

      if (dmsLastHour >= maxPerHour) {
        return { canSend: false, reason: 'HOURLY_LIMIT_REACHED', waitTime: 60 - new Date().getMinutes() };
      }

      // Count DMs sent today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dmsToday = await prisma.dmHistory.count({
        where: {
          igAccountId: this.account.id,
          dmSentAt: { gte: today },
          status: 'sent',
        },
      });

      if (dmsToday >= maxPerDay) {
        return { canSend: false, reason: 'DAILY_LIMIT_REACHED', waitTime: 24 * 60 };
      }

      // Check if account is action blocked
      if (this.account.status === 'action_blocked') {
        const blockTime = this.account.lastActionBlockAt;
        const cooldownHours = Math.min(24, this.account.actionBlockCount * 4); // Exponential cooldown
        const cooldownEnd = new Date(blockTime.getTime() + cooldownHours * 60 * 60 * 1000);

        if (new Date() < cooldownEnd) {
          return {
            canSend: false,
            reason: 'ACTION_BLOCKED',
            waitTime: Math.ceil((cooldownEnd - new Date()) / (60 * 1000))
          };
        }
      }

      return { canSend: true };
    } catch (error) {
      console.error('Error checking rate limits:', error.message);
      return { canSend: true }; // Default to allowing if check fails
    }
  }

  /**
   * Get random delay between DMs (for more human-like behavior)
   */
  async getRandomDelay() {
    const rateLimitConfig = await prisma.rateLimitConfig.findUnique({
      where: { igAccountId: this.account.id },
    });

    const minDelay = rateLimitConfig?.minDelaySeconds || 30;
    const maxDelay = rateLimitConfig?.maxDelaySeconds || 120;

    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  }
}

module.exports = InstagramDMService;
