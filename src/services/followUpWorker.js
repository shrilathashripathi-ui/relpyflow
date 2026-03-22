const prisma = require('../config/prisma');
const officialApi = require('./instagram/officialApiService');
const { decrypt } = require('../utils/encryption');

const FOLLOW_UP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FOLLOW_UPS = 2;
const POLL_INTERVAL = 60 * 1000; // Check every 60 seconds

let isRunning = false;

/**
 * Follow-up Worker
 *
 * Checks for triggers where:
 * - Link was sent (conversationStep = 'link_sent')
 * - Follow-up is enabled on the automation
 * - User hasn't replied/engaged (status != 'completed_engaged')
 * - Less than MAX_FOLLOW_UPS sent
 * - Enough time has passed since link sent or last follow-up
 *
 * After 2 follow-ups with no reply → stops the automation for that user
 */
async function processFollowUps() {
  try {
    // Find triggers eligible for follow-up
    const eligibleTriggers = await prisma.trigger.findMany({
      where: {
        conversationStep: 'link_sent',
        linkSent: true,
        followUpCount: { lt: MAX_FOLLOW_UPS },
        status: { notIn: ['completed_engaged', 'completed_max_followups'] },
        automation: {
          followUpEnabled: true,
          isActive: true,
        }
      },
      include: {
        automation: {
          include: {
            instagramAccount: true
          }
        }
      }
    });

    if (eligibleTriggers.length === 0) return;

    const now = Date.now();

    for (const trigger of eligibleTriggers) {
      const automation = trigger.automation;
      const account = automation.instagramAccount;

      if (!account?.accessToken) continue;

      // Determine the reference time: last follow-up sent, or link sent time
      const lastActionTime = trigger.followUpSentAt || trigger.linkSentAt;
      if (!lastActionTime) continue;

      const timeSinceLastAction = now - new Date(lastActionTime).getTime();

      // Wait 5 minutes before each follow-up
      if (timeSinceLastAction < FOLLOW_UP_DELAY_MS) continue;

      // Decrypt the access token
      let decryptedToken;
      try {
        decryptedToken = decrypt(account.accessToken);
      } catch {
        decryptedToken = account.accessToken;
      }

      const followUpMsg = automation.followUpMessage ||
        "Hey! Just wanted to make sure you didn't miss this 😊\n\nTap the link above to check it out!";

      const newCount = trigger.followUpCount + 1;

      try {
        // Send follow-up message
        await officialApi.sendDM(
          decryptedToken,
          account.igUserId,
          trigger.commenterIgId,
          followUpMsg
        );

        console.log(`📨 [FollowUp] Sent follow-up #${newCount}/${MAX_FOLLOW_UPS} to @${trigger.commenterUsername}`);

        // Update trigger
        await prisma.trigger.update({
          where: { id: trigger.id },
          data: {
            followUpSent: true,
            followUpSentAt: new Date(),
            followUpCount: newCount,
            // If this was the last follow-up, mark as done
            ...(newCount >= MAX_FOLLOW_UPS ? {
              status: 'completed_max_followups',
              conversationStep: 'completed'
            } : {})
          }
        });

        if (newCount >= MAX_FOLLOW_UPS) {
          console.log(`🛑 [FollowUp] Max follow-ups reached for @${trigger.commenterUsername} — stopping`);
        }

      } catch (err) {
        console.error(`❌ [FollowUp] Failed to send follow-up to @${trigger.commenterUsername}:`, err.message);
      }

      // Small delay between follow-ups to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error('❌ [FollowUp] Worker error:', err.message);
  }
}

let workerTimer = null;

function start() {
  if (isRunning) return;
  isRunning = true;
  console.log('🔄 [FollowUp] Worker started (checking every 60s, 5min delay, max 2 follow-ups)');

  workerTimer = setInterval(async () => {
    await processFollowUps();
  }, POLL_INTERVAL);

  // Run once immediately
  processFollowUps();
}

function stop() {
  isRunning = false;
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  console.log('🛑 [FollowUp] Worker stopped');
}

module.exports = { start, stop, processFollowUps };
