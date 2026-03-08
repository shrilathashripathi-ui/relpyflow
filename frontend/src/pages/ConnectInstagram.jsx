import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api, { instagramAPI } from '../utils/api';

const ConnectInstagram = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectLoading, setConnectLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const hasFetched = useRef(false);

  useEffect(() => {
    // Handle OAuth callback params
    const params = new URLSearchParams(window.location.search);

    if (params.get('success') === 'true') {
      setSuccess(`Successfully connected @${params.get('username')}!`);
      window.history.replaceState({}, '', '/connect-instagram');
    }

    if (params.get('error')) {
      setError(params.get('error'));
      window.history.replaceState({}, '', '/connect-instagram');
    }

    // Check if there's a returnTo stored (user was redirected here from another page)
    const storedReturnTo = localStorage.getItem('ig_connect_returnTo');
    if (storedReturnTo && params.get('success') === 'true') {
      localStorage.removeItem('ig_connect_returnTo');
      navigate(storedReturnTo);
      return;
    }

    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchAccounts();
    }
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await instagramAPI.getAccounts();
      setAccounts(response.data.accounts || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectInstagram = async (returnTo) => {
    setConnectLoading(true);
    setError('');

    try {
      // Store returnTo so we can redirect after OAuth callback
      if (returnTo) {
        localStorage.setItem('ig_connect_returnTo', returnTo);
      }
      const response = await instagramAPI.getInstagramAuthUrl(returnTo);
      const authUrl = response.data.authUrl;
      window.location.href = authUrl;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start Instagram login. Please try again.');
      setConnectLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId, username) => {
    if (!confirm(`Are you sure you want to disconnect @${username}?`)) {
      return;
    }

    try {
      await instagramAPI.deleteAccount(accountId);
      setSuccess(`@${username} has been disconnected`);
      fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect account');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
            Connect Instagram Account
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Only a few steps away to go Viral!
          </p>
        </div>

        {error && (
          <div className="mb-6 max-w-md mx-auto bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 max-w-md mx-auto bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        {/* Connection Method */}
        <div className="max-w-md mx-auto mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 border border-gray-100 dark:border-gray-700">
            {/* Meta Verified Badge */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z"/>
                </svg>
                <span className="font-semibold text-blue-800 dark:text-blue-300 text-sm">We're a Meta-verified business</span>
              </div>
              <p className="text-blue-600 dark:text-blue-400 text-xs leading-relaxed">
                We only use official Instagram APIs and processes. Your Instagram account is secure, and you stay in full control.
              </p>
            </div>

            {/* Checklist */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">Official Instagram OAuth login</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">Safe and Secure</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">Business & Creator accounts supported</span>
              </div>
            </div>

            {/* Login with Instagram Button */}
            <button
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                handleConnectInstagram(params.get('returnTo') || '');
              }}
              disabled={connectLoading}
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg hover:opacity-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2.5 text-base"
            >
              {connectLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Redirecting to Instagram...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                    <path d="M12 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8z"/>
                    <circle cx="18.406" cy="5.594" r="1.44"/>
                  </svg>
                  Login with Instagram
                </>
              )}
            </button>

            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
              You'll be redirected to Instagram to authorize Replyflows
            </p>
          </div>
        </div>

        {/* Connected Accounts */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500 dark:text-gray-400">Loading accounts...</p>
          </div>
        ) : accounts.length > 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Connected Accounts
            </h3>
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      {account.profilePictureUrl ? (
                        <img src={account.profilePictureUrl} alt={account.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-lg">
                          {account.username?.charAt(0).toUpperCase() || 'I'}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-white">
                        @{account.username}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Connected {new Date(account.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      account.status === 'active'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}>
                      {account.status === 'active' ? 'Active' : account.status}
                    </span>
                    <button
                      onClick={() => handleDeleteAccount(account.id, account.username)}
                      className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Disconnect account"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              No accounts connected yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Click "Login with Instagram" above to connect your account
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default ConnectInstagram;
