const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');
const razorpayService = require('../services/razorpayService');

const router = express.Router();
const prisma = new PrismaClient();

// Pricing plans configuration
const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    currency: 'INR',
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
    price: 499,
    currency: 'INR',
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

// Upgrade to Pro - Creates Razorpay subscription for checkout
router.post('/upgrade', protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: {
          where: { status: 'active', paymentProvider: 'razorpay' },
          take: 1
        }
      }
    });

    if (user.subscriptionPlan === 'pro' && user.subscriptionStatus === 'active') {
      return res.status(400).json({ error: 'You are already on the Pro plan' });
    }

    // Create Razorpay subscription
    const razorpaySubscription = await razorpayService.createSubscription({
      planId: process.env.RAZORPAY_PLAN_ID,
      totalCount: 120,
      customerEmail: user.email,
      notes: { userId: String(user.id), userEmail: user.email },
    });

    // Store pending subscription in DB
    const subscription = await prisma.subscription.create({
      data: {
        userId: req.user.id,
        plan: 'pro',
        status: 'pending',
        paymentProvider: 'razorpay',
        paymentProviderSubscriptionId: razorpaySubscription.id,
      }
    });

    // Return subscription details for Razorpay Checkout
    res.json({
      success: true,
      subscriptionId: razorpaySubscription.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: PLANS.pro.price,
      currency: 'INR',
      name: 'ReplyFlow Pro',
      description: 'Monthly Pro Subscription - ₹499/month',
      dbSubscriptionId: subscription.id,
    });
  } catch (error) {
    console.error('Razorpay subscription creation failed:', error);
    res.status(500).json({ error: 'Failed to create subscription. Please try again.' });
  }
});

// Verify payment after Razorpay Checkout
router.post('/verify-payment', protect, async (req, res) => {
  try {
    const {
      razorpay_subscription_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // Verify payment signature
    const isValid = razorpayService.verifyPaymentSignature(
      razorpay_subscription_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Find the subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        paymentProviderSubscriptionId: razorpay_subscription_id,
        userId: req.user.id,
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Activate subscription
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      }
    });

    // Update user to Pro
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
        subscriptionEndsAt: periodEnd,
      }
    });

    res.json({
      success: true,
      message: 'Payment verified! You are now on the Pro plan.',
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Cancel subscription
router.post('/cancel', protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: {
          where: { status: 'active', paymentProvider: 'razorpay' },
          take: 1
        }
      }
    });

    if (user.subscriptionPlan === 'free') {
      return res.status(400).json({ error: 'You are on the free plan' });
    }

    const activeSubscription = user.subscriptions[0];

    // Cancel on Razorpay (at end of billing cycle so user keeps access)
    if (activeSubscription?.paymentProviderSubscriptionId) {
      try {
        await razorpayService.cancelSubscription(
          activeSubscription.paymentProviderSubscriptionId,
          true // cancel_at_cycle_end
        );
      } catch (rzpError) {
        console.error('Razorpay cancel error:', rzpError);
        // Continue with DB update even if Razorpay call fails
      }
    }

    // Update subscription in DB
    if (activeSubscription) {
      await prisma.subscription.update({
        where: { id: activeSubscription.id },
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
      message: 'Subscription cancelled. You will retain Pro access until ' + (user.subscriptionEndsAt || 'end of billing period'),
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
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
