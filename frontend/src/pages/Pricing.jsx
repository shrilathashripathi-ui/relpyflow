import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { subscriptionAPI } from '../utils/api';

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';

const Pricing = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await subscriptionAPI.getStatus();
      setSubscription(response.data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      // Step 1: Create Razorpay subscription on backend
      const response = await subscriptionAPI.upgrade();
      const { razorpaySubscriptionId, razorpayPlanId, amount, currency, userName, userEmail } = response.data;

      // Step 2: Open Razorpay Checkout
      const options = {
        key: RAZORPAY_KEY_ID,
        subscription_id: razorpaySubscriptionId,
        name: 'Replyflows',
        description: 'Pro Plan - Monthly Subscription',
        image: '/vite.svg',
        handler: async function (response) {
          // Step 3: Verify payment on backend
          try {
            await subscriptionAPI.verifyPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
            });
            await fetchSubscription();
            alert('Payment successful! Welcome to Pro!');
          } catch (err) {
            console.error('Payment verification failed:', err);
            alert('Payment received but verification failed. Please contact support.');
          }
        },
        prefill: {
          name: userName || '',
          email: userEmail || '',
        },
        theme: {
          color: '#9333ea', // purple-600
        },
        modal: {
          ondismiss: function () {
            setUpgrading(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        alert('Payment failed: ' + (response.error?.description || 'Unknown error'));
        setUpgrading(false);
      });
      rzp.open();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to initiate payment');
      setUpgrading(false);
    }
  };

  const handleStartTrial = async () => {
    setUpgrading(true);
    try {
      await subscriptionAPI.startTrial();
      await fetchSubscription();
      alert('Pro trial started! You have 14 days to try all premium features.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to start trial');
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your Pro subscription? You will keep access until the end of your billing period.')) {
      return;
    }
    try {
      const response = await subscriptionAPI.cancel();
      await fetchSubscription();
      alert(response.data.message || 'Subscription cancelled.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to cancel subscription');
    }
  };

  const isPro = subscription?.plan === 'pro' && subscription?.status !== 'cancelled';
  const isTrial = subscription?.status === 'trial';
  const isCancelled = subscription?.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-500">
            Start for free, upgrade when you need more
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {/* Current Plan Banner */}
            {subscription && (
              <div className={`mb-8 p-4 rounded-xl ${isPro ? 'bg-purple-100' : isTrial ? 'bg-yellow-100' : isCancelled ? 'bg-orange-100' : 'bg-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`font-semibold ${isPro ? 'text-purple-800' : isTrial ? 'text-yellow-800' : isCancelled ? 'text-orange-800' : 'text-gray-800'}`}>
                      Current Plan: {subscription.plan === 'pro' ? 'Pro' : 'Free'}
                      {isTrial && ' (Trial)'}
                      {isCancelled && ' (Cancelled)'}
                    </span>
                    {subscription.daysRemaining !== null && (
                      <span className="ml-2 text-sm text-gray-600">
                        {isCancelled ? '• Access ends in' : '•'} {subscription.daysRemaining} days remaining
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {subscription.usage && (
                      <div className="text-sm text-gray-600">
                        DMs used: {subscription.usage.dmsSent} / {subscription.usage.dmsLimit === -1 ? '\u221E' : subscription.usage.dmsLimit}
                      </div>
                    )}
                    {isPro && !isTrial && (
                      <button
                        onClick={handleCancel}
                        className="text-sm text-red-500 hover:text-red-700 font-medium"
                      >
                        Cancel Plan
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pricing Cards */}
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Free Plan */}
              <div className={`bg-white rounded-2xl shadow-sm p-8 border-2 ${!isPro && !isTrial ? 'border-purple-500' : 'border-transparent'}`}>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-800">Free</h3>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-gray-800">{'\u20B9'}0</span>
                    <span className="text-gray-500">/month</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">1,000 DMs per month</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">3 Automations</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">1 Instagram Account</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Comment Replies</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-gray-400">Ask for Follow</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-gray-400">Re-trigger</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-gray-400">Lead Collection</span>
                  </li>
                </ul>

                {!isPro && !isTrial ? (
                  <button
                    disabled
                    className="w-full py-3 bg-gray-200 text-gray-600 rounded-xl font-semibold"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-3 bg-gray-100 text-gray-400 rounded-xl font-semibold"
                  >
                    Downgrade
                  </button>
                )}
              </div>

              {/* Pro Plan */}
              <div className={`bg-white rounded-2xl shadow-lg p-8 border-2 ${isPro || isTrial ? 'border-purple-500' : 'border-transparent'} relative`}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    MOST POPULAR
                  </span>
                </div>

                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-800">Pro</h3>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-gray-800">{'\u20B9'}499</span>
                    <span className="text-gray-500">/month</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 font-semibold">Unlimited DMs</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 font-semibold">Unlimited Automations</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">5 Instagram Accounts</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Comment Replies</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Ask for Follow</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Re-trigger Old Posts</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Lead Collection</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">AI-Powered Replies</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Webhooks Integration</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">Priority Support</span>
                  </li>
                </ul>

                {isPro && !isTrial ? (
                  <button
                    disabled
                    className="w-full py-3 bg-purple-100 text-purple-700 rounded-xl font-semibold"
                  >
                    Current Plan
                  </button>
                ) : isTrial ? (
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {upgrading ? 'Processing...' : 'Upgrade Now'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={handleUpgrade}
                      disabled={upgrading}
                      className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                    >
                      {upgrading ? 'Processing...' : 'Upgrade to Pro - \u20B9499/mo'}
                    </button>
                    <button
                      onClick={handleStartTrial}
                      disabled={upgrading}
                      className="w-full py-2 text-purple-600 font-medium hover:underline"
                    >
                      Start 14-day free trial
                    </button>
                    <p className="text-center text-xs text-gray-400">
                      UPI, Cards, Net Banking accepted
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* FAQ Section */}
            <div className="mt-16 max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-800 text-center mb-8">
                Frequently Asked Questions
              </h2>

              <div className="space-y-4">
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-2">What happens when I hit my DM limit?</h3>
                  <p className="text-gray-600">
                    On the free plan, once you've sent 1,000 DMs in a month, your automations will pause until the next month starts. Upgrade to Pro for unlimited DMs.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-2">Can I cancel anytime?</h3>
                  <p className="text-gray-600">
                    Yes! You can cancel your subscription at any time. You'll keep Pro access until the end of your billing period.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-2">What payment methods are accepted?</h3>
                  <p className="text-gray-600">
                    We accept UPI, all major credit/debit cards, and net banking through Razorpay's secure payment gateway.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-2">What is "Ask for Follow"?</h3>
                  <p className="text-gray-600">
                    This feature checks if the commenter follows your account. If they don't, you can send a custom message asking them to follow first before receiving your main content.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-2">What is "Re-trigger"?</h3>
                  <p className="text-gray-600">
                    Re-trigger lets you run your automation on old posts/reels to capture comments you may have missed. Great for turning viral content into leads.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-2">How does Lead Collection work?</h3>
                  <p className="text-gray-600">
                    Lead Collection allows you to gather email addresses, phone numbers, or custom information from users through a conversational DM flow. All leads are exportable as CSV.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Pricing;
