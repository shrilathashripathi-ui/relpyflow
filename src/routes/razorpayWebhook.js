/**
 * Razorpay Webhook Handler
 * Handles subscription lifecycle events from Razorpay
 *
 * Events handled:
 * - subscription.activated → activate user's Pro plan
 * - subscription.charged → renew subscription period
 * - subscription.cancelled → mark cancelled, keep access until period end
 * - subscription.halted → mark as past_due
 * - payment.failed → log failure
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const razorpayService = require('../services/razorpayService');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      console.error('❌ Razorpay webhook: missing signature or secret');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify webhook signature (req.body is raw Buffer from express.raw())
    const rawBody = typeof req.body === 'string' ? req.body : req.body.toString();
    const isValid = razorpayService.verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      console.error('❌ Razorpay webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const payload = event.payload;

    console.log(`📩 Razorpay webhook: ${eventType}`);

    switch (eventType) {
      case 'subscription.activated': {
        await handleSubscriptionActivated(payload);
        break;
      }
      case 'subscription.charged': {
        await handleSubscriptionCharged(payload);
        break;
      }
      case 'subscription.cancelled': {
        await handleSubscriptionCancelled(payload);
        break;
      }
      case 'subscription.halted': {
        await handleSubscriptionHalted(payload);
        break;
      }
      case 'payment.failed': {
        await handlePaymentFailed(payload);
        break;
      }
      default:
        console.log(`ℹ️ Unhandled Razorpay event: ${eventType}`);
    }

    // Always respond 200 to acknowledge receipt
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Razorpay webhook error:', error);
    // Still respond 200 to prevent Razorpay retries on our errors
    res.status(200).json({ status: 'error', message: error.message });
  }
});

/**
 * subscription.activated - First successful payment
 */
async function handleSubscriptionActivated(payload) {
  const rzpSubscription = payload.subscription?.entity;
  if (!rzpSubscription) return;

  const subscriptionId = rzpSubscription.id;
  const userId = rzpSubscription.notes?.userId;

  console.log(`✅ Subscription activated: ${subscriptionId} for user ${userId}`);

  const subscription = await prisma.subscription.findFirst({
    where: { paymentProviderSubscriptionId: subscriptionId }
  });

  if (!subscription) {
    console.error(`❌ No DB subscription found for Razorpay ID: ${subscriptionId}`);
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Activate the subscription
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }
  });

  // Upgrade user to Pro
  await prisma.user.update({
    where: { id: subscription.userId },
    data: {
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndsAt: periodEnd,
    }
  });

  console.log(`🎉 User ${subscription.userId} upgraded to Pro via webhook`);
}

/**
 * subscription.charged - Recurring payment successful
 */
async function handleSubscriptionCharged(payload) {
  const rzpSubscription = payload.subscription?.entity;
  const rzpPayment = payload.payment?.entity;
  if (!rzpSubscription) return;

  const subscriptionId = rzpSubscription.id;
  console.log(`💰 Subscription charged: ${subscriptionId}`);

  const subscription = await prisma.subscription.findFirst({
    where: { paymentProviderSubscriptionId: subscriptionId }
  });

  if (!subscription) {
    console.error(`❌ No DB subscription found for Razorpay ID: ${subscriptionId}`);
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Renew the subscription period
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }
  });

  // Ensure user stays on Pro
  await prisma.user.update({
    where: { id: subscription.userId },
    data: {
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndsAt: periodEnd,
    }
  });

  console.log(`🔄 Subscription renewed for user ${subscription.userId} until ${periodEnd.toISOString()}`);
}

/**
 * subscription.cancelled - User or system cancelled
 */
async function handleSubscriptionCancelled(payload) {
  const rzpSubscription = payload.subscription?.entity;
  if (!rzpSubscription) return;

  const subscriptionId = rzpSubscription.id;
  console.log(`🚫 Subscription cancelled: ${subscriptionId}`);

  const subscription = await prisma.subscription.findFirst({
    where: { paymentProviderSubscriptionId: subscriptionId }
  });

  if (!subscription) {
    console.error(`❌ No DB subscription found for Razorpay ID: ${subscriptionId}`);
    return;
  }

  // Mark subscription as cancelled
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'cancelled' }
  });

  // User keeps Pro access until current period ends
  await prisma.user.update({
    where: { id: subscription.userId },
    data: {
      subscriptionStatus: 'cancelled',
      // subscriptionEndsAt stays the same - they keep access until then
    }
  });

  console.log(`📋 User ${subscription.userId} subscription cancelled, access until ${subscription.currentPeriodEnd}`);
}

/**
 * subscription.halted - Payment failures caused subscription to halt
 */
async function handleSubscriptionHalted(payload) {
  const rzpSubscription = payload.subscription?.entity;
  if (!rzpSubscription) return;

  const subscriptionId = rzpSubscription.id;
  console.log(`⚠️ Subscription halted: ${subscriptionId}`);

  const subscription = await prisma.subscription.findFirst({
    where: { paymentProviderSubscriptionId: subscriptionId }
  });

  if (!subscription) {
    console.error(`❌ No DB subscription found for Razorpay ID: ${subscriptionId}`);
    return;
  }

  // Mark as past_due
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'past_due' }
  });

  // Downgrade user to free
  await prisma.user.update({
    where: { id: subscription.userId },
    data: {
      subscriptionPlan: 'free',
      subscriptionStatus: 'past_due',
      subscriptionEndsAt: new Date(), // Access ends now
    }
  });

  console.log(`⬇️ User ${subscription.userId} downgraded due to halted subscription`);
}

/**
 * payment.failed - Individual payment attempt failed
 */
async function handlePaymentFailed(payload) {
  const rzpPayment = payload.payment?.entity;
  if (!rzpPayment) return;

  console.log(`❌ Payment failed: ${rzpPayment.id}`, {
    error_code: rzpPayment.error_code,
    error_description: rzpPayment.error_description,
    error_reason: rzpPayment.error_reason,
  });

  // Just log for now - Razorpay will retry automatically
  // subscription.halted will fire if all retries fail
}

module.exports = router;
