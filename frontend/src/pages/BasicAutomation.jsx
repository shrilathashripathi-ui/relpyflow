import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { automationAPI, instagramAPI } from '../utils/api';

const BasicAutomation = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Basic automation settings
  const [settings, setSettings] = useState({
    // Default Reply
    defaultReplyEnabled: false,
    defaultReplyMessage: '',
    // Welcome Message
    welcomeMessageEnabled: false,
    welcomeMessage: '',
    // Story Mention Reply
    storyMentionEnabled: false,
    storyMentionMessage: '',
    // Conversation Starters
    conversationStartersEnabled: false,
    conversationStarters: []
  });

  // Temp state for adding conversation starters
  const [newStarter, setNewStarter] = useState({ title: '', message: '' });
  const [showStarterModal, setShowStarterModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const accountsRes = await instagramAPI.getAccounts();
      const accountsList = accountsRes.data.accounts || [];
      setAccounts(accountsList);
      if (accountsList.length > 0) {
        setSelectedAccountId(accountsList[0].id);
        // Load existing basic automation settings for this account
        await loadSettings(accountsList[0].id);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async (accountId) => {
    try {
      const res = await automationAPI.getBasicSettings?.(accountId);
      if (res?.data?.settings) {
        setSettings(res.data.settings);
      }
    } catch (err) {
      // Settings might not exist yet, use defaults
      console.log('No existing settings found, using defaults');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await automationAPI.saveBasicSettings?.(selectedAccountId, settings);
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addConversationStarter = () => {
    if (newStarter.title && newStarter.message) {
      setSettings(prev => ({
        ...prev,
        conversationStarters: [...prev.conversationStarters, { ...newStarter, id: Date.now() }]
      }));
      setNewStarter({ title: '', message: '' });
      setShowStarterModal(false);
    }
  };

  const removeConversationStarter = (id) => {
    setSettings(prev => ({
      ...prev,
      conversationStarters: prev.conversationStarters.filter(s => s.id !== id)
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar />

      <div className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Basic Automation</h1>
          <p className="text-gray-500 dark:text-gray-400">Set up essential automations for your Instagram account</p>
        </div>

        {/* Account Selector */}
        {accounts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Instagram Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                loadSettings(e.target.value);
              }}
              className="w-full max-w-xs px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>@{account.username}</option>
              ))}
            </select>
          </div>
        )}

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Default Reply */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Default Reply</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Auto-reply to all messages that don't match other automations</p>
                </div>
              </div>
              <button
                onClick={() => setSettings(prev => ({ ...prev, defaultReplyEnabled: !prev.defaultReplyEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.defaultReplyEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.defaultReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {settings.defaultReplyEnabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reply Message</label>
                <textarea
                  value={settings.defaultReplyMessage}
                  onChange={(e) => setSettings(prev => ({ ...prev, defaultReplyMessage: e.target.value }))}
                  placeholder="Thanks for reaching out! We'll get back to you soon."
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Welcome Message */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Welcome Message</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Automatically greet new followers who DM you for the first time</p>
                </div>
              </div>
              <button
                onClick={() => setSettings(prev => ({ ...prev, welcomeMessageEnabled: !prev.welcomeMessageEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.welcomeMessageEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.welcomeMessageEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {settings.welcomeMessageEnabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Welcome Message</label>
                <textarea
                  value={settings.welcomeMessage}
                  onChange={(e) => setSettings(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                  placeholder="Hey! Thanks for following. How can I help you today?"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Story Mention Reply */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Story Mention Reply</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Automatically thank users who mention you in their stories</p>
                </div>
              </div>
              <button
                onClick={() => setSettings(prev => ({ ...prev, storyMentionEnabled: !prev.storyMentionEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.storyMentionEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.storyMentionEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {settings.storyMentionEnabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Thank You Message</label>
                <textarea
                  value={settings.storyMentionMessage}
                  onChange={(e) => setSettings(prev => ({ ...prev, storyMentionMessage: e.target.value }))}
                  placeholder="Thanks so much for the mention! We really appreciate it."
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Conversation Starters */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Conversation Starters</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Pre-filled buttons for new users to start a conversation</p>
                </div>
              </div>
              <button
                onClick={() => setSettings(prev => ({ ...prev, conversationStartersEnabled: !prev.conversationStartersEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.conversationStartersEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.conversationStartersEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {settings.conversationStartersEnabled && (
              <div className="mt-4">
                <div className="space-y-3 mb-4">
                  {settings.conversationStarters.map((starter) => (
                    <div key={starter.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">{starter.title}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{starter.message}</p>
                      </div>
                      <button
                        onClick={() => removeConversationStarter(starter.id)}
                        className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowStarterModal(true)}
                  className="flex items-center gap-2 px-4 py-2 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Conversation Starter
                </button>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Add Conversation Starter Modal */}
      {showStarterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Add Conversation Starter</h3>
              <button onClick={() => setShowStarterModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Button Title</label>
                <input
                  type="text"
                  value={newStarter.title}
                  onChange={(e) => setNewStarter(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Pricing Info"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Auto-Reply Message</label>
                <textarea
                  value={newStarter.message}
                  onChange={(e) => setNewStarter(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="The message to send when user clicks this button"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowStarterModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={addConversationStarter}
                disabled={!newStarter.title || !newStarter.message}
                className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50"
              >
                Add Starter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BasicAutomation;
