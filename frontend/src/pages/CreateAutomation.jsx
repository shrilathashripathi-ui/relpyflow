import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { instagramAPI, automationAPI } from '../utils/api';

const CreateAutomation = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    instagramAccountId: '',
    name: '',
    keywords: '',
    responseMessage: '',
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await instagramAPI.getAccounts();
      const accountsList = response.data.accounts || [];
      setAccounts(accountsList);

      // Auto-select first account if available
      if (accountsList.length > 0) {
        setFormData((prev) => ({
          ...prev,
          instagramAccountId: accountsList[0].id,
        }));
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setError('Failed to load Instagram accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.instagramAccountId) {
      setError('Please select an Instagram account');
      return;
    }

    if (!formData.keywords.trim()) {
      setError('Please enter at least one keyword');
      return;
    }

    setSubmitting(true);

    try {
      // Split keywords by comma and trim whitespace
      const keywordsArray = formData.keywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      await automationAPI.create({
        instagramAccountId: formData.instagramAccountId,
        name: formData.name,
        keywords: keywordsArray,
        responseMessage: formData.responseMessage,
      });

      setSuccess('Automation created successfully!');

      // Reset form
      setFormData({
        instagramAccountId: accounts[0]?.id || '',
        name: '',
        keywords: '',
        responseMessage: '',
      });

      // Redirect to automations page after 2 seconds
      setTimeout(() => {
        navigate('/automations');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create automation');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-slate-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="card text-center py-12">
            <svg
              className="w-16 h-16 text-slate-600 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">
              No Instagram Accounts Connected
            </h3>
            <p className="text-slate-400 mb-6">
              You need to connect an Instagram account before creating automations
            </p>
            <button
              onClick={() => navigate('/connect-instagram')}
              className="btn-primary"
            >
              Connect Instagram Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Create New Automation
          </h1>
          <p className="text-slate-400">
            Set up keyword triggers and automatic DM responses
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-900/50 border border-green-500 text-green-200 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card">
            <h3 className="text-xl font-bold text-white mb-4">
              Automation Details
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Instagram Account
                </label>
                <select
                  name="instagramAccountId"
                  value={formData.instagramAccountId}
                  onChange={handleChange}
                  required
                  className="input-field"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      @{account.username}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Automation Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="input-field"
                  placeholder="e.g., Price Inquiry Response"
                />
                <p className="mt-1 text-sm text-slate-400">
                  Give your automation a descriptive name
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  name="keywords"
                  value={formData.keywords}
                  onChange={handleChange}
                  required
                  className="input-field"
                  placeholder="price, cost, how much, interested"
                />
                <p className="mt-1 text-sm text-slate-400">
                  Comments containing these keywords will trigger the automation
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Response Message
                </label>
                <textarea
                  name="responseMessage"
                  value={formData.responseMessage}
                  onChange={handleChange}
                  required
                  rows="5"
                  className="input-field"
                  placeholder="Hi! Thanks for your interest. I'll send you the details via DM!"
                />
                <p className="mt-1 text-sm text-slate-400">
                  This message will be sent automatically to matching commenters
                </p>
              </div>
            </div>
          </div>

          <div className="card bg-blue-900/20 border-blue-700">
            <h4 className="font-semibold text-white mb-2">How it works:</h4>
            <ol className="space-y-2 text-slate-300 text-sm">
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">1.</span>
                <span>ReplyFlow monitors comments on your Instagram posts/reels</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">2.</span>
                <span>When a comment contains your keywords, it triggers the automation</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">3.</span>
                <span>Your response message is automatically sent via DM</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">4.</span>
                <span>All activities are tracked and can be monitored</span>
              </li>
            </ol>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Creating...' : 'Create Automation'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/automations')}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAutomation;
