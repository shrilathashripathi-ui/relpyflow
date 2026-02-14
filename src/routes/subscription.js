const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Pricing plans configuration
const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    features: {
      dmsPerMonth: 1000,
      automations: 3,
      igAccounts: 1,
      commentReplies: true,
      askForFollow: false,
      retrigger: false,
      leadCollection: false,
      prioritySupport: false
    }
  },
  pro: {
    name: 'Pro',
    price: 7.99,
    features: {
      dmsPerMonth: -1, // Unlimited
      automations: -1, // Unlimited
      igAccounts: 5,
      commentReplies: true,
      askForFollow: true,
      retrigger: true,
      leadCollection: true,
      prioritySupport: true
    }
  }
};

// Get pricing plans
router.get('/plans', async (req, res) => {
  res.json({ plans: PLANS });
});

// Get current user's subscription status
router.get('/status', protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        usageTracking: {
          where: {
            periodStart: {
              lte: new Date()
            },
            periodEnd: {
              gte: new Date()
            }
          },
          take: 1
        }
      }
    });

    const currentPlan = PLANS[user.subscriptionPlan] || PLANS.free;
    const currentSubscription = user.subscriptions[0] || null;
    const currentUsage = user.usageTracking[0] || null;

    // Calculate days remaining
    let daysRemaining = null;
    if (user.trialEndsAt && user.subscriptionStatus === 'trial') {
      daysRemaining = Math.max(0, Math.ceil((new Date(user.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)));
    } else if (user.subscriptionEndsAt) {
      daysRemaining = Math.max(0, Math.ceil((new Date(user.subscriptionEndsAt) - new Date()) / (1000 * 60 * 60 * 24)));
    }

    res.json({
      plan: user.subscriptionPlan,
      status: user.subscriptionStatus,
      planDetails: currentPlan,
      daysRemaining,
      trialEndsAt: user.trialEndsAt,
      subscriptionEndsAt: user.subscriptionEndsAt,
      currentSubscription,
      usage: {
        dmsSent: currentUsage?.dmsSentCount || 0,
        dmsLimit: currentPlan.features.dmsPerMonth,
        percentUsed: currentPlan.features.dmsPerMonth > 0
          ? Math.round((currentUsage?.dmsSentCount || 0) / currentPlan.features.dmsPerMonth * 100)
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check feature access
router.get('/check-feature/:feature', protect, async (req, res) => {
  try {
    const { feature } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const plan = PLANS[user.subscriptionPlan] || PLANS.free;
    const hasAccess = plan.features[feature] === true || plan.features[feature] === -1;

    res.json({
      feature,
      hasAccess,
      currentPlan: user.subscriptionPlan,
      requiredPlan: hasAccess ? user.subscriptionPlan : 'pro'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upgrade to Pro (creates checkout session - placeholder for payment integration)
router.post('/upgrade', protect, async (req, res) => {
  try {
    // In production, this would create a Stripe/PayPal checkout session
    // For now, we'll just create a mock subscription

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (user.subscriptionPlan === 'pro') {
      return res.status(400).json({ error: 'You are already on the Pro plan' });
    }

    // Create subscription record
    const subscription = await prisma.subscription.create({
      data: {
        userId: req.user.id,
        plan: 'pro',
        status: 'active',
        paymentProvider: 'manual', // Would be 'stripe' or 'paypal' in production
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    // Update user's plan
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
        subscriptionEndsAt: subscription.currentPeriodEnd
      }
    });

    res.json({
      success: true,
      message: 'Successfully upgraded to Pro!',
      subscription
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription
router.post('/cancel', protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: {
          where: { status: 'active' },
          take: 1
        }
      }
    });

    if (user.subscriptionPlan === 'free') {
      return res.status(400).json({ error: 'You are on the free plan' });
    }

    // Cancel subscription (will remain active until end of billing period)
    if (user.subscriptions[0]) {
      await prisma.subscription.update({
        where: { id: user.subscriptions[0].id },
        data: { status: 'cancelled' }
      });
    }

    // Update user - they keep access until subscriptionEndsAt
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        subscriptionStatus: 'cancelled'
      }
    });

    res.json({
      success: true,
      message: 'Subscription cancelled. You will retain Pro access until ' + user.subscriptionEndsAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check and enforce usage limits
router.get('/check-limits', protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const plan = PLANS[user.subscriptionPlan] || PLANS.free;

    // Get current month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    let usage = await prisma.usageTracking.findFirst({
      where: {
        userId: req.user.id,
        periodStart: startOfMonth,
        periodEnd: endOfMonth
      }
    });

    // Create usage record if doesn't exist
    if (!usage) {
      usage = await prisma.usageTracking.create({
        data: {
          userId: req.user.id,
          periodStart: startOfMonth,
          periodEnd: endOfMonth,
          dmsSentCount: 0
        }
      });
    }

    // Check limits
    const dmsRemaining = plan.features.dmsPerMonth === -1
      ? -1 // Unlimited
      : Math.max(0, plan.features.dmsPerMonth - usage.dmsSentCount);

    const automationCount = await prisma.automation.count({
      where: { userId: req.user.id }
    });

    const accountCount = await prisma.instagramAccount.count({
      where: { userId: req.user.id }
    });

    res.json({
      limits: {
        dms: {
          used: usage.dmsSentCount,
          limit: plan.features.dmsPerMonth,
          remaining: dmsRemaining,
          exceeded: dmsRemaining === 0
        },
        automations: {
          used: automationCount,
          limit: plan.features.automations,
          remaining: plan.features.automations === -1 ? -1 : Math.max(0, plan.features.automations - automationCount),
          exceeded: plan.features.automations !== -1 && automationCount >= plan.features.automations
        },
        accounts: {
          used: accountCount,
          limit: plan.features.igAccounts,
          remaining: plan.features.igAccounts === -1 ? -1 : Math.max(0, plan.features.igAccounts - accountCount),
          exceeded: plan.features.igAccounts !== -1 && accountCount >= plan.features.igAccounts
        }
      },
      needsUpgrade: dmsRemaining === 0 ||
        (plan.features.automations !== -1 && automationCount >= plan.features.automations) ||
        (plan.features.igAccounts !== -1 && accountCount >= plan.features.igAccounts)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start free trial
router.post('/start-trial', protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (user.subscriptionStatus !== 'trial' && user.trialEndsAt) {
      return res.status(400).json({ error: 'Trial already used' });
    }

    // Start 14-day trial with Pro features
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        subscriptionPlan: 'pro',
        subscriptionStatus: 'trial',
        trialEndsAt: trialEnd
      }
    });

    res.json({
      success: true,
      message: 'Pro trial started! You have 14 days to try all premium features.',
      trialEndsAt: trialEnd
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
