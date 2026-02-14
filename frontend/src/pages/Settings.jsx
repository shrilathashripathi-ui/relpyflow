import { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import { instagramAPI, subscriptionAPI, authAPI } from '../utils/api';
import api from '../utils/api';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // General settings state
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  // Instagram accounts state
  const [accounts, setAccounts] = useState([]);
  const [refreshingAccount, setRefreshingAccount] = useState(null);

  // Billing state
  const [subscription, setSubscription] = useState(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    }
  }, []);

  const fetchData = async () => {
    try {
      // Fetch user profile
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        const nameParts = (user.name || '').split(' ');
        setProfile({
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          email: user.email || '',
          phone: user.phone || '',
        });
      }

      // Fetch Instagram accounts
      console.log('Fetching Instagram accounts...');
      const accountsRes = await instagramAPI.getAccounts();
      console.log('Instagram accounts response:', accountsRes.data);
      setAccounts(accountsRes.data.accounts || []);

      // Fetch subscription status
      try {
        const subRes = await subscriptionAPI.getStatus();
        setSubscription(subRes.data);
      } catch (e) {
        setSubscription(null);
      }
    } catch (error) {
      console.error('Error fetching settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value,
    });
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Update profile API call would go here
      // await api.put('/auth/profile', { name: `${profile.firstName} ${profile.lastName}`.trim(), phone: profile.phone });

      // Update local storage
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        user.name = `${profile.firstName} ${profile.lastName}`.trim();
        user.phone = profile.phone;
        localStorage.setItem('user', JSON.stringify(user));
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectAccount = async (accountId, username) => {
    if (!confirm(`Are you sure you want to disconnect @${username}?`)) {
      return;
    }

    try {
      await instagramAPI.deleteAccount(accountId);
      setAccounts(accounts.filter(a => a.id !== accountId));
      setSuccess(`@${username} has been disconnected`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect account');
    }
  };

  const handleRefreshToken = async (accountId) => {
    setRefreshingAccount(accountId);
    try {
      await api.post(`/instagram/account/${accountId}/refresh`);
      setSuccess('Token refreshed successfully!');
      setTimeout(() => setSuccess(''), 3000);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to refresh token');
    } finally {
      setRefreshingAccount(null);
    }
  };

  const handleActivateSubscription = async () => {
    try {
      await subscriptionAPI.startTrial();
      setSuccess('Subscription activated!');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to activate subscription');
    }
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'instagram', label: 'Instagram Accounts' },
    { id: 'billing', label: 'Billing' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="flex items-center justify-center h-64">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
          <p className="text-gray-500">Manage your account and preferences</p>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="border-b border-gray-200">
            <nav className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">General Settings</h2>
                <p className="text-gray-500 text-sm mb-6">Manage your workspace preferences</p>

                <div className="max-w-2xl space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        First Name
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={profile.firstName}
                        onChange={handleProfileChange}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        placeholder="First Name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Last Name
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        value={profile.lastName}
                        onChange={handleProfileChange}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        placeholder="Last Name"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={profile.email}
                      onChange={handleProfileChange}
                      disabled
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500"
                      placeholder="Email"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={profile.phone}
                      onChange={handleProfileChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      placeholder="phone"
                    />
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Instagram Accounts Tab */}
            {activeTab === 'instagram' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Instagram Accounts</h2>
                <p className="text-gray-500 text-sm mb-6">Manage your connected Instagram accounts</p>

                {accounts.length > 0 ? (
                  <div className="space-y-4">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="bg-gray-50 rounded-xl p-6 border border-gray-200"
                      >
                        <div className="flex flex-col items-center text-center">
                          {/* Profile Picture */}
                          <div className="w-24 h-24 rounded-full overflow-hidden mb-4 bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                            {account.profilePicUrl ? (
                              <img
                                src={account.profilePicUrl}
                                alt={account.username}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-white font-bold text-3xl">
                                {account.username?.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Username */}
                          <h3 className="text-lg font-semibold text-gray-800 mb-4">
                            {account.username}
                          </h3>

                          {/* Action Buttons */}
                          <div className="w-full max-w-xs space-y-2">
                            <button
                              onClick={() => handleDisconnectAccount(account.id, account.username)}
                              className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-all"
                            >
                              Disconnect
                            </button>
                            <button
                              onClick={() => handleRefreshToken(account.id)}
                              disabled={refreshingAccount === account.id}
                              className="w-full py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-all disabled:opacity-50"
                            >
                              {refreshingAccount === account.id ? 'Refreshing...' : 'Refresh Token'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">No accounts connected</h3>
                    <p className="text-gray-500 mb-4">Connect your Instagram account to get started</p>
                    <a
                      href="/connect-instagram"
                      className="inline-block px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all"
                    >
                      Connect Instagram
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Billing</h2>
                <p className="text-gray-500 text-sm mb-6">Manage your subscription and billing</p>

                {subscription?.plan && subscription.plan !== 'free' ? (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-1">
                          {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan
                        </h3>
                        <p className="text-gray-500 text-sm">
                          {subscription.status === 'active' ? 'Active subscription' : subscription.status}
                        </p>
                      </div>
                      <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        Active
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">No Active Subscription</h3>
                    <p className="text-gray-500 mb-6">
                      You don't have any active subscriptions yet. Activate a<br />
                      subscription to unlock all premium features.
                    </p>
                    <button
                      onClick={handleActivateSubscription}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Activate Subscription
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
