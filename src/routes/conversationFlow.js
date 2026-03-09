const express = require('express');
const { protect } = require('../middleware/auth');
const conversationFlowService = require('../services/conversationFlowService');

const router = express.Router();
const prisma = require('../config/prisma');

// ============================================
// CONVERSATION FLOW CRUD
// ============================================

// Create a new conversation flow
router.post('/', protect, async (req, res) => {
  try {
    const {
      automationId,
      name,
      description,
      steps // Array of step objects
    } = req.body;

    // Verify automation belongs to user
    const automation = await prisma.automation.findFirst({
      where: { id: automationId, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Create flow with steps
    const flow = await prisma.conversationFlow.create({
      data: {
        automationId,
        name,
        description,
        flowConfig: { steps },
        steps: {
          create: steps.map((step, index) => ({
            stepOrder: index,
            stepType: step.type,
            messageText: step.messageText,
            attachmentUrl: step.attachmentUrl,
            attachmentType: step.attachmentType,
            buttonText: step.buttonText,
            buttonUrl: step.buttonUrl,
            conditionType: step.conditionType,
            conditionKeywords: step.conditionKeywords || [],
            conditionOperator: step.conditionOperator,
            delayMinutes: step.delayMinutes,
            reminderEnabled: step.reminderEnabled || false,
            nextStepOnSuccess: step.nextStepOnSuccess,
            nextStepOnFailure: step.nextStepOnFailure
          }))
        }
      },
      include: { steps: true }
    });

    res.status(201).json({ flow });
  } catch (error) {
    console.error('Create flow error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all flows for an automation
router.get('/automation/:automationId', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.automationId, userId: req.user.id }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const flows = await prisma.conversationFlow.findMany({
      where: { automationId: req.params.automationId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        _count: { select: { conversations: true } }
      }
    });

    res.json({ flows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single flow
router.get('/:id', protect, async (req, res) => {
  try {
    const flow = await prisma.conversationFlow.findUnique({
      where: { id: req.params.id },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        conversations: {
          take: 10,
          orderBy: { startedAt: 'desc' },
          include: { messages: { take: 5, orderBy: { createdAt: 'desc' } } }
        }
      }
    });

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    res.json({ flow });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update flow
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, description, steps, isActive } = req.body;

    // Delete existing steps and recreate
    await prisma.conversationStep.deleteMany({
      where: { flowId: req.params.id }
    });

    const flow = await prisma.conversationFlow.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        isActive,
        flowConfig: { steps },
        steps: steps ? {
          create: steps.map((step, index) => ({
            stepOrder: index,
            stepType: step.type,
            messageText: step.messageText,
            attachmentUrl: step.attachmentUrl,
            attachmentType: step.attachmentType,
            buttonText: step.buttonText,
            buttonUrl: step.buttonUrl,
            conditionType: step.conditionType,
            conditionKeywords: step.conditionKeywords || [],
            conditionOperator: step.conditionOperator,
            delayMinutes: step.delayMinutes,
            reminderEnabled: step.reminderEnabled || false,
            nextStepOnSuccess: step.nextStepOnSuccess,
            nextStepOnFailure: step.nextStepOnFailure
          }))
        } : undefined
      },
      include: { steps: true }
    });

    res.json({ flow });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete flow
router.delete('/:id', protect, async (req, res) => {
  try {
    await prisma.conversationFlow.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONVERSATION MANAGEMENT
// ============================================

// Get conversations for a flow
router.get('/:id/conversations', protect, async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { flowId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single conversation with all messages
router.get('/conversation/:id', protect, async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        flow: { include: { steps: true } }
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually start a conversation
router.post('/:flowId/start', protect, async (req, res) => {
  try {
    const { igAccountId, userIgId, userUsername } = req.body;

    const conversation = await conversationFlowService.startConversation(
      req.params.flowId,
      igAccountId,
      userIgId,
      userUsername
    );

    res.json({ conversation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCHEDULED REMINDERS
// ============================================

// Create a reminder
router.post('/reminder', protect, async (req, res) => {
  try {
    const {
      automationId,
      igAccountId,
      recipientIgId,
      recipientUsername,
      messageText,
      attachmentUrl,
      attachmentType,
      scheduledAt,
      reminderType,
      recurringInterval,
      maxReminders
    } = req.body;

    const reminder = await prisma.scheduledReminder.create({
      data: {
        automationId,
        igAccountId,
        recipientIgId,
        recipientUsername,
        messageText,
        attachmentUrl,
        attachmentType,
        scheduledAt: new Date(scheduledAt),
        reminderType: reminderType || 'one_time',
        recurringInterval,
        maxReminders: maxReminders || 3,
        status: 'scheduled'
      }
    });

    res.status(201).json({ reminder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reminders for an automation
router.get('/reminders/:automationId', protect, async (req, res) => {
  try {
    const reminders = await prisma.scheduledReminder.findMany({
      where: { automationId: req.params.automationId },
      orderBy: { scheduledAt: 'desc' }
    });

    res.json({ reminders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a reminder
router.delete('/reminder/:id', protect, async (req, res) => {
  try {
    await prisma.scheduledReminder.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BULK MESSAGING (Send to automation users)
// ============================================

// Send message to all users from an automation
router.post('/bulk-message', protect, async (req, res) => {
  try {
    const {
      automationId,
      messageText,
      attachmentUrl,
      attachmentType,
      scheduleAt, // Optional: schedule for later
      targetFilter // "all", "followers_only", "non_followers"
    } = req.body;

    // Get automation and its triggers
    const automation = await prisma.automation.findFirst({
      where: { id: automationId, userId: req.user.id },
      include: {
        triggers: {
          where: { dmSent: true },
          select: {
            commenterIgId: true,
            commenterUsername: true,
            isFollower: true
          }
        }
      }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Filter users based on targetFilter
    let targetUsers = automation.triggers;

    if (targetFilter === 'followers_only') {
      targetUsers = targetUsers.filter(t => t.isFollower === true);
    } else if (targetFilter === 'non_followers') {
      targetUsers = targetUsers.filter(t => t.isFollower === false);
    }

    // Remove duplicates
    const uniqueUsers = [];
    const seen = new Set();
    for (const user of targetUsers) {
      if (!seen.has(user.commenterIgId)) {
        seen.add(user.commenterIgId);
        uniqueUsers.push(user);
      }
    }

    // Schedule reminders for each user
    const scheduledTime = scheduleAt ? new Date(scheduleAt) : new Date();

    const reminders = await Promise.all(uniqueUsers.map((user, index) => {
      // Stagger sends by 2 minutes each to avoid rate limits
      const staggeredTime = new Date(scheduledTime.getTime() + (index * 2 * 60 * 1000));

      return prisma.scheduledReminder.create({
        data: {
          automationId,
          igAccountId: automation.instagramAccountId,
          recipientIgId: user.commenterIgId,
          recipientUsername: user.commenterUsername,
          messageText,
          attachmentUrl,
          attachmentType,
          scheduledAt: staggeredTime,
          reminderType: 'one_time',
          status: 'scheduled'
        }
      });
    }));

    res.json({
      success: true,
      message: `Scheduled ${reminders.length} messages`,
      totalUsers: uniqueUsers.length,
      firstSendAt: scheduledTime,
      lastSendAt: new Date(scheduledTime.getTime() + (uniqueUsers.length * 2 * 60 * 1000))
    });
  } catch (error) {
    console.error('Bulk message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TRIGGER CONVERSATION STEP MANAGEMENT
// ============================================

// Get trigger details with conversation step
router.get('/trigger/:triggerId', protect, async (req, res) => {
  try {
    const trigger = await prisma.trigger.findUnique({
      where: { id: req.params.triggerId },
      include: {
        automation: {
          select: { name: true, userId: true }
        }
      }
    });

    if (!trigger || trigger.automation.userId !== req.user.id) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    res.json({ trigger });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually advance a trigger to the next conversation step
router.post('/trigger/:triggerId/advance', protect, async (req, res) => {
  try {
    const { newStep } = req.body;

    const trigger = await prisma.trigger.findUnique({
      where: { id: req.params.triggerId },
      include: {
        automation: {
          include: { instagramAccount: true }
        }
      }
    });

    if (!trigger || trigger.automation.userId !== req.user.id) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    // Valid steps: opening, waiting_button, waiting_follow, waiting_email, link_sent, completed
    const validSteps = ['opening', 'waiting_button', 'waiting_follow', 'waiting_email', 'link_sent', 'completed'];
    if (!validSteps.includes(newStep)) {
      return res.status(400).json({ error: 'Invalid step. Valid steps: ' + validSteps.join(', ') });
    }

    const updateData = {
      conversationStep: newStep,
      status: newStep
    };

    // Set additional flags based on step
    if (newStep === 'waiting_button') {
      updateData.dmSent = true;
      updateData.dmSentAt = trigger.dmSentAt || new Date();
    } else if (newStep === 'waiting_follow') {
      updateData.buttonClicked = true;
      updateData.buttonClickedAt = new Date();
    } else if (newStep === 'waiting_email') {
      updateData.buttonClicked = true;
      updateData.buttonClickedAt = trigger.buttonClickedAt || new Date();
      updateData.isFollower = true;
      updateData.followedAt = new Date();
    } else if (newStep === 'link_sent' || newStep === 'completed') {
      updateData.buttonClicked = true;
      updateData.linkSent = true;
      updateData.linkSentAt = new Date();
    }

    const updated = await prisma.trigger.update({
      where: { id: req.params.triggerId },
      data: updateData
    });

    res.json({
      success: true,
      message: `Trigger advanced to step: ${newStep}`,
      trigger: updated
    });
  } catch (error) {
    console.error('Advance trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simulate button click (useful for testing)
router.post('/trigger/:triggerId/simulate-click', protect, async (req, res) => {
  try {
    const trigger = await prisma.trigger.findUnique({
      where: { id: req.params.triggerId },
      include: {
        automation: {
          include: { instagramAccount: true }
        }
      }
    });

    if (!trigger || trigger.automation.userId !== req.user.id) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    // Import the conversation handler
    const dmConversationHandler = require('../services/dmConversationHandler');

    // Advance the trigger
    await dmConversationHandler.advanceTrigger(req.params.triggerId, 'link_sent');

    res.json({
      success: true,
      message: 'Button click simulated - trigger advanced to link_sent'
    });
  } catch (error) {
    console.error('Simulate click error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
