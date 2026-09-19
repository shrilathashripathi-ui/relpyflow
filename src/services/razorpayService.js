/**
 * Razorpay Service - Handles all Razorpay API interactions
 * Used for subscription creation, cancellation, and payment verification
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');

// Payments are optional. The app boots fine without Razorpay keys — billing endpoints
// simply return a clear error until RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are configured.
const isConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const razorpay = isConfigured
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

if (!isConfigured) {
  console.warn('[razorpay] RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET not set — payment features are disabled.');
}

function requireRazorpay() {
  if (!razorpay) {
    throw new Error('Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable billing.');
  }
  return razorpay;
}

/**
 * Create a Razorpay Subscription for a user
 */
async function createSubscription({ planId, totalCount, customerEmail, notes }) {
  const subscription = await requireRazorpay().subscriptions.create({
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
  return await requireRazorpay().subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

/**
 * Fetch subscription details from Razorpay
 */
async function fetchSubscription(subscriptionId) {
  return await requireRazorpay().subscriptions.fetch(subscriptionId);
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
