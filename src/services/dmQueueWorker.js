const { PrismaClient } = require('@prisma/client');
const PuppeteerDMService = require('./instagram/puppeteerDmService');
const officialApi = require('./instagram/officialApiService');

const prisma = new PrismaClient();

class DMQueueWorker {
  constructor() {
    this.isRunning = false;
    this.processInterval = 60000; // Check queue every 60 seconds (safer)
    this.intervalId = null;
    this.isProcessing = false; // Prevent concurrent processing

    // Safety limits
    this.MAX_DMS_PER_HOUR = 8; // Very conservative
    this.MAX_DMS_PER_DAY = 50; // Daily limit
    this.MIN_DELAY_SECONDS = 120; // 2 minutes minimum between DMs
    this.MAX_DELAY_SECONDS = 300; // 5 minutes maximum

    // Track DMs sent per account per hour
    this.dmsSentThisHour = {};
    this.lastHourReset = Date.now();
  }

  /**
   * Start the DM queue worker
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ DM queue worker is already running');
      return;
    }

    console.log('🚀 Starting DM queue worker...');
    this.isRunning = true;

    // Process immediately on start
    this.processQueue();

    // Then process at intervals
    this.intervalId = setInterval(() => this.processQueue(), this.processInterval);
  }

  /**
   * Stop the DM queue worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 DM queue worker stopped');
  }

  /**
   * Process pending DMs in the queue
   */
  async processQueue() {
    // Prevent concurrent processing (Puppeteer is resource intensive)
    if (this.isProcessing) {
      console.log('   ⏳ Still processing previous batch, skipping...');
      return;
    }

    try {
      this.isProcessing = true;

      // Get pending DMs grouped by account
      const pendingDMs = await prisma.dmQueue.findMany({
        where: {
          status: 'pending',
          scheduledAt: { lte: new Date() }
        },
        include: {
          igAccount: true
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' }
        ],
        take: 5 // Process max 5 DMs per cycle (Puppeteer is slower)
      });

      if (pendingDMs.length === 0) {
        return; // No pending DMs
      }

      console.log(`\n📬 [${new Date().toLocaleTimeString()}] Processing ${pendingDMs.length} pending DM(s) with Puppeteer...`);

      // Group by account to respect rate limits
      const dmsByAccount = this.groupByAccount(pendingDMs);

      for (const [accountId, dms] of Object.entries(dmsByAccount)) {
        await this.processAccountDMs(dms);
      }
    } catch (error) {
      console.error('❌ DM queue processing error:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Group DMs by Instagram account
   */
  groupByAccount(dms) {
    return dms.reduce((acc, dm) => {
      if (!acc[dm.igAccountId]) {
        acc[dm.igAccountId] = [];
      }
      acc[dm.igAccountId].push(dm);
      return acc;
    }, {});
  }

  /**
   * Process DMs for a specific account
   * Uses Official API if available, falls back to Puppeteer
   */
  async processAccountDMs(dms) {
    if (dms.length === 0) return;

    const account = dms[0].igAccount;

    // Use Official Instagram API if account has it enabled
    if (account.useOfficialApi && account.accessToken) {
      console.log(`   🔗 @${account.username}: Using Official Instagram API for DMs`);
      await this.processAccountDMsOfficial(dms, account);
      return;
    }

    // Fallback to Puppeteer
    console.log(`   🤖 @${account.username}: Using Puppeteer for DMs (no official API)`);
    await this.processAccountDMsPuppeteer(dms, account);
  }

  /**
   * Process DMs using the Official Instagram Messaging API
   */
  async processAccountDMsOfficial(dms, account) {
    // Check hourly rate limit
    this.resetHourlyCounterIfNeeded();
    const sentThisHour = this.dmsSentThisHour[account.id] || 0;

    if (sentThisHour >= this.MAX_DMS_PER_HOUR) {
      console.log(`   ⚠️ @${account.username}: Hourly limit reached (${sentThisHour}/${this.MAX_DMS_PER_HOUR})`);
      return;
    }

    const dailyCount = await this.getDailyDMCount(account.id);
    if (dailyCount >= this.MAX_DMS_PER_DAY) {
      console.log(`   ⚠️ @${account.username}: Daily limit reached (${dailyCount}/${this.MAX_DMS_PER_DAY})`);
      return;
    }

    for (const dm of dms) {
      if ((this.dmsSentThisHour[account.id] || 0) >= this.MAX_DMS_PER_HOUR) break;

      try {
        // Mark as processing
        await prisma.dmQueue.update({
          where: { id: dm.id },
          data: { status: 'processing', processedAt: new Date() }
        });

        // Send via Official API
        const result = await officialApi.sendDM(
          account.accessToken,
          account.igUserId,
          dm.recipientIgId,
          dm.messageToSend
        );

        if (result.success) {
          // Mark as sent
          await prisma.dmQueue.update({
            where: { id: dm.id },
            data: { status: 'sent', sentAt: new Date() }
          });

          // Update trigger status
          if (dm.commentId) {
            await prisma.trigger.updateMany({
              where: { commentId: dm.commentId },
              data: { dmSent: true, dmSentAt: new Date(), status: 'dm_sent' }
            });
          }

          // Add to DM history
          await prisma.dmHistory.create({
            data: {
              igAccountId: dm.igAccountId,
              monitoredReelId: dm.monitoredReelId,
              recipientIgId: dm.recipientIgId,
              recipientUsername: dm.recipientUsername,
              commentId: dm.commentId,
              commentText: dm.commentText,
              detectedKeyword: dm.detectedKeyword,
              messageSent: dm.messageToSend,
              status: 'sent',
              dmSentAt: new Date()
            }
          }).catch(() => {}); // Ignore duplicate errors

          // Update daily analytics
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.dailyAnalytics.upsert({
            where: { igAccountId_date: { igAccountId: dm.igAccountId, date: today } },
            update: { dmsSent: { increment: 1 } },
            create: { igAccountId: dm.igAccountId, date: today, dmsSent: 1 }
          });

          this.dmsSentThisHour[account.id] = (this.dmsSentThisHour[account.id] || 0) + 1;
          console.log(`   ✅ [Official API] DM sent to @${dm.recipientUsername}`);

          // Small delay between DMs (15-30 seconds - much less needed with official API)
          if (dms.indexOf(dm) < dms.length - 1) {
            const delay = Math.floor(Math.random() * 15) + 15;
            console.log(`   ⏱️ Waiting ${delay}s before next DM...`);
            await this.sleep(delay * 1000);
          }
        }
      } catch (error) {
        console.error(`   ❌ [Official API] Failed to send DM to @${dm.recipientUsername}:`, error.message);

        await prisma.dmQueue.update({
          where: { id: dm.id },
          data: {
            status: dm.retryCount < 3 ? 'pending' : 'failed',
            errorMessage: error.message.substring(0, 500),
            retryCount: dm.retryCount < 3 ? { increment: 1 } : dm.retryCount,
            scheduledAt: dm.retryCount < 3 ? new Date(Date.now() + 5 * 60 * 1000) : dm.scheduledAt
          }
        });

        // Update daily analytics for failures
        if (dm.retryCount >= 3) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.dailyAnalytics.upsert({
            where: { igAccountId_date: { igAccountId: dm.igAccountId, date: today } },
            update: { dmsFailed: { increment: 1 } },
            create: { igAccountId: dm.igAccountId, date: today, dmsFailed: 1 }
          });
        }
      }
    }
  }

  /**
   * Process DMs using Puppeteer (legacy fallback)
   */
  async processAccountDMsPuppeteer(dms, account) {
    let dmService = null;

    try {
      // Initialize Puppeteer DM service
      dmService = new PuppeteerDMService(account);
      await dmService.init();

      // Check if session is valid
      const sessionValid = await dmService.isSessionValid();
      if (!sessionValid) {
        console.log(`   ❌ @${account.username}: Session expired, marking account for reconnection`);

        // Mark account as needing reconnection
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { status: 'session_expired' }
        });

        // Reschedule DMs for later
        await prisma.dmQueue.updateMany({
          where: {
            igAccountId: account.id,
            status: 'pending'
          },
          data: {
            scheduledAt: new Date(Date.now() + 30 * 60 * 1000), // Retry in 30 mins
            errorMessage: 'Session expired - please reconnect account'
          }
        });

        await dmService.close();
        return;
      }

      console.log(`   ✅ @${account.username}: Session valid, processing ${dms.length} DM(s)...`);

      // Check hourly rate limit
      this.resetHourlyCounterIfNeeded();
      const sentThisHour = this.dmsSentThisHour[account.id] || 0;

      if (sentThisHour >= this.MAX_DMS_PER_HOUR) {
        console.log(`   ⚠️ @${account.username}: Hourly limit reached (${sentThisHour}/${this.MAX_DMS_PER_HOUR}), skipping...`);
        await dmService.close();
        return;
      }

      // Check daily limit
      const dailyCount = await this.getDailyDMCount(account.id);
      if (dailyCount >= this.MAX_DMS_PER_DAY) {
        console.log(`   ⚠️ @${account.username}: Daily limit reached (${dailyCount}/${this.MAX_DMS_PER_DAY}), skipping...`);
        await dmService.close();
        return;
      }

      // Process one DM at a time with LONG delays
      for (const dm of dms) {
        // Re-check hourly limit before each DM
        if ((this.dmsSentThisHour[account.id] || 0) >= this.MAX_DMS_PER_HOUR) {
          console.log(`   ⚠️ Hourly limit reached, stopping for @${account.username}`);
          break;
        }

        await this.processSingleDM(dm, dmService);

        // Track DMs sent
        this.dmsSentThisHour[account.id] = (this.dmsSentThisHour[account.id] || 0) + 1;

        // Add LONG human-like delay between DMs (2-5 minutes)
        if (dms.indexOf(dm) < dms.length - 1) {
          const delay = Math.floor(Math.random() * (this.MAX_DELAY_SECONDS - this.MIN_DELAY_SECONDS)) + this.MIN_DELAY_SECONDS;
          console.log(`   ⏱️ Waiting ${Math.round(delay/60)}m ${delay%60}s before next DM (safety delay)...`);
          await this.sleep(delay * 1000);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error processing DMs for @${account.username}:`, error.message);
    } finally {
      // Always close browser
      if (dmService) {
        await dmService.close();
      }
    }
  }

  /**
   * Process a single DM
   */
  async processSingleDM(dm, dmService) {
    const { id, recipientUsername, messageToSend, igAccountId } = dm;

    // Mark as processing
    await prisma.dmQueue.update({
      where: { id },
      data: { status: 'processing', processedAt: new Date() }
    });

    try {
      // Get the automation to check for Ask for Follow feature
      let automation = null;
      if (dm.commentId) {
        const trigger = await prisma.trigger.findFirst({
          where: { commentId: dm.commentId },
          include: { automation: true }
        });
        automation = trigger?.automation;
      }

      // Check if Ask for Follow is enabled
      if (automation?.askForFollowEnabled) {
        console.log(`   🔍 Ask for Follow enabled, checking follower status...`);

        const followerCheck = await dmService.checkIfFollower(recipientUsername);

        if (followerCheck.found && !followerCheck.isFollower) {
          console.log(`   ⚠️ @${recipientUsername} is not a follower`);

          // Update trigger with follower status
          if (dm.commentId) {
            await prisma.trigger.updateMany({
              where: { commentId: dm.commentId },
              data: { isFollower: false, followRequested: true }
            });
          }

          // If skipNonFollowers is enabled, skip this DM entirely
          if (automation.skipNonFollowers) {
            console.log(`   ⏭️ Skipping DM (skipNonFollowers enabled)`);
            await prisma.dmQueue.update({
              where: { id },
              data: { status: 'skipped', errorMessage: 'User is not a follower' }
            });
            return;
          }

          // Send the "Ask for Follow" message instead of the main message
          if (automation.askForFollowMessage) {
            console.log(`   📤 Sending "Ask for Follow" message instead...`);
            const askFollowResult = await dmService.sendDM(
              recipientUsername,
              automation.askForFollowMessage
            );

            if (askFollowResult.success) {
              // Update status to waiting_follow
              await prisma.dmQueue.update({
                where: { id },
                data: { status: 'waiting_follow', sentAt: new Date() }
              });

              if (dm.commentId) {
                await prisma.trigger.updateMany({
                  where: { commentId: dm.commentId },
                  data: { status: 'waiting_follow' }
                });
              }

              console.log(`   ✅ Ask for Follow message sent to @${recipientUsername}`);
            }
            return;
          }
        } else if (followerCheck.found && followerCheck.isFollower) {
          // Update trigger with follower status
          if (dm.commentId) {
            await prisma.trigger.updateMany({
              where: { commentId: dm.commentId },
              data: { isFollower: true }
            });
          }
          console.log(`   ✅ @${recipientUsername} is a follower, proceeding with DM`);
        }
      }

      // Send the DM (with slight variation to avoid detection)
      const variedMessage = this.addMessageVariation(messageToSend);
      const result = await dmService.sendDM(recipientUsername, variedMessage);

      if (result.success) {
        // Mark as sent
        await prisma.dmQueue.update({
          where: { id },
          data: { status: 'sent', sentAt: new Date() }
        });

        // Update trigger status
        if (dm.commentId) {
          await prisma.trigger.updateMany({
            where: { commentId: dm.commentId },
            data: { dmSent: true, dmSentAt: new Date(), status: 'dm_sent' }
          });
        }

        // Add to DM history
        await prisma.dmHistory.create({
          data: {
            igAccountId: dm.igAccountId,
            monitoredReelId: dm.monitoredReelId,
            recipientIgId: dm.recipientIgId,
            recipientUsername: dm.recipientUsername,
            commentId: dm.commentId,
            commentText: dm.commentText,
            detectedKeyword: dm.detectedKeyword,
            messageSent: dm.messageToSend,
            status: 'sent',
            dmSentAt: new Date()
          }
        }).catch(() => {}); // Ignore duplicate errors

        // Update automation stats
        const trigger = await prisma.trigger.findFirst({
          where: { commentId: dm.commentId },
          select: { automationId: true }
        });

        if (trigger) {
          await prisma.automation.update({
            where: { id: trigger.automationId },
            data: { dmsSentCount: { increment: 1 } }
          });
        }

        // Update daily analytics
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await prisma.dailyAnalytics.upsert({
          where: {
            igAccountId_date: {
              igAccountId: dm.igAccountId,
              date: today
            }
          },
          update: {
            dmsSent: { increment: 1 }
          },
          create: {
            igAccountId: dm.igAccountId,
            date: today,
            dmsSent: 1
          }
        });

        console.log(`   ✅ DM sent to @${recipientUsername}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to send DM to @${recipientUsername}:`, error.message);

      const errorMessage = error.message;
      let newStatus = 'failed';
      let shouldRetry = false;

      // Handle specific errors
      if (errorMessage.includes('ACTION_BLOCKED')) {
        newStatus = 'blocked';
        // Don't retry - account is blocked
      } else if (errorMessage.includes('RATE_LIMITED')) {
        newStatus = 'pending';
        shouldRetry = true;
        // Reschedule for later
      } else if (errorMessage.includes('SESSION_EXPIRED')) {
        newStatus = 'failed';
        // Mark account as needing reconnection
        await prisma.instagramAccount.update({
          where: { id: igAccountId },
          data: { status: 'session_expired' }
        });
      } else if (errorMessage.includes('DM_RESTRICTED') || errorMessage.includes('Message button')) {
        // User has DM restrictions - don't retry
        newStatus = 'failed';
        console.log(`   ⚠️ @${recipientUsername} has DM restrictions enabled`);
      } else if (errorMessage.includes('USER_NOT_FOUND')) {
        // User doesn't exist - don't retry
        newStatus = 'failed';
      } else if (dm.retryCount < 3) {
        // Retry up to 3 times for other errors
        shouldRetry = true;
        newStatus = 'pending';
      }

      // Update queue item
      await prisma.dmQueue.update({
        where: { id },
        data: {
          status: newStatus,
          errorCode: error.code || 'UNKNOWN',
          errorMessage: errorMessage.substring(0, 500),
          retryCount: shouldRetry ? { increment: 1 } : dm.retryCount,
          scheduledAt: shouldRetry ? new Date(Date.now() + 5 * 60 * 1000) : dm.scheduledAt
        }
      });

      // Update trigger status
      if (dm.commentId && !shouldRetry) {
        await prisma.trigger.updateMany({
          where: { commentId: dm.commentId },
          data: { status: 'failed', errorMessage: errorMessage.substring(0, 500) }
        });
      }

      // Update daily analytics for failures
      if (!shouldRetry) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await prisma.dailyAnalytics.upsert({
          where: {
            igAccountId_date: {
              igAccountId: dm.igAccountId,
              date: today
            }
          },
          update: {
            dmsFailed: { increment: 1 }
          },
          create: {
            igAccountId: dm.igAccountId,
            date: today,
            dmsFailed: 1
          }
        });
      }
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset hourly counter if an hour has passed
   */
  resetHourlyCounterIfNeeded() {
    const now = Date.now();
    if (now - this.lastHourReset > 60 * 60 * 1000) {
      this.dmsSentThisHour = {};
      this.lastHourReset = now;
      console.log('   🔄 Hourly DM counters reset');
    }
  }

  /**
   * Get daily DM count for an account
   */
  async getDailyDMCount(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await prisma.dmHistory.count({
      where: {
        igAccountId: accountId,
        dmSentAt: { gte: today }
      }
    });

    return count;
  }

  /**
   * Add slight variation to messages to appear more human
   */
  addMessageVariation(message) {
    // Add random whitespace or emoji variations
    const variations = [
      msg => msg,
      msg => msg + ' ',
      msg => ' ' + msg,
      msg => msg.replace(/!$/, '!!'),
      msg => msg.replace(/\.$/, '...'),
    ];

    const randomVariation = variations[Math.floor(Math.random() * variations.length)];
    return randomVariation(message);
  }
}

// Export singleton instance
const dmQueueWorker = new DMQueueWorker();
module.exports = dmQueueWorker;
