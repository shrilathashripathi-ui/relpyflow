const express = require('express');
const { protect } = require('../middleware/auth');
const conversationFlowService = require('../services/conversationFlowService');

const router = express.Router();
const prisma = require('../config/prisma');

// ============================================
// HELPER: Verify flow belongs to authenticated user
// ============================================
async function verifyFlowOwnership(flowId, userId) {
  return prisma.conversationFlow.findFirst({
    where: {
      id: flowId,
      automation: { userId }
    }
  });
}

async function verifyAutomationOwnership(automationId, userId) {
  return prisma.automation.findFirst({
    where: { id: automationId, userId }
  });
}

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
          create: (steps || []).map((step, index) => ({
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
    console.error('Create flow error:', error.message);
    res.status(500).json({ error: 'Failed to create flow' });
  }
});

// List flows for an automation
router.get('/automation/:automationId', protect, async (req, res) => {
  try {
    // Verify automation belongs to user
    const automation = await verifyAutomationOwnership(req.params.automationId, req.user.id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const flows = await prisma.conversationFlow.findMany({
      where: { automationId: req.params.automationId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ flows });
  } catch (error) {
    console.error('List flows error:', error.message);
    res.status(500).json({ error: 'Failed to load flows' });
  }
});

// Get single flow
router.get('/:id', protect, async (req, res) => {
  try {
    // Ownership check: flow must belong to user's automation
    const flow = await prisma.conversationFlow.findFirst({
      where: {
        id: req.params.id,
        automation: { userId: req.user.id }
      },
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
    console.error('Get flow error:', error.message);
    res.status(500).json({ error: 'Failed to load flow' });
  }
});

// Update flow
router.put('/:id', protect, async (req, res) => {
  try {
    // Ownership check
    const existing = await verifyFlowOwnership(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Flow not found' });
    }

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
    console.error('Update flow error:', error.message);
    res.status(500).json({ error: 'Failed to update flow' });
  }
});

// Delete flow
router.delete('/:id', protect, async (req, res) => {
  try {
    // Ownership check
    const existing = await verifyFlowOwnership(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    await prisma.conversationFlow.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete flow error:', error.message);
    res.status(500).json({ error: 'Failed to delete flow' });
  }
});

// ============================================
// CONVERSATION MANAGEMENT
// ============================================

// Get conversations for a flow
router.get('/:id/conversations', protect, async (req, res) => {
  try {
    // Ownership check
    const flow = await verifyFlowOwnership(req.params.id, req.user.id);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

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
    console.error('Get conversations error:', error.message);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// Get single conversation with all messages
router.get('/conversation/:id', protect, async (req, res) => {
  try {
    // Ownership check: conversation's flow must belong to user's automation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: req.params.id,
        flow: { automation: { userId: req.user.id } }
      },
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
    console.error('Get conversation error:', error.message);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

// Manually start a conversation
router.post('/:flowId/start', protect, async (req, res) => {
  try {
    // Ownership check
    const flow = await verifyFlowOwnership(req.params.flowId, req.user.id);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const { igAccountId, userIgId, userUsername } = req.body;

    const conversation = await conversationFlowService.startConversation(
      req.params.flowId,
      igAccountId,
      userIgId,
      userUsername
    );

    res.json({ conversation });
  } catch (error) {
    console.error('Start conversation error:', error.message);
    res.status(500).json({ error: 'Failed to start conversation' });
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

    // Verify automation belongs to user
    const automation = await verifyAutomationOwnership(automationId, req.user.id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Verify IG account belongs to user
    const account = await prisma.instagramAccount.findFirst({
      where: { id: igAccountId, userId: req.user.id }
    });
    if (!account) {
      return res.status(404).json({ error: 'Instagram account not found' });
    }

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
    console.error('Create reminder error:', error.message);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// Get reminders for an automation
router.get('/reminders/:automationId', protect, async (req, res) => {
  try {
    // Verify automation belongs to user
    const automation = await verifyAutomationOwnership(req.params.automationId, req.user.id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const reminders = await prisma.scheduledReminder.findMany({
      where: { automationId: req.params.automationId },
      orderBy: { scheduledAt: 'desc' }
    });

    res.json({ reminders });
  } catch (error) {
    console.error('Get reminders error:', error.message);
    res.status(500).json({ error: 'Failed to load reminders' });
  }
});

// Cancel a reminder
router.delete('/reminder/:id', protect, async (req, res) => {
  try {
    // Ownership check: reminder's automation must belong to user
    const reminder = await prisma.scheduledReminder.findFirst({
      where: {
        id: req.params.id,
        automation: { userId: req.user.id }
      }
    });
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    await prisma.scheduledReminder.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel reminder error:', error.message);
    res.status(500).json({ error: 'Failed to cancel reminder' });
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
      scheduleAt,
      targetFilter
    } = req.body;

    // Get automation and its triggers (ownership verified)
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
        },
        instagramAccount: true
      }
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    let recipients = automation.triggers;

    // Apply target filter
    if (targetFilter === 'followers_only') {
      recipients = recipients.filter(t => t.isFollower);
    } else if (targetFilter === 'non_followers') {
      recipients = recipients.filter(t => !t.isFollower);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients match the filter' });
    }

    // Queue messages
    const queueEntries = recipients.map(recipient => ({
      igAccountId: automation.instagramAccountId,
      recipientIgId: recipient.commenterIgId,
      recipientUsername: recipient.commenterUsername,
      message: messageText,
      attachmentUrl,
      attachmentType,
      status: 'pending',
      scheduledAt: scheduleAt ? new Date(scheduleAt) : new Date(),
    }));

    await prisma.dmQueue.createMany({ data: queueEntries });

    res.json({
      success: true,
      queued: recipients.length,
      message: `${recipients.length} message(s) queued for delivery`
    });
  } catch (error) {
    console.error('Bulk message error:', error.message);
    res.status(500).json({ error: 'Failed to queue bulk messages' });
  }
});

// ============================================
// TRIGGER MANAGEMENT
// ============================================

// Get trigger details
router.get('/trigger/:triggerId', protect, async (req, res) => {
  try {
    const trigger = await prisma.trigger.findUnique({
      where: { id: req.params.triggerId },
      include: { automation: { select: { userId: true, name: true } } }
    });

    if (!trigger || trigger.automation.userId !== req.user.id) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    res.json({ trigger });
  } catch (error) {
    console.error('Get trigger error:', error.message);
    res.status(500).json({ error: 'Failed to load trigger' });
  }
});

// Advance trigger to next step
router.post('/trigger/:triggerId/advance', protect, async (req, res) => {
  try {
    const trigger = await prisma.trigger.findUnique({
      where: { id: req.params.triggerId },
      include: {
        automation: {
          select: { userId: true },
          include: { instagramAccount: true }
        }
      }
    });

    if (!trigger || trigger.automation.userId !== req.user.id) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    const { advanceTrigger } = require('../services/dmConversationHandler');
    const { newStep } = req.body;

    await advanceTrigger(trigger.id, newStep);

    res.json({ success: true, message: `Trigger advanced to ${newStep}` });
  } catch (error) {
    console.error('Advance trigger error:', error.message);
    res.status(500).json({ error: 'Failed to advance trigger' });
  }
});

// Simulate button click for a trigger
router.post('/trigger/:triggerId/simulate-click', protect, async (req, res) => {
  try {
    const trigger = await prisma.trigger.findUnique({
      where: { id: req.params.triggerId },
      include: {
        automation: {
          select: { userId: true },
          include: { instagramAccount: true }
        }
      }
    });

    if (!trigger || trigger.automation.userId !== req.user.id) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    await prisma.trigger.update({
      where: { id: trigger.id },
      data: {
        buttonClicked: true,
        buttonClickedAt: new Date(),
        conversationStep: 'waiting_follow',
        status: 'waiting_follow'
      }
    });

    res.json({ success: true, message: 'Button click simulated' });
  } catch (error) {
    console.error('Simulate click error:', error.message);
    res.status(500).json({ error: 'Failed to simulate click' });
  }
});

module.exports = router;
