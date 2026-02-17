const { PrismaClient } = require('@prisma/client');
const PuppeteerDMService = require('./instagram/puppeteerDmService');

const prisma = new PrismaClient();

class ConversationFlowService {
  /**
   * Start a new conversation for a user
   */
  async startConversation(flowId, igAccountId, userIgId, userUsername) {
    console.log(`🎬 Starting conversation flow for @${userUsername}`);

    // Check if conversation already exists
    const existing = await prisma.conversation.findUnique({
      where: {
        flowId_userIgId: { flowId, userIgId }
      }
    });

    if (existing && existing.status === 'active') {
      console.log(`   ⚠️ Conversation already active for @${userUsername}`);
      return existing;
    }

    // Get the flow and first step
    const flow = await prisma.conversationFlow.findUnique({
      where: { id: flowId },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' }
        }
      }
    });

    if (!flow || !flow.steps.length) {
      throw new Error('Flow not found or has no steps');
    }

    const firstStep = flow.steps[0];

    // Create or update conversation
    const conversation = await prisma.conversation.upsert({
      where: {
        flowId_userIgId: { flowId, userIgId }
      },
      update: {
        status: 'active',
        currentStepId: firstStep.id,
        lastMessageSentAt: null,
        lastReplyReceivedAt: null,
        reminderCount: 0
      },
      create: {
        flowId,
        igAccountId,
        userIgId,
        userUsername,
        currentStepId: firstStep.id,
        status: 'active'
      }
    });

    // Execute the first step
    await this.executeStep(conversation.id, firstStep);

    return conversation;
  }

  /**
   * Execute a conversation step
   */
  async executeStep(conversationId, step) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { flow: true }
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    console.log(`   📍 Executing step: ${step.stepType} (order: ${step.stepOrder})`);

    switch (step.stepType) {
      case 'message':
        await this.executeMessageStep(conversation, step);
        break;

      case 'condition':
        await this.executeConditionStep(conversation, step);
        break;

      case 'delay':
        await this.executeDelayStep(conversation, step);
        break;

      case 'reminder':
        await this.executeReminderStep(conversation, step);
        break;

      case 'ask_follow':
        await this.executeAskFollowStep(conversation, step);
        break;

      default:
        console.log(`   ⚠️ Unknown step type: ${step.stepType}`);
    }
  }

  /**
   * Send a message step
   */
  async executeMessageStep(conversation, step) {
    const { userUsername, igAccountId } = conversation;

    // Get account
    const account = await prisma.instagramAccount.findUnique({
      where: { id: igAccountId }
    });

    if (!account) {
      throw new Error('Instagram account not found');
    }

    // Build message with optional attachment
    let message = step.messageText || '';

    // Add link if provided
    if (step.attachmentUrl && step.attachmentType === 'link') {
      if (step.buttonText) {
        message += `\n\n${step.buttonText}: ${step.attachmentUrl}`;
      } else {
        message += `\n\n${step.attachmentUrl}`;
      }
    }

    // Send the DM
    const dmService = new PuppeteerDMService(account);
    try {
      await dmService.init();
      const isValid = await dmService.isSessionValid();

      if (!isValid) {
        throw new Error('Session invalid');
      }

      await dmService.sendDM(userUsername, message);

      // Log the message
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          stepId: step.id,
          direction: 'outgoing',
          messageText: message,
          attachmentUrl: step.attachmentUrl,
          status: 'sent',
          sentAt: new Date()
        }
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageSentAt: new Date(),
          status: step.nextStepOnSuccess ? 'waiting_reply' : 'active'
        }
      });

      // Move to next step if no waiting required
      if (step.nextStepOnSuccess && !step.conditionType) {
        const nextStep = await prisma.conversationStep.findUnique({
          where: { id: step.nextStepOnSuccess }
        });
        if (nextStep) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { currentStepId: nextStep.id }
          });
          await this.executeStep(conversation.id, nextStep);
        }
      }

      console.log(`   ✅ Message sent to @${userUsername}`);

    } catch (error) {
      console.error(`   ❌ Failed to send message: ${error.message}`);

      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          stepId: step.id,
          direction: 'outgoing',
          messageText: message,
          status: 'failed',
          errorMessage: error.message
        }
      });
    } finally {
      await dmService.close();
    }
  }

  /**
   * Execute condition step (wait for user reply)
   */
  async executeConditionStep(conversation, step) {
    // Mark conversation as waiting for reply
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        currentStepId: step.id,
        status: 'waiting_reply'
      }
    });

    console.log(`   ⏳ Waiting for user reply with condition: ${step.conditionType}`);
  }

  /**
   * Execute delay step
   */
  async executeDelayStep(conversation, step) {
    const delayMs = (step.delayMinutes || 0) * 60 * 1000;

    console.log(`   ⏰ Delay step: waiting ${step.delayMinutes} minutes`);

    // Schedule the next step
    if (step.nextStepOnSuccess) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          currentStepId: step.nextStepOnSuccess,
          nextReminderAt: new Date(Date.now() + delayMs)
        }
      });
    }
  }

  /**
   * Execute reminder step
   */
  async executeReminderStep(conversation, step) {
    const { userIgId, userUsername, igAccountId, flowId } = conversation;

    // Schedule reminder
    await prisma.scheduledReminder.create({
      data: {
        automationId: flowId, // Using flowId as reference
        igAccountId,
        recipientIgId: userIgId,
        recipientUsername: userUsername,
        messageText: step.messageText || 'Just a friendly reminder!',
        attachmentUrl: step.attachmentUrl,
        attachmentType: step.attachmentType,
        scheduledAt: new Date(Date.now() + (step.delayMinutes || 60) * 60 * 1000),
        reminderType: 'one_time',
        status: 'scheduled'
      }
    });

    console.log(`   📅 Reminder scheduled for @${userUsername} in ${step.delayMinutes || 60} minutes`);

    // Move to next step
    if (step.nextStepOnSuccess) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { currentStepId: step.nextStepOnSuccess }
      });
    }
  }

  /**
   * Execute ask for follow step
   */
  async executeAskFollowStep(conversation, step) {
    const { userUsername, igAccountId } = conversation;

    const account = await prisma.instagramAccount.findUnique({
      where: { id: igAccountId }
    });

    const dmService = new PuppeteerDMService(account);

    try {
      await dmService.init();
      const isValid = await dmService.isSessionValid();

      if (!isValid) {
        throw new Error('Session invalid');
      }

      // Check if user follows
      const followerCheck = await dmService.checkIfFollower(userUsername);

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { isFollower: followerCheck.isFollower }
      });

      if (followerCheck.isFollower) {
        console.log(`   ✅ @${userUsername} is a follower, proceeding to success path`);
        if (step.nextStepOnSuccess) {
          const nextStep = await prisma.conversationStep.findUnique({
            where: { id: step.nextStepOnSuccess }
          });
          if (nextStep) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { currentStepId: nextStep.id }
            });
            await this.executeStep(conversation.id, nextStep);
          }
        }
      } else {
        console.log(`   ❌ @${userUsername} is not a follower, proceeding to failure path`);
        if (step.nextStepOnFailure) {
          const nextStep = await prisma.conversationStep.findUnique({
            where: { id: step.nextStepOnFailure }
          });
          if (nextStep) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { currentStepId: nextStep.id }
            });
            await this.executeStep(conversation.id, nextStep);
          }
        }
      }
    } finally {
      await dmService.close();
    }
  }

  /**
   * Handle incoming DM reply from user
   */
  async handleUserReply(igAccountId, userIgId, replyText) {
    console.log(`📩 Received reply from user: "${replyText}"`);

    // Find active conversation for this user
    const conversation = await prisma.conversation.findFirst({
      where: {
        igAccountId,
        userIgId,
        status: 'waiting_reply'
      },
      include: {
        flow: {
          include: {
            steps: true
          }
        }
      }
    });

    if (!conversation) {
      console.log(`   No active conversation waiting for reply from this user`);
      return null;
    }

    // Log incoming message
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'incoming',
        messageText: replyText,
        status: 'sent'
      }
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastReplyReceivedAt: new Date(),
        lastReplyText: replyText
      }
    });

    // Get current step
    const currentStep = conversation.flow.steps.find(s => s.id === conversation.currentStepId);

    if (!currentStep) {
      console.log(`   ⚠️ No current step found`);
      return conversation;
    }

    // Evaluate condition if it's a condition step
    if (currentStep.stepType === 'condition' || currentStep.conditionType) {
      const conditionMet = this.evaluateCondition(currentStep, replyText);

      console.log(`   Condition evaluated: ${conditionMet ? 'MET' : 'NOT MET'}`);

      const nextStepId = conditionMet ? currentStep.nextStepOnSuccess : currentStep.nextStepOnFailure;

      if (nextStepId) {
        const nextStep = conversation.flow.steps.find(s => s.id === nextStepId);
        if (nextStep) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              currentStepId: nextStep.id,
              status: 'active'
            }
          });
          await this.executeStep(conversation.id, nextStep);
        }
      } else {
        // No next step, complete conversation
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'completed', completedAt: new Date() }
        });
      }
    }

    return conversation;
  }

  /**
   * Evaluate a condition against user reply
   */
  evaluateCondition(step, replyText) {
    const { conditionType, conditionKeywords, conditionOperator } = step;
    const normalizedReply = replyText.toLowerCase().trim();

    if (conditionType === 'any_reply') {
      return true;
    }

    if (conditionType === 'keyword' && conditionKeywords.length > 0) {
      for (const keyword of conditionKeywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();

        switch (conditionOperator) {
          case 'equals':
            if (normalizedReply === normalizedKeyword) return true;
            break;
          case 'starts_with':
            if (normalizedReply.startsWith(normalizedKeyword)) return true;
            break;
          case 'contains':
          default:
            if (normalizedReply.includes(normalizedKeyword)) return true;
            break;
        }
      }
    }

    return false;
  }

  /**
   * Process scheduled reminders
   */
  async processReminders() {
    const dueReminders = await prisma.scheduledReminder.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: new Date() }
      },
      take: 10
    });

    console.log(`📬 Processing ${dueReminders.length} due reminders...`);

    for (const reminder of dueReminders) {
      await this.sendReminder(reminder);
    }
  }

  /**
   * Send a reminder
   */
  async sendReminder(reminder) {
    const { recipientUsername, igAccountId, messageText, attachmentUrl, attachmentType } = reminder;

    const account = await prisma.instagramAccount.findUnique({
      where: { id: igAccountId }
    });

    if (!account) {
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: { status: 'cancelled' }
      });
      return;
    }

    let message = messageText;
    if (attachmentUrl && attachmentType === 'link') {
      message += `\n\n${attachmentUrl}`;
    }

    const dmService = new PuppeteerDMService(account);

    try {
      await dmService.init();
      const isValid = await dmService.isSessionValid();

      if (!isValid) {
        throw new Error('Session invalid');
      }

      await dmService.sendDM(recipientUsername, message);

      // Update reminder
      await prisma.scheduledReminder.update({
        where: { id: reminder.id },
        data: {
          status: reminder.remindersSent + 1 >= reminder.maxReminders ? 'completed' : 'sent',
          remindersSent: { increment: 1 },
          sentAt: new Date()
        }
      });

      console.log(`   ✅ Reminder sent to @${recipientUsername}`);

    } catch (error) {
      console.error(`   ❌ Failed to send reminder: ${error.message}`);
    } finally {
      await dmService.close();
    }
  }
}

module.exports = new ConversationFlowService();
