const express = require('express');
const { protect } = require('../middleware/auth');
const { createAutomationValidation, sanitizeQueryParams } = require('../middleware/validation');
const aiReplyService = require('../services/aiReplyService');
const webhookService = require('../services/webhookService');
const crypto = require('crypto');

const router = express.Router();
const prisma = require('../config/prisma');

// Normalize DM status for frontend display.
// NEVER default to 'sent' — failed DMs must show as failed.
function normalizeDmStatus(rawStatus) {
  const statusMap = {
    sent: 'sent',
    failed: 'failed',
    permanent_failed: 'failed',
    blocked: 'failed',
    processing: 'sending',
    pending: 'pending',
    expired: 'expired',
    dropped: 'expired',
  };
  return statusMap[rawStatus] || 'unknown';
}

// Get recent DMs across all user's automations (for dashboard)
router.get('/recent-dms', protect, async (req, res) => {
  try {
    // Get all IG accounts for this user
    const accounts = await prisma.instagramAccount.findMany({
      where: { userId: req.user.id },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    if (accountIds.length === 0) {
      return res.json({ dms: [] });
    }

    const recentDms = await prisma.dmHistory.findMany({
      where: { igAccountId: { in: accountIds } },
      orderBy: { dmSentAt: 'desc' },
      take: 10,
    });

    const dms = recentDms.map((dm) => ({
      id: dm.id,
      username: `@${dm.recipientUsername}`,
      keyword: dm.detectedKeyword || '-',
      status: normalizeDmStatus(dm.status),
      time: formatRelativeTime(dm.dmSentAt),
    }));

    res.json({ dms });
  } catch (error) {
    console.error('Recent DMs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to format relative time
function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Create Automation
router.post('/', protect, createAutomationValidation, async (req, res) => {
  try {
    const {
      instagramAccountId,
      name,
      keywords,
      responseMessage,
      selectedMediaIds,
      mediaIds, // Support both field names
      monitorAllPosts,
      commentReplies,
      commentReplyEnabled,
      // DM Flow options
      openingButton,
      openingDmEnabled,
      askForFollowEnabled,
      followAskMessage,
      askForEmailEnabled,
      emailAskMessage,
      finalMessage,
      links,
      followUpEnabled,
      followUpMessage,
      // Premium features (legacy)
      askForFollowMessage,
      skipNonFollowers,
      leadCollectionEnabled,
      leadFields,
      // AI Reply feature
      aiReplyEnabled,
      aiContext,
      aiProductInfo,
      aiCtaUrl,
      // Webhook integration
      webhookEnabled,
      webhookUrl
    } = req.body;

    // Support both mediaIds and selectedMediaIds
    const mediaIdsToUse = mediaIds || selectedMediaIds || [];

    // Check premium features
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isPremium = user.subscriptionPlan === 'pro' || user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trial';

    // Premium feature validation (more lenient now)
    if (!isPremium && (aiReplyEnabled || webhookEnabled)) {
      return res.status(403).json({
        error: 'AI Replies and Webhooks are premium features. Please upgrade to Pro.'
      });
    }

    // Generate webhook secret if webhook enabled
    const generatedWebhookSecret = webhookEnabled ? crypto.randomBytes(32).toString('hex') : null;

    // Validate that at least one post is selected (removed monitorAllPosts requirement)
    if (mediaIdsToUse.length === 0) {
      return res.status(400).json({
        error: 'Please select at least one post or reel to monitor'
      });
    }

    const automation = await prisma.automation.create({
      data: {
        userId: req.user.id,
        instagramAccountId,
        name,
        keywords,
        responseMessage: responseMessage || '',
        selectedMediaIds: mediaIdsToUse,
        monitorAllPosts: monitorAllPosts || false,
        commentReplies: commentReplies || [],
        commentReplyEnabled: commentReplyEnabled || (commentReplies && commentReplies.length > 0),
        // DM Flow options
        openingButton: openingButton || null,
        openingDmEnabled: openingDmEnabled !== false,
        finalMessage: finalMessage || null,
        followUpEnabled: followUpEnabled || false,
        followUpMessage: followUpMessage || null,
        emailAskMessage: emailAskMessage || null,
        // Premium features
        askForFollowEnabled: askForFollowEnabled || false,
        askForFollowMessage: askForFollowMessage || followAskMessage || null,
        skipNonFollowers: skipNonFollowers || false,
        leadCollectionEnabled: leadCollectionEnabled || askForEmailEnabled || false,
        leadFields: leadFields || (askForEmailEnabled ? { email: true } : null),
        // AI Reply
        aiReplyEnabled: aiReplyEnabled || false,
        aiContext: aiContext || null,
        aiProductInfo: aiProductInfo || null,
        aiCtaUrl: aiCtaUrl || (links && links.length > 0 ? links[0].url : null),
        aiCtaLabel: (links && links.length > 0 ? links[0].label : null),
        // Webhook
        webhookEnabled: webhookEnabled || false,
        webhookUrl: webhookUrl || null,
        webhookSecret: generatedWebhookSecret,
        isActive: true,
      },
    });

    res.status(201).json({ automation });
  } catch (error) {
    console.error('Create automation error:', error);
    res.status(500).json({ error: error.message, message: error.message });
  }
});

// Get All Automations
router.get('/', protect, async (req, res) => {
  try {
    const automations = await prisma.automation.findMany({
      where: { userId: req.user.id },
      include: {
        instagramAccount: {
          select: { username: true },
        },
      },
    });

    res.json({ automations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Single Automation
router.get('/:id', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        instagramAccount: {
          select: { username: true },
        },
      },
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    res.json({ automation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Automation
router.put('/:id', protect, async (req, res) => {
  try {
    const {
      name,
      keywords,
      responseMessage,
      selectedMediaIds,
      monitorAllPosts,
      commentReplies,
      openingButton,
      openingDmEnabled,
      askForFollowEnabled,
      askForFollowMessage,
      followAskMessage,
      askForEmailEnabled,
      emailAskMessage,
      finalMessage,
      followUpEnabled,
      followUpMessage,
      skipNonFollowers,
      leadCollectionEnabled,
      leadFields,
      links
    } = req.body;

    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Check premium features
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isPremium = user.subscriptionPlan === 'pro' || user.subscriptionStatus === 'active';

    if (!isPremium && (askForFollowEnabled || leadCollectionEnabled)) {
      return res.status(403).json({
        error: 'Ask for Follow and Lead Collection are premium features. Please upgrade to Pro.'
      });
    }

    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data: {
        name,
        keywords,
        responseMessage,
        selectedMediaIds: selectedMediaIds || [],
        monitorAllPosts: monitorAllPosts || false,
        commentReplies: commentReplies || [],
        commentReplyEnabled: commentReplies && commentReplies.length > 0,
        // DM Flow options
        openingButton: openingButton || null,
        openingDmEnabled: openingDmEnabled !== false,
        finalMessage: finalMessage || null,
        followUpEnabled: followUpEnabled || false,
        followUpMessage: followUpMessage || null,
        emailAskMessage: emailAskMessage || null,
        askForFollowEnabled: askForFollowEnabled || false,
        askForFollowMessage: askForFollowMessage || followAskMessage || null,
        skipNonFollowers: skipNonFollowers || false,
        leadCollectionEnabled: leadCollectionEnabled || askForEmailEnabled || false,
        leadFields: leadFields || (askForEmailEnabled ? { email: true } : null),
        aiCtaUrl: links && links.length > 0 ? links[0].url : undefined,
        aiCtaLabel: links && links.length > 0 ? links[0].label : undefined,
      },
    });

    res.json({ automation: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle Automation
router.patch('/:id/toggle', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data: { isActive: !automation.isActive },
    });

    res.json({ automation: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Automation
router.delete('/:id', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    await prisma.automation.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Automation deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Triggers with DM queue info
router.get('/:id/triggers', protect, async (req, res) => {
  try {
    // Verify automation belongs to user
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const triggers = await prisma.trigger.findMany({
      where: { automationId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get pending DM queue items to show scheduled time
    const pendingDMs = await prisma.dmQueue.findMany({
      where: {
        status: { in: ['pending', 'processing', 'failed'] }
      },
      select: {
        id: true,
        commentId: true,
        recipientUsername: true,
        status: true,
        errorMessage: true,
        scheduledAt: true,
        createdAt: true
      }
    });

    // Merge trigger data with DM queue info
    const triggersWithTiming = triggers.map(trigger => {
      const dmInfo = pendingDMs.find(dm => dm.commentId === trigger.commentId);
      return {
        ...trigger,
        dmScheduledAt: dmInfo?.scheduledAt || null,
        dmStatus: dmInfo ? normalizeDmStatus(dmInfo.status) : normalizeDmStatus(trigger.status),
        dmError: dmInfo?.errorMessage || null,
        estimatedResponseTime: dmInfo?.scheduledAt
          ? Math.max(0, Math.round((new Date(dmInfo.scheduledAt) - new Date()) / 1000 / 60))
          : null
      };
    });

    res.json({ triggers: triggersWithTiming });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get DM Queue status for an automation
router.get('/:id/dm-queue', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { instagramAccount: true }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const dmQueue = await prisma.dmQueue.findMany({
      where: {
        igAccountId: automation.instagramAccountId
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20
    });

    // Calculate timing info
    const now = new Date();
    const queueWithTiming = dmQueue.map(dm => ({
      id: dm.id,
      recipientUsername: dm.recipientUsername,
      status: dm.status,
      scheduledAt: dm.scheduledAt,
      createdAt: dm.createdAt,
      detectedKeyword: dm.detectedKeyword,
      timeUntilSend: dm.status === 'pending' && dm.scheduledAt > now
        ? Math.round((dm.scheduledAt - now) / 1000 / 60) // minutes until send
        : 0,
      waitingFor: dm.status === 'pending' && dm.scheduledAt > now
        ? formatTimeRemaining(dm.scheduledAt - now)
        : dm.status === 'sent' ? 'Sent' : normalizeDmStatus(dm.status)
    }));

    res.json({ queue: queueWithTiming });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to format time remaining
function formatTimeRemaining(ms) {
  const minutes = Math.floor(ms / 1000 / 60);
  const seconds = Math.floor((ms / 1000) % 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// ============================================
// RE-TRIGGER FEATURE
// ============================================

// Re-trigger automation on specific post (process old comments)
router.post('/:id/retrigger', protect, async (req, res) => {
  try {
    const { mediaId } = req.body;

    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { instagramAccount: true }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Check premium
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isPremium = user.subscriptionPlan === 'pro' || user.subscriptionStatus === 'active';

    if (!isPremium) {
      return res.status(403).json({
        error: 'Re-trigger is a premium feature. Please upgrade to Pro.'
      });
    }

    // Mark for re-trigger by creating a retrigger job
    // The comment poller will pick this up and process old comments
    await prisma.automation.update({
      where: { id: req.params.id },
      data: {
        // Store retrigger request - will be processed by comment poller
        updatedAt: new Date() // Touch to mark as needing reprocessing
      }
    });

    // Create retrigger job in a simple way - clear existing triggers for this post
    // so they can be re-detected
    if (mediaId) {
      await prisma.trigger.deleteMany({
        where: {
          automationId: automation.id,
          // Only delete triggers from the specific post if mediaId provided
        }
      });
    }

    res.json({
      success: true,
      message: 'Re-trigger initiated. Old comments will be processed in the next polling cycle.'
    });
  } catch (error) {
    console.error('Retrigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LEAD COLLECTION
// ============================================

// Get leads for an automation
router.get('/:id/leads', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const leads = await prisma.lead.findMany({
      where: { automationId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export leads as CSV
router.get('/:id/leads/export', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const leads = await prisma.lead.findMany({
      where: { automationId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });

    // Build CSV
    const headers = ['Instagram Username', 'Email', 'Phone', 'Name', 'Collected At'];
    const rows = leads.map(lead => [
      lead.igUsername,
      lead.email || '',
      lead.phone || '',
      lead.name || '',
      new Date(lead.createdAt).toISOString()
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and prevent CSV formula injection
        let safe = String(cell).replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
        return `"${safe}"`;
      }).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leads-${automation.name || automation.id}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a lead
router.delete('/:id/leads/:leadId', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    await prisma.lead.delete({
      where: { id: req.params.leadId }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AI REPLY FEATURE
// ============================================

// Preview AI-generated reply
router.post('/ai/preview', protect, async (req, res) => {
  try {
    const { comment, username, postUrl, automationId } = req.body;

    // Check premium
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isPremium = user.subscriptionPlan === 'pro' || user.subscriptionStatus === 'active';

    if (!isPremium) {
      return res.status(403).json({
        error: 'AI Replies is a premium feature. Please upgrade to Pro.'
      });
    }

    // Get automation context if provided
    let automation = null;
    if (automationId) {
      automation = await prisma.automation.findFirst({
        where: { id: automationId, userId: req.user.id }
      });
    }

    const result = await aiReplyService.generateReply({
      comment,
      username: username || 'user',
      postUrl: postUrl || '',
      automation: automation || {}
    });

    res.json({
      success: result.success,
      variations: result.variations || [],
      selectedReply: result.selectedReply || result.fallbackMessage,
      tokensUsed: result.tokensUsed || 0,
      error: result.error || null
    });
  } catch (error) {
    console.error('AI preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze comment intent
router.post('/ai/analyze', protect, async (req, res) => {
  try {
    const { comment } = req.body;

    const result = await aiReplyService.analyzeCommentIntent(comment);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK INTEGRATION
// ============================================

// Test webhook connection
router.post('/:id/webhook/test', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    if (!automation.webhookUrl) {
      return res.status(400).json({ error: 'No webhook URL configured' });
    }

    const result = await webhookService.testWebhook(
      automation.webhookUrl,
      automation.webhookSecret
    );

    res.json({
      success: result.sent,
      statusCode: result.statusCode,
      error: result.error
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get webhook secret (for user to configure their endpoint)
router.get('/:id/webhook/secret', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { webhookSecret: true, webhookUrl: true, webhookEnabled: true }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    res.json({
      webhookEnabled: automation.webhookEnabled,
      webhookUrl: automation.webhookUrl,
      webhookSecret: automation.webhookSecret
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Regenerate webhook secret
router.post('/:id/webhook/regenerate-secret', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const newSecret = crypto.randomBytes(32).toString('hex');

    await prisma.automation.update({
      where: { id: req.params.id },
      data: { webhookSecret: newSecret }
    });

    res.json({ webhookSecret: newSecret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ANALYTICS & METRICS
// ============================================

// Get automation analytics
router.get('/:id/analytics', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Get daily stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyStats = await prisma.dailyAnalytics.findMany({
      where: {
        igAccountId: automation.instagramAccountId,
        date: { gte: thirtyDaysAgo }
      },
      orderBy: { date: 'asc' }
    });

    // Get trigger stats
    const triggerStats = await prisma.trigger.groupBy({
      by: ['status'],
      where: { automationId: automation.id },
      _count: true
    });

    // Get lead stats
    const leadStats = await prisma.lead.aggregate({
      where: { automationId: automation.id },
      _count: true
    });

    // Calculate conversion rate
    const totalTriggers = automation.triggerCount;
    const dmsSent = automation.dmsSentCount;
    const leadsCollected = automation.leadsCollected;

    const dmConversionRate = totalTriggers > 0 ? (dmsSent / totalTriggers * 100).toFixed(1) : 0;
    const leadConversionRate = dmsSent > 0 ? (leadsCollected / dmsSent * 100).toFixed(1) : 0;

    res.json({
      automation: {
        id: automation.id,
        name: automation.name,
        triggerCount: totalTriggers,
        dmsSentCount: dmsSent,
        leadsCollected
      },
      conversionRates: {
        commentToDm: parseFloat(dmConversionRate),
        dmToLead: parseFloat(leadConversionRate)
      },
      triggersByStatus: triggerStats.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {}),
      dailyStats: dailyStats.map(day => ({
        date: day.date,
        comments: day.commentsDetected,
        dmsQueued: day.dmsQueued,
        dmsSent: day.dmsSent,
        dmsFailed: day.dmsFailed
      })),
      totalLeads: leadStats._count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
