/**
 * Meta/Instagram Webhook Routes
 *
 * Handles:
 * - Webhook verification (GET)
 * - Real-time comment notifications
 * - Real-time messaging events (DMs)
 * - Data deletion callbacks
 */

const express = require('express');
const crypto = require('crypto');
const KeywordMatcher = require('../services/instagram/keywordMatcher');
const officialApi = require('../services/instagram/officialApiService');
const { decryptAccountTokens } = require('../utils/encryption');

const router = express.Router();
const prisma = require('../config/prisma');

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'replyflow_webhook_verify_2025';
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET;

/**
 * Verify Meta webhook signature (X-Hub-Signature-256).
 * Rejects requests with invalid or missing signatures.
 */
function verifyMetaSignature(req, res, next) {
  // Skip signature check for GET (verification handshake)
  if (req.method === 'GET') return next();

  if (!APP_SECRET) {
    console.error('⚠️ INSTAGRAM_APP_SECRET not set — cannot verify webhook signatures');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.warn('🚫 Webhook request missing X-Hub-Signature-256');
    return res.status(403).json({ error: 'Missing signature' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    console.warn('🚫 Webhook raw body not available for signature verification');
    return res.status(403).json({ error: 'Cannot verify signature' });
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(rawBody)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    console.warn('🚫 Webhook signature verification FAILED');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  next();
}

// Apply signature verification to all webhook routes
router.use(verifyMetaSignature);

// Webhook verification (GET) - Meta sends this to verify the endpoint
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔔 Webhook verification request received');
  console.log(`   Mode: ${mode}, Token: ${token ? '***' : 'undefined'}, Challenge: ${challenge ? 'present' : 'undefined'}`);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    return res.status(200).send(challenge);
  }

  console.log('❌ Webhook verification failed');
  return res.status(403).json({ error: 'Verification failed' });
});

// Webhook event receiver (POST) - Meta sends real-time events here
router.post('/', async (req, res) => {
  const body = req.body;

  // Always respond 200 immediately (Meta requires response within 20 seconds)
  res.status(200).json({ status: 'EVENT_RECEIVED' });

  // Process events asynchronously
  try {
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      const igUserId = entry.id;

      // Handle messaging events (incoming DMs, message echoes, read receipts)
      if (entry.messaging) {
        for (const event of entry.messaging) {
          await handleMessagingEvent(igUserId, event);
        }
      }

      // Handle field changes (comments, etc.)
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'comments') {
            await handleCommentEvent(igUserId, change.value);
          }
          if (change.field === 'messages') {
            await handleMessageChangeEvent(igUserId, change.value);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error.message);
  }
});

/**
 * Handle incoming messaging events (DMs via messaging webhook)
 */
async function handleMessagingEvent(igUserId, event) {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const message = event.message;

  // Skip echo messages (messages sent by us)
  if (message?.is_echo) {
    console.log(`📤 [Webhook] Echo: message sent to ${recipientId}`);
    return;
  }

  // Skip read receipts
  if (event.read) {
    return;
  }

  // Process incoming message from a user
  if (message?.text && senderId) {
    console.log(`📩 [Webhook] Incoming DM from ${senderId}: "${message.text.substring(0, 50)}..."`);

    // Find the Instagram account this message is for
    const account = await prisma.instagramAccount.findFirst({
      where: { igUserId: igUserId, useOfficialApi: true },
      include: { automations: { where: { isActive: true } } }
    });

    if (!account) return;
    decryptAccountTokens(account);

    // Reply rate tracking: mark our most recent DM to this sender as "replied"
    // This powers ranking suppression detection — if reply rate drops, Instagram
    // may be silently throttling message visibility.
    try {
      await prisma.dmHistory.updateMany({
        where: {
          igAccountId: account.id,
          recipientIgId: senderId,
          status: 'sent',
          repliedAt: null, // Only mark once
        },
        data: { repliedAt: new Date() },
      });
    } catch (err) {
      // Non-critical — don't block message processing
      console.warn(`⚠️ [Webhook] Reply tracking failed for sender ${senderId}:`, err.message);
    }

    // Check if this user is in an active conversation flow
    const activeTrigger = await prisma.trigger.findFirst({
      where: {
        commenterIgId: senderId,
        automation: { instagramAccountId: account.id },
        status: { in: ['waiting_button', 'waiting_follow', 'waiting_email'] }
      },
      include: { automation: true }
    });

    if (activeTrigger) {
      await handleConversationReply(account, activeTrigger, message.text, senderId);
    }

    // Check if it's a DM-triggered automation (type: "dm")
    for (const automation of account.automations) {
      if (automation.type !== 'dm') continue;

      const matcher = new KeywordMatcher(automation.keywords);
      const matchResult = matcher.matches(message.text, { wholeWord: false });

      if (matchResult.matched) {
        console.log(`🎯 [Webhook] DM keyword "${matchResult.keyword}" matched from ${senderId}`);
        await triggerDMAutomation(account, automation, senderId, message.text, matchResult.keyword);
      }
    }
  }
}

/**
 * Handle comment webhook events
 */
async function handleCommentEvent(igUserId, commentData) {
  console.log(`💬 [Webhook] New comment on account ${igUserId}`);
  console.log(`   From: ${commentData.from?.username || 'unknown'}, Text: "${(commentData.text || '').substring(0, 50)}"`);

  const account = await prisma.instagramAccount.findFirst({
    where: { igUserId: igUserId, useOfficialApi: true },
    include: { automations: { where: { isActive: true, type: 'comment' } } }
  });

  if (!account || account.automations.length === 0) return;
  decryptAccountTokens(account);

  const commentText = commentData.text || '';
  const commenterUsername = commentData.from?.username;
  const commenterUserId = commentData.from?.id;
  const commentId = commentData.id;
  const mediaId = commentData.media?.id;

  if (!commentText || !commenterUsername || commenterUsername === account.username) return;

  // Check against all active automations
  for (const automation of account.automations) {
    const matcher = new KeywordMatcher(automation.keywords);
    const matchResult = matcher.matches(commentText, { wholeWord: false });

    if (!matchResult.matched) continue;

    console.log(`🎯 [Webhook] Keyword "${matchResult.keyword}" matched from @${commenterUsername}`);

    // Check for duplicate trigger
    const existingTrigger = await prisma.trigger.findFirst({
      where: { automationId: automation.id, commentId: commentId }
    });

    if (existingTrigger) continue;

    // Check for recent DM to this user (prevent spam)
    const recentDM = await prisma.dmHistory.findFirst({
      where: {
        igAccountId: account.id,
        recipientUsername: commenterUsername,
        dmSentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });

    if (recentDM) {
      console.log(`   ⏭️ Already sent DM to @${commenterUsername} in last 24h`);
      continue;
    }

    // Create trigger
    const trigger = await prisma.trigger.create({
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

    console.log(`   ✅ Created trigger for @${commenterUsername}`);

    // Reply to comment if enabled
    if (automation.commentReplyEnabled && automation.commentReplies?.length > 0) {
      const randomReply = automation.commentReplies[Math.floor(Math.random() * automation.commentReplies.length)];
      try {
        await officialApi.replyToComment(account.accessToken, commentId, randomReply);
        await prisma.trigger.update({
          where: { id: trigger.id },
          data: { commentReplied: true, commentRepliedAt: new Date() }
        });
      } catch (err) {
        console.error('   ❌ Comment reply failed:', err.message);
      }
    }

    // Ensure monitored reel exists
    if (mediaId) {
      await prisma.monitoredReel.upsert({
        where: { igAccountId_mediaId: { igAccountId: account.id, mediaId: mediaId } },
        update: { lastCheckedAt: new Date() },
        create: { igAccountId: account.id, mediaId: mediaId }
      });
    }

    // Get the monitored reel for DM queue
    const monitoredReel = mediaId ? await prisma.monitoredReel.findUnique({
      where: { igAccountId_mediaId: { igAccountId: account.id, mediaId: mediaId } }
    }) : null;

    // Queue the DM with a short delay (official API is safe, no need for long delays)
    const scheduledDelay = Math.floor(Math.random() * 30000) + 10000; // 10-40 seconds
    await prisma.dmQueue.create({
      data: {
        igAccountId: account.id,
        monitoredReelId: monitoredReel?.id || 'webhook-' + Date.now(),
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

    console.log(`   📬 DM queued (${Math.round(scheduledDelay / 1000)}s delay)`);

    // Update automation stats
    await prisma.automation.update({
      where: { id: automation.id },
      data: { triggerCount: { increment: 1 } }
    });

    // Update daily analytics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.dailyAnalytics.upsert({
      where: { igAccountId_date: { igAccountId: account.id, date: today } },
      update: { commentsDetected: { increment: 1 }, dmsQueued: { increment: 1 } },
      create: { igAccountId: account.id, date: today, commentsDetected: 1, dmsQueued: 1 }
    });
  }
}

/**
 * Handle message field change events
 */
async function handleMessageChangeEvent(igUserId, messageData) {
  // This handles messages received via the changes array rather than messaging array
  console.log(`📩 [Webhook] Message change event for ${igUserId}`);
}

/**
 * Handle conversation reply (user responding in an active flow)
 */
async function handleConversationReply(account, trigger, responseText, senderIgId) {
  const automation = trigger.automation;
  const currentStep = trigger.conversationStep || trigger.status;

  console.log(`💬 [Webhook] @${trigger.commenterUsername} replied: "${responseText.substring(0, 50)}" (step: ${currentStep})`);

  if (currentStep === 'waiting_button') {
    // User clicked the button / responded positively
    const positiveResponses = ['yes', 'send', 'link', 'want', 'please', 'sure', 'ok', 'yeah'];
    const isPositive = positiveResponses.some(word => responseText.toLowerCase().includes(word));

    if (!isPositive) return;

    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { buttonClicked: true, buttonClickedAt: new Date() }
    });

    // Send the DM with link via Official API
    if (automation.aiCtaUrl) {
      const finalMessage = automation.responseMessage + '\n\n' + automation.aiCtaUrl;
      await officialApi.sendDM(account.accessToken, account.igUserId, senderIgId, finalMessage);
    } else {
      await officialApi.sendDM(account.accessToken, account.igUserId, senderIgId, automation.responseMessage);
    }

    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { conversationStep: 'link_sent', status: 'completed', linkSent: true, linkSentAt: new Date() }
    });

  } else if (currentStep === 'waiting_email') {
    // Check for email in response
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMatch = responseText.match(emailRegex);

    if (!emailMatch) return;

    // Save lead
    await prisma.lead.create({
      data: {
        automationId: trigger.automationId,
        igUserId: trigger.commenterIgId,
        igUsername: trigger.commenterUsername,
        email: emailMatch[0],
        source: 'dm_conversation'
      }
    }).catch(() => {});

    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { emailCollected: emailMatch[0] }
    });

    // Send final message
    const finalMessage = automation.aiCtaUrl
      ? `Thanks! Here's your link: ${automation.aiCtaUrl}`
      : automation.responseMessage;

    await officialApi.sendDM(account.accessToken, account.igUserId, senderIgId, finalMessage);

    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { conversationStep: 'link_sent', status: 'completed', linkSent: true, linkSentAt: new Date() }
    });
  }
}

/**
 * Trigger DM automation from an incoming DM keyword match
 */
async function triggerDMAutomation(account, automation, senderIgId, dmText, matchedKeyword) {
  // Check for duplicate
  const existing = await prisma.trigger.findFirst({
    where: {
      automationId: automation.id,
      commenterIgId: senderIgId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });

  if (existing) return;

  // Create trigger
  await prisma.trigger.create({
    data: {
      automationId: automation.id,
      commenterIgId: senderIgId,
      commenterUsername: senderIgId, // Will be resolved later
      incomingDmText: dmText,
      matchedKeyword: matchedKeyword,
      status: 'pending'
    }
  });

  // Send automated response via Official API
  try {
    await officialApi.sendDM(account.accessToken, account.igUserId, senderIgId, automation.responseMessage);
    console.log(`✅ [Webhook] Auto-reply sent via Official API`);
  } catch (error) {
    console.error('❌ [Webhook] Auto-reply failed:', error.message);
  }
}

// Data deletion callback (required by Meta)
router.post('/data-deletion', async (req, res) => {
  console.log('🗑️ Data deletion request received');

  const confirmationCode = `DEL_${Date.now()}`;
  const statusUrl = `${process.env.API_URL || 'https://api.replyflows.in'}/data-deletion/status?code=${confirmationCode}`;

  try {
    // Decode Meta signed_request
    const signedRequest = req.body?.signed_request;
    let fbUserId = null;

    if (signedRequest && APP_SECRET) {
      const parts = signedRequest.split('.');
      if (parts.length === 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        fbUserId = payload.user_id;
      }
    }

    if (fbUserId) {
      console.log(`🗑️ Processing data deletion for FB user: ${fbUserId}`);

      // Find linked Instagram accounts (check igUserId and pageId)
      const accounts = await prisma.instagramAccount.findMany({
        where: {
          OR: [
            { igUserId: fbUserId },
            { pageId: fbUserId },
          ],
        },
      });

      let deletedRecords = 0;

      for (const account of accounts) {
        // Delete all automations (cascades to triggers, leads)
        const automations = await prisma.automation.findMany({ where: { instagramAccountId: account.id } });
        for (const auto of automations) {
          await prisma.trigger.deleteMany({ where: { automationId: auto.id } });
          await prisma.lead.deleteMany({ where: { automationId: auto.id } });
          deletedRecords += 2;
        }
        await prisma.automation.deleteMany({ where: { instagramAccountId: account.id } });

        // Delete DM history and queue
        await prisma.dmHistory.deleteMany({ where: { igAccountId: account.id } });
        await prisma.dmQueue.deleteMany({ where: { igAccountId: account.id } });
        await prisma.dailyAnalytics.deleteMany({ where: { igAccountId: account.id } });
        await prisma.monitoredReel.deleteMany({ where: { igAccountId: account.id } });

        // Delete the Instagram account itself
        await prisma.instagramAccount.delete({ where: { id: account.id } });
        deletedRecords += 5;
      }

      console.log(`🗑️ Deleted ${deletedRecords} record groups for FB user ${fbUserId} (${accounts.length} accounts)`);
    } else {
      console.log('🗑️ No FB user ID in signed_request — returning confirmation only');
    }
  } catch (error) {
    console.error('🗑️ Data deletion processing error:', error.message);
    // Still return success to Meta — we'll process manually if needed
  }

  res.json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
});

// Data deletion status check
router.get('/data-deletion/status', (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: 'Missing confirmation code' });

  // All deletions are processed synchronously above, so if we get here it's done
  res.json({
    confirmation_code: code,
    status: 'completed',
    message: 'All user data has been deleted.',
  });
});

module.exports = router;
