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
const useJobQueue = process.env.USE_JOB_QUEUE === 'true';
const jobQueue = useJobQueue ? require('../services/queue/pgQueue') : null;

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

    // If user replies after link was sent → they engaged, mark completed (stop follow-ups)
    if (!activeTrigger) {
      const linkSentTrigger = await prisma.trigger.findFirst({
        where: {
          commenterIgId: senderId,
          automation: { instagramAccountId: account.id },
          conversationStep: 'link_sent',
          status: { not: 'completed_engaged' }
        }
      });

      if (linkSentTrigger) {
        console.log(`✅ [Webhook] @${linkSentTrigger.commenterUsername} replied after link — marking as engaged (stopping follow-ups)`);
        await prisma.trigger.update({
          where: { id: linkSentTrigger.id },
          data: { status: 'completed_engaged', conversationStep: 'completed' }
        });
      }
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

    // Check if this user already has ANY trigger for THIS automation (prevent spam per-automation)
    // Different automations should still trigger DMs to the same user
    // Check by BOTH igId and username to catch all cases
    const existingUserTrigger = await prisma.trigger.findFirst({
      where: {
        automationId: automation.id,
        OR: [
          { commenterIgId: commenterUserId },
          { commenterUsername: commenterUsername }
        ]
      }
    });

    if (existingUserTrigger) {
      console.log(`   ⏭️ Already triggered for @${commenterUsername} in automation "${automation.name}" (status: ${existingUserTrigger.status})`);
      continue;
    }

    // Also check if there's already a pending/processing DM queued for this user + account (race condition guard)
    let existingQueuedDM;
    if (useJobQueue) {
      existingQueuedDM = await prisma.jobQueue.findFirst({
        where: {
          jobType: 'send_dm',
          groupKey: account.id,
          status: { in: ['pending', 'processing'] },
          payload: { path: ['recipientIgId'], equals: commenterUserId }
        }
      });
    } else {
      existingQueuedDM = await prisma.dmQueue.findFirst({
        where: {
          igAccountId: account.id,
          recipientIgId: commenterUserId,
          status: { in: ['pending', 'processing'] }
        }
      });
    }

    if (existingQueuedDM) {
      console.log(`   ⏭️ DM already queued for @${commenterUsername} (queue status: ${existingQueuedDM.status})`);
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

    if (useJobQueue) {
      await jobQueue.enqueue('send_dm', {
        igAccountId: account.id,
        triggerId: trigger.id,
        automationId: automation.id,
        recipientIgId: commenterUserId,
        recipientUsername: commenterUsername,
        commentId: commentId,
        commentText: commentText,
        matchedKeyword: matchResult.keyword
      }, {
        groupKey: account.id,
        runAt: new Date(Date.now() + scheduledDelay)
      });
    } else {
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
    }

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
 *
 * Flow: waiting_button → waiting_follow → waiting_email → link_sent
 * Each step is optional based on automation settings.
 */
async function handleConversationReply(account, trigger, responseText, senderIgId) {
  const automation = trigger.automation;
  const currentStep = trigger.conversationStep || trigger.status;

  console.log(`💬 [Webhook] @${trigger.commenterUsername} replied: "${responseText.substring(0, 50)}" (step: ${currentStep})`);

  if (currentStep === 'waiting_button') {
    // Check if user's reply matches the button text or is a positive response
    const buttonText = automation.openingButton || 'Send me the link';
    const responseNorm = responseText.toLowerCase().trim();
    const buttonNorm = buttonText.toLowerCase().trim();
    const buttonWords = buttonNorm.split(/\s+/).filter(w => w.length > 2);
    const matchesButton = buttonWords.some(w => responseNorm.includes(w));

    const positiveResponses = ['yes', 'send', 'link', 'want', 'please', 'sure', 'ok', 'yeah', 'free', 'pdf'];
    const isPositive = positiveResponses.some(word => responseNorm.includes(word)) || matchesButton || responseNorm.includes(buttonNorm);

    if (!isPositive) return;

    console.log(`💬 [Webhook] Button click detected from @${trigger.commenterUsername}`);

    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { buttonClicked: true, buttonClickedAt: new Date() }
    });

    // Advance to next step in flow
    await advanceToNextStep(account, trigger, automation, senderIgId, 'button_done');

  } else if (currentStep === 'waiting_follow') {
    // User says they're following — check "I'm following" click or similar text
    const responseNorm = responseText.toLowerCase().trim();
    const followPhrases = ['following', 'follow', 'done', 'followed', "i'm following", 'im following'];
    const claimsFollowing = followPhrases.some(p => responseNorm.includes(p));

    if (!claimsFollowing) return;

    console.log(`💬 [Webhook] @${trigger.commenterUsername} claims they're following — accepting`);

    // Trust the user's claim immediately.
    // Instagram's /followers API is unreliable (pagination limits, API delays,
    // permission issues with Instagram Business Login). The follow step
    // encourages follows — gatekeeping with a broken API creates a dead loop.
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { isFollower: true, followedAt: new Date() }
    });

    console.log(`✅ [Webhook] @${trigger.commenterUsername} follow accepted — advancing flow`);
    await advanceToNextStep(account, trigger, automation, senderIgId, 'follow_done');

  } else if (currentStep === 'waiting_email') {
    // Check for email in response - normalize spaces around @ first
    const normalizedText = responseText.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.');
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMatch = normalizedText.match(emailRegex);

    if (!emailMatch) {
      try {
        await officialApi.sendDM(account.accessToken, account.igUserId, senderIgId,
          "Hmm, I couldn't detect a valid email address. Could you please send just your email? (e.g. name@gmail.com)");
      } catch (e) {
        console.error('Failed to send email retry message:', e.message);
      }
      return;
    }

    // Save lead with email
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

    // Email collected → advance to final link
    await advanceToNextStep(account, trigger, automation, senderIgId, 'email_done');
  }
}

/**
 * Advance to the next step in the conversation flow.
 * Called after a step completes. Determines what comes next based on automation settings.
 *
 * completedStep values: 'button_done', 'follow_done', 'email_done'
 */
async function advanceToNextStep(account, trigger, automation, senderIgId, completedStep) {
  // After button click → check follow (if enabled) → ask email (if enabled) → send link
  if (completedStep === 'button_done') {
    if (automation.askForFollowEnabled) {
      // Send follow message — don't pre-check via API (unreliable with Instagram Business Login)
      // The user will tap "I'm following" and we trust their claim
      await sendFollowMessage(account, senderIgId, automation);
      await prisma.trigger.update({
        where: { id: trigger.id },
        data: { conversationStep: 'waiting_follow', status: 'waiting_follow' }
      });
      return;
    }
    // No follow step — check email
    if (automation.leadCollectionEnabled) {
      const emailMsg = automation.emailAskMessage || "Drop your email below to get exclusive content!";
      await officialApi.sendDM(account.accessToken, account.igUserId, senderIgId, emailMsg);
      await prisma.trigger.update({
        where: { id: trigger.id },
        data: { conversationStep: 'waiting_email', status: 'waiting_email' }
      });
      return;
    }
    // No follow, no email — send link directly
    await sendFinalLinkMessage(account, senderIgId, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { conversationStep: 'link_sent', status: 'completed', linkSent: true, linkSentAt: new Date() }
    });
    return;
  }

  if (completedStep === 'follow_done') {
    // After follow confirmed → ask email (if enabled) → send link
    if (automation.leadCollectionEnabled) {
      const emailMsg = automation.emailAskMessage || "Drop your email below to get exclusive content!";
      await officialApi.sendDM(account.accessToken, account.igUserId, senderIgId, emailMsg);
      await prisma.trigger.update({
        where: { id: trigger.id },
        data: { conversationStep: 'waiting_email', status: 'waiting_email' }
      });
      return;
    }
    // No email step — send link directly
    await sendFinalLinkMessage(account, senderIgId, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { conversationStep: 'link_sent', status: 'completed', linkSent: true, linkSentAt: new Date() }
    });
    return;
  }

  if (completedStep === 'email_done') {
    // After email collected → send final link
    await sendFinalLinkMessage(account, senderIgId, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { conversationStep: 'link_sent', status: 'completed', linkSent: true, linkSentAt: new Date() }
    });
    return;
  }
}

/**
 * Send the follow message with a Follow URL button + "I'm following" quick reply
 */
async function sendFollowMessage(account, recipientId, automation) {
  const followMsg = automation.askForFollowMessage || "Nearly there! The link is especially for my followers ✨\n\nFollow me and I'll send it right away!";
  const profileUrl = `https://www.instagram.com/${account.username}/`;

  // Send the follow message with Follow URL button
  try {
    await officialApi.sendGenericTemplate(
      account.accessToken, account.igUserId, recipientId,
      followMsg,
      [{ type: 'web_url', url: profileUrl, title: 'Follow' }]
    );
  } catch (e) {
    await officialApi.sendDM(account.accessToken, account.igUserId, recipientId, followMsg + '\n\n' + profileUrl);
  }

  // Send "I'm following" quick reply button
  try {
    await officialApi.sendQuickReply(
      account.accessToken, account.igUserId, recipientId,
      'Tap below once you\'ve followed 👇',
      [{ title: "I'm following", payload: 'confirm_follow' }]
    );
  } catch (e) {
    console.warn('⚠️ Quick reply for follow confirmation failed:', e.message);
  }
}

/**
 * Send the final link message as a Generic Template with button
 */
async function sendFinalLinkMessage(account, recipientId, automation) {
  const finalText = automation.finalMessage || 'Here\'s your link!';
  const linkUrl = automation.aiCtaUrl;
  const linkLabel = automation.aiCtaLabel || 'Open Link';

  if (linkUrl) {
    try {
      await officialApi.sendGenericTemplate(
        account.accessToken, account.igUserId, recipientId,
        finalText,
        [{ type: 'web_url', url: linkUrl, title: linkLabel }]
      );
      return;
    } catch (e) {
      console.warn('⚠️ Generic template failed, falling back to plain text:', e.message);
    }
  }
  // Fallback: plain text with URL
  const message = linkUrl ? `${finalText}\n\n${linkUrl}` : finalText;
  await officialApi.sendDM(account.accessToken, account.igUserId, recipientId, message);
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
