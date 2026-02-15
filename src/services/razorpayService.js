/**
 * Razorpay Service - Handles all Razorpay API interactions
 * Used for subscription creation, cancellation, and payment verification
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay Subscription for a user
 */
async function createSubscription({ planId, totalCount, customerEmail, notes }) {
  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    total_count: totalCount || 120,
    customer_notify: 0,
    notes: notes || {},
  });
  return subscription;
}

/**
 * Cancel a Razorpay Subscription
 */
async function cancelSubscription(subscriptionId, cancelAtCycleEnd = true) {
  return await razorpay.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

/**
 * Fetch subscription details from Razorpay
 */
async function fetchSubscription(subscriptionId) {
  return await razorpay.subscriptions.fetch(subscriptionId);
}

/**
 * Verify Razorpay webhook signature
 */
function verifyWebhookSignature(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

/**
 * Verify payment signature from Razorpay Checkout callback
 */
function verifyPaymentSignature(razorpaySubscriptionId, razorpayPaymentId, razorpaySignature) {
  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpayPaymentId + '|' + razorpaySubscriptionId)
    .digest('hex');
  return generatedSignature === razorpaySignature;
}

module.exports = {
  createSubscription,
  cancelSubscription,
  fetchSubscription,
  verifyWebhookSignature,
  verifyPaymentSignature,
};
