/**
 * DM Conversation Handler
 *
 * This service polls for incoming DM replies from users who are in the middle
 * of a conversation flow (waiting for button click, follow, or email).
 *
 * When a user responds, it advances them to the next step in the flow.
 */

const instagramAPI = new (require('./instagram/instagramAPI'))();
const officialApi = require('./instagram/officialApiService');

const prisma = require('../config/prisma');

/**
 * Send a DM using the best available method (Official API preferred)
 */
async function sendDMViaAccount(account, recipientIgId, message) {
  if (account.useOfficialApi && account.accessToken) {
    return officialApi.sendDM(account.accessToken, account.igUserId, recipientIgId, message);
  }
  return instagramAPI.sendDM(account, recipientIgId, message);
}

// Polling interval in ms (check every 30 seconds)
const POLL_INTERVAL = 30000;

// Store active polling intervals
let pollingInterval = null;

/**
 * Start the DM conversation handler
 */
async function startConversationHandler() {
  console.log('Starting DM Conversation Handler...');

  // Run immediately, then set interval
  await processConversations();

  pollingInterval = setInterval(async () => {
    try {
      await processConversations();
    } catch (error) {
      console.error('Error in conversation handler:', error);
    }
  }, POLL_INTERVAL);

  console.log(`DM Conversation Handler started (polling every ${POLL_INTERVAL/1000}s)`);
}

/**
 * Stop the conversation handler
 */
function stopConversationHandler() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('DM Conversation Handler stopped');
  }
}

/**
 * Process all active conversations
 */
async function processConversations() {
  try {
    // Get all triggers that are waiting for user action
    const waitingTriggers = await prisma.trigger.findMany({
      where: {
        OR: [
          { status: 'waiting_button' },
          { status: 'waiting_follow' },
          { status: 'waiting_email' },
          { conversationStep: 'waiting_button' },
          { conversationStep: 'waiting_follow' },
          { conversationStep: 'waiting_email' }
        ]
      },
      include: {
        automation: {
          include: {
            instagramAccount: true
          }
        }
      }
    });

    if (waitingTriggers.length === 0) {
      return;
    }

    console.log(`[DM Handler] Processing ${waitingTriggers.length} waiting conversations...`);

    // Group triggers by Instagram account to batch API calls
    const triggersByAccount = {};
    for (const trigger of waitingTriggers) {
      const accountId = trigger.automation.instagramAccountId;
      if (!triggersByAccount[accountId]) {
        triggersByAccount[accountId] = {
          account: trigger.automation.instagramAccount,
          triggers: []
        };
      }
      triggersByAccount[accountId].triggers.push(trigger);
    }

    // Process each account
    for (const accountId of Object.keys(triggersByAccount)) {
      const { account, triggers } = triggersByAccount[accountId];

      try {
        await processAccountConversations(account, triggers);
      } catch (error) {
        console.error(`Error processing conversations for account ${account.username}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in processConversations:', error);
  }
}

/**
 * Process conversations for a specific Instagram account
 */
async function processAccountConversations(account, triggers) {
  // Get recent DM threads for this account
  const threads = await getRecentDMThreads(account);

  if (!threads || threads.length === 0) {
    return;
  }

  for (const trigger of triggers) {
    try {
      // Find the thread with this user
      const thread = threads.find(t =>
        t.users?.some(u =>
          u.pk === trigger.commenterIgId ||
          u.username === trigger.commenterUsername
        )
      );

      if (!thread) {
        continue;
      }

      // Get the latest messages in this thread
      const messages = thread.items || [];

      // Check if user has responded since we sent the opening DM
      const userResponses = messages.filter(msg =>
        msg.user_id !== account.igUserId &&
        new Date(msg.timestamp / 1000) > new Date(trigger.dmSentAt || trigger.createdAt)
      );

      if (userResponses.length === 0) {
        continue;
      }

      // Get the latest user response
      const latestResponse = userResponses[0];
      const responseText = latestResponse.text || '';

      // Handle based on current conversation step
      await handleUserResponse(trigger, account, responseText, latestResponse);

    } catch (error) {
      console.error(`Error processing trigger ${trigger.id}:`, error);
    }
  }
}

/**
 * Get recent DM threads for an account
 */
async function getRecentDMThreads(account) {
  try {
    // Use the Instagram API to fetch DM inbox
    const result = await instagramAPI.getDMInbox(account);
    return result?.threads || [];
  } catch (error) {
    console.error('Error fetching DM threads:', error);
    return [];
  }
}

/**
 * Handle a user's response based on their current conversation step
 */
async function handleUserResponse(trigger, account, responseText, rawMessage) {
  const automation = trigger.automation;
  const currentStep = trigger.conversationStep || trigger.status;

  console.log(`[DM Handler] @${trigger.commenterUsername} responded: "${responseText}" (step: ${currentStep})`);

  switch (currentStep) {
    case 'waiting_button':
      await handleButtonClick(trigger, account, automation, responseText);
      break;

    case 'waiting_follow':
      await handleFollowCheck(trigger, account, automation, responseText);
      break;

    case 'waiting_email':
      await handleEmailCapture(trigger, account, automation, responseText);
      break;

    default:
      console.log(`Unknown conversation step: ${currentStep}`);
  }
}

/**
 * Handle button click (user sent message matching button text)
 */
async function handleButtonClick(trigger, account, automation, responseText) {
  // Use the saved openingButton text from the automation, or a default
  const buttonText = automation.openingButton || 'Send me the link';

  const responseNormalized = responseText.toLowerCase().trim();
  const buttonNormalized = buttonText.toLowerCase().trim();

  // Accept if response contains the button text, keywords from it, or a positive response
  const buttonWords = buttonNormalized.split(/\s+/).filter(w => w.length > 2);
  const matchesButtonKeyword = buttonWords.some(word => responseNormalized.includes(word));

  const isButtonClick = responseNormalized.includes(buttonNormalized) ||
                        matchesButtonKeyword ||
                        responseNormalized.includes('send') ||
                        responseNormalized.includes('link') ||
                        responseNormalized.includes('yes') ||
                        responseNormalized.includes('want') ||
                        responseNormalized.includes('free') ||
                        responseNormalized.includes('pdf') ||
                        responseNormalized === buttonNormalized;

  if (!isButtonClick) {
    console.log(`[DM Handler] Response doesn't match button: "${responseText}"`);
    return;
  }

  console.log(`[DM Handler] Button clicked by @${trigger.commenterUsername}!`);

  // Update trigger
  await prisma.trigger.update({
    where: { id: trigger.id },
    data: {
      buttonClicked: true,
      buttonClickedAt: new Date()
    }
  });

  // Determine next step based on automation settings
  if (automation.askForFollowEnabled) {
    // Send follow request message
    await sendFollowRequestMessage(trigger, account, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: {
        conversationStep: 'waiting_follow',
        status: 'waiting_follow'
      }
    });
  } else if (automation.leadCollectionEnabled) {
    // Send email capture message
    await sendEmailCaptureMessage(trigger, account, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: {
        conversationStep: 'waiting_email',
        status: 'waiting_email'
      }
    });
  } else {
    // Send the final message with link
    await sendFinalMessage(trigger, account, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: {
        conversationStep: 'link_sent',
        status: 'completed',
        linkSent: true,
        linkSentAt: new Date()
      }
    });
  }
}

/**
 * Handle follow check
 */
async function handleFollowCheck(trigger, account, automation, responseText) {
  // First try Official API follower check
  let isFollowing = false;

  if (account.useOfficialApi && account.accessToken) {
    try {
      isFollowing = await officialApi.checkFollower(account.accessToken, account.igUserId, trigger.commenterIgId);
    } catch (err) {
      console.warn(`[DM Handler] Official API follower check failed:`, err.message);
    }
  }

  // Fallback: check via legacy API
  if (!isFollowing) {
    isFollowing = await checkIfUserIsFollowing(account, trigger.commenterIgId);
  }

  // Fallback: if user explicitly says they're following, trust them
  if (!isFollowing && responseText) {
    const normalized = responseText.toLowerCase().trim();
    const followPhrases = ["i'm following", "im following", "i am following", "followed", "following", "done", "i followed"];
    if (followPhrases.some(phrase => normalized.includes(phrase))) {
      console.log(`[DM Handler] @${trigger.commenterUsername} claims to be following — accepting`);
      isFollowing = true;
    }
  }

  if (!isFollowing) {
    console.log(`[DM Handler] @${trigger.commenterUsername} not following yet`);
    return;
  }

  console.log(`[DM Handler] @${trigger.commenterUsername} is now following!`);

  // Update trigger
  await prisma.trigger.update({
    where: { id: trigger.id },
    data: {
      isFollower: true,
      followedAt: new Date()
    }
  });

  // Check next step
  if (automation.leadCollectionEnabled) {
    await sendEmailCaptureMessage(trigger, account, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: {
        conversationStep: 'waiting_email',
        status: 'waiting_email'
      }
    });
  } else {
    await sendFinalMessage(trigger, account, automation);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: {
        conversationStep: 'link_sent',
        status: 'completed',
        linkSent: true,
        linkSentAt: new Date()
      }
    });
  }
}

/**
 * Handle email capture
 */
async function handleEmailCapture(trigger, account, automation, responseText) {
  // Normalize spaces around @ and dots, then validate email
  const normalizedText = responseText.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.');
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = normalizedText.match(emailRegex);

  if (!emailMatch) {
    console.log(`[DM Handler] No valid email in response: "${responseText}" (normalized: "${normalizedText}")`);
    // Send retry message
    try {
      await sendDMViaAccount(account, trigger.commenterIgId,
        "Hmm, I couldn't detect a valid email address. Could you please send just your email? (e.g. name@gmail.com)");
    } catch (e) {
      console.error('Failed to send email retry message:', e.message);
    }
    return;
  }

  const email = emailMatch[0];
  console.log(`[DM Handler] Captured email from @${trigger.commenterUsername}: ${email}`);

  // Save the lead
  await prisma.lead.create({
    data: {
      automationId: trigger.automationId,
      igUserId: trigger.commenterIgId,
      igUsername: trigger.commenterUsername,
      email: email,
      source: 'dm_conversation'
    }
  });

  // Update trigger
  await prisma.trigger.update({
    where: { id: trigger.id },
    data: {
      emailCollected: email
    }
  });

  // Update automation lead count
  await prisma.automation.update({
    where: { id: trigger.automationId },
    data: {
      leadsCollected: { increment: 1 }
    }
  });

  // Send final message with link
  await sendFinalMessage(trigger, account, automation);
  await prisma.trigger.update({
    where: { id: trigger.id },
    data: {
      conversationStep: 'link_sent',
      status: 'completed',
      linkSent: true,
      linkSentAt: new Date()
    }
  });
}

/**
 * Send follow request message
 */
async function sendFollowRequestMessage(trigger, account, automation) {
  const message = automation.askForFollowMessage ||
    "Nearly there! The link is especially for my followers. Follow me and I'll send you the link right away!";

  try {
    await sendDMViaAccount(account, trigger.commenterIgId, message);

    // Send "I'm following" quick reply button (tappable on both mobile & web)
    if (account.useOfficialApi && account.accessToken) {
      try {
        await officialApi.sendQuickReply(
          account.accessToken,
          account.igUserId,
          trigger.commenterIgId,
          "Tap below once you've followed 👇",
          [{ title: "I'm following", payload: 'follow_confirm' }]
        );
        console.log(`[DM Handler] Sent "I'm following" quick reply button to @${trigger.commenterUsername}`);
      } catch (qrErr) {
        console.warn(`[DM Handler] Quick reply failed, user can type manually:`, qrErr.message);
      }
    }

    console.log(`[DM Handler] Sent follow request to @${trigger.commenterUsername}`);
  } catch (error) {
    console.error('Error sending follow request message:', error);
  }
}

/**
 * Send email capture message
 */
async function sendEmailCaptureMessage(trigger, account, automation) {
  const message = automation.emailAskMessage ||
    automation.leadFields?.emailMessage ||
    "You got it! Before sharing the link, drop your email below to get exclusive content!";

  try {
    await sendDMViaAccount(account, trigger.commenterIgId, message);
    console.log(`[DM Handler] Sent email capture request to @${trigger.commenterUsername}`);
  } catch (error) {
    console.error('Error sending email capture message:', error);
  }
}

/**
 * Send final message with link
 */
async function sendFinalMessage(trigger, account, automation) {
  // Use the saved finalMessage, fall back to CTA URL or generic
  let message = automation.finalMessage ||
    (automation.aiCtaUrl ? `Here's your link: ${automation.aiCtaUrl}` : null) ||
    "Thanks! Here's your link!";

  // If there's a CTA URL and it's not already in the message, append it
  if (automation.aiCtaUrl && !message.includes(automation.aiCtaUrl)) {
    message += `\n\n${automation.aiCtaUrl}`;
  }

  try {
    await sendDMViaAccount(account, trigger.commenterIgId, message);
    console.log(`[DM Handler] Sent final message with link to @${trigger.commenterUsername}`);

    // Record in DM history
    await prisma.dmHistory.create({
      data: {
        igAccountId: account.id,
        recipientIgId: trigger.commenterIgId,
        recipientUsername: trigger.commenterUsername,
        messageSent: message,
        status: 'sent',
        detectedKeyword: trigger.matchedKeyword
      }
    });
  } catch (error) {
    console.error('Error sending final message:', error);
  }
}

/**
 * Check if a user is following the account
 */
async function checkIfUserIsFollowing(account, userId) {
  try {
    return await instagramAPI.isUserFollowing(account, userId);
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
}

/**
 * Manually advance a trigger to the next step (for testing/admin)
 */
async function advanceTrigger(triggerId, newStep) {
  const trigger = await prisma.trigger.findUnique({
    where: { id: triggerId },
    include: {
      automation: {
        include: { instagramAccount: true }
      }
    }
  });

  if (!trigger) {
    throw new Error('Trigger not found');
  }

  const updateData = {
    conversationStep: newStep,
    status: newStep
  };

  if (newStep === 'link_sent' || newStep === 'completed') {
    updateData.linkSent = true;
    updateData.linkSentAt = new Date();
  }

  await prisma.trigger.update({
    where: { id: triggerId },
    data: updateData
  });

  return trigger;
}

module.exports = {
  startConversationHandler,
  stopConversationHandler,
  processConversations,
  advanceTrigger
};
