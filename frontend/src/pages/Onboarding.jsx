import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { instagramAPI } from '../utils/api';

const Onboarding = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [testKeyword, setTestKeyword] = useState('PRICE');

  useEffect(() => {
    checkExistingAccounts();
  }, []);

  const checkExistingAccounts = async () => {
    try {
      const response = await instagramAPI.getAccounts();
      const accountsList = response.data.accounts || [];
      setAccounts(accountsList);
      if (accountsList.length > 0) {
        setCurrentStep(2);
      }
    } catch (error) {
      console.error('Error checking accounts:', error);
    }
  };

  const handleConnectInstagram = () => {
    navigate('/connect-instagram');
  };

  const handleSkipToStep = (step) => {
    setCurrentStep(step);
  };

  const handleComplete = () => {
    localStorage.setItem('onboardingComplete', 'true');
    navigate('/dashboard');
  };

  const steps = [
    { number: 1, title: 'Connect Instagram', description: 'Link your account' },
    { number: 2, title: 'Set Keywords', description: 'Choose trigger words' },
    { number: 3, title: 'You\'re Ready!', description: 'Start automating' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all ${
                    currentStep >= step.number
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {currentStep > step.number ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <p className={`mt-2 text-sm font-medium ${currentStep >= step.number ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {step.title}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-24 h-1 mx-4 rounded ${
                    currentStep > step.number ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                ></div>
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8">
          {/* Step 1: Connect Instagram */}
          {currentStep === 1 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Connect Your Instagram</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                Link your Instagram account to start automating DMs. We use official Meta APIs - your account stays 100% safe.
              </p>

              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 mb-8">
                <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-4">What you'll get:</h3>
                <ul className="text-left space-y-3">
                  <li className="flex items-center gap-3 text-purple-800 dark:text-purple-300">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Auto-DM anyone who comments keywords
                  </li>
                  <li className="flex items-center gap-3 text-purple-800 dark:text-purple-300">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Capture leads with email & phone collection
                  </li>
                  <li className="flex items-center gap-3 text-purple-800 dark:text-purple-300">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Smart follow-ups for non-responders
                  </li>
                </ul>
              </div>

              <button
                onClick={handleConnectInstagram}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold text-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                </svg>
                Connect Instagram Account
              </button>
            </div>
          )}

          {/* Step 2: Set Keywords */}
          {currentStep === 2 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Set Your First Keyword</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                When someone comments this keyword on your Reel, they'll automatically get a DM from you.
              </p>

              {accounts.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-700 dark:text-green-400 font-medium">
                    Connected: @{accounts[0].username}
                  </span>
                </div>
              )}

              <div className="mb-8">
                <label className="block text-left text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Choose a trigger keyword
                </label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {['PRICE', 'LINK', 'INFO', 'BUY', 'DEAL'].map((keyword) => (
                    <button
                      key={keyword}
                      onClick={() => setTestKeyword(keyword)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        testKeyword === keyword
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={testKeyword}
                  onChange={(e) => setTestKeyword(e.target.value.toUpperCase())}
                  placeholder="Or type your own..."
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center text-lg font-medium dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-6 mb-8">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Preview</h3>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full"></div>
                    <div className="flex-1 text-left">
                      <p className="text-sm dark:text-gray-300"><span className="font-medium">@customer</span> commented:</p>
                      <p className="text-gray-600 dark:text-gray-400">"Hey, {testKeyword}!"</p>
                    </div>
                  </div>
                  <div className="mt-3 pl-13 ml-13 border-l-2 border-purple-500 pl-4">
                    <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">↳ Auto DM sent!</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="flex-1 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {currentStep === 3 && (
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">You're All Set! 🎉</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                Your free plan is activated with 50 DMs/month. Create your first automation to start converting comments to customers.
              </p>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl p-6 mb-8">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Your Free Plan Includes:</h3>
                <div className="grid grid-cols-2 gap-4 text-left">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    50 DMs/month
                  </div>
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    1 keyword trigger
                  </div>
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    1 Instagram account
                  </div>
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Basic analytics
                  </div>
                </div>
              </div>

              <button
                onClick={handleComplete}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold text-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all"
              >
                Go to Dashboard
              </button>

              <button
                onClick={() => navigate('/create-automation')}
                className="w-full mt-4 py-4 border-2 border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 rounded-xl font-semibold text-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
              >
                Create My First Automation
              </button>
            </div>
          )}
        </div>

        {/* Skip Link */}
        {currentStep < 3 && (
          <p className="text-center mt-6 text-gray-500 dark:text-gray-400">
            Already know what you're doing?{' '}
            <button
              onClick={() => handleComplete()}
              className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
            >
              Skip to dashboard
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
