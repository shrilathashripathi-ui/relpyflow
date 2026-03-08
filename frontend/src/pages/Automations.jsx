import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { automationAPI, instagramAPI } from '../utils/api';

const Automations = () => {
  const navigate = useNavigate();
  const [automations, setAutomations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    }
  }, []);

  // Listen for account changes from sidebar
  useEffect(() => {
    const handleStorageChange = () => {
      const savedAccountId = localStorage.getItem('selectedAccountId');
      if (savedAccountId && savedAccountId !== selectedAccountFilter) {
        setSelectedAccountFilter(savedAccountId);
      }
    };

    // Listen for storage events (from other tabs)
    window.addEventListener('storage', handleStorageChange);

    // Also check periodically for same-tab changes (since storage event doesn't fire in same tab)
    const interval = setInterval(() => {
      const savedAccountId = localStorage.getItem('selectedAccountId');
      if (savedAccountId && savedAccountId !== selectedAccountFilter && accounts.find(a => a.id === savedAccountId)) {
        setSelectedAccountFilter(savedAccountId);
      }
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [selectedAccountFilter, accounts]);

  const fetchData = async () => {
    try {
      const [automationsRes, accountsRes] = await Promise.all([
        automationAPI.getAll(),
        instagramAPI.getAccounts()
      ]);
      setAutomations(automationsRes.data.automations || []);
      const accountsList = accountsRes.data.accounts || [];
      setAccounts(accountsList);

      // Auto-filter by the selected account from sidebar
      const savedAccountId = localStorage.getItem('selectedAccountId');
      if (savedAccountId && accountsList.find(a => a.id === savedAccountId)) {
        setSelectedAccountFilter(savedAccountId);
      }
    } catch (err) {
      setError('Failed to load automations');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter automations by selected account
  const filteredAutomations = selectedAccountFilter === 'all'
    ? automations
    : automations.filter(a => a.instagramAccountId === selectedAccountFilter);

  const handleToggle = async (automationId, currentStatus) => {
    try {
      setError('');
      const response = await automationAPI.toggle(automationId);
      if (response.data) {
        setAutomations((prev) =>
          prev.map((auto) =>
            auto.id === automationId
              ? { ...auto, isActive: !auto.isActive }
              : auto
          )
        );
        setSuccess(currentStatus ? 'Automation paused' : 'Automation resumed');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      // Don't let errors redirect - just show message
      const errorMsg = err.response?.data?.message || 'Failed to toggle automation';
      setError(errorMsg);
      console.error('Error toggling automation:', err);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleEdit = (automationId) => {
    navigate(`/edit-automation/${automationId}`);
  };

  const handleDelete = async (automationId) => {
    if (!window.confirm('Are you sure you want to delete this automation?')) return;

    try {
      await automationAPI.delete(automationId);
      setAutomations((prev) => prev.filter((auto) => auto.id !== automationId));
      setSuccess('Automation deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to delete automation');
      console.error('Error deleting automation:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500 dark:text-gray-400">Loading automations...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar />

      <div className="flex-1 ml-64">
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Automations</h1>
              {accounts.length > 0 && (
                <select
                  value={selectedAccountFilter}
                  onChange={(e) => {
                    setSelectedAccountFilter(e.target.value);
                    // Also update localStorage so sidebar stays in sync
                    if (e.target.value !== 'all') {
                      localStorage.setItem('selectedAccountId', e.target.value);
                    }
                  }}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      @{account.username}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={() => navigate('/create-automation')}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all flex items-center gap-2"
            >
              + Create
            </button>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {success}
            </div>
          )}

          {/* Automations Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-4 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">IMAGE</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">NAME</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">STATUS</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">CREATED</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">LAST MODIFIED</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAutomations.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-16">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">
                            {selectedAccountFilter === 'all' ? 'No automations yet' : 'No automations for this account'}
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 mb-4">Get started by creating your first automation.</p>
                          <button
                            onClick={() => navigate('/create-automation')}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all"
                          >
                            + Create Automation
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAutomations.map((automation) => (
                      <tr key={automation.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-4 px-6">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                            </svg>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-medium text-gray-800 dark:text-white">{automation.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">@{automation.instagramAccount?.username}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            automation.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }`}>
                            {automation.isActive ? '● Running' : '○ Paused'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-500 dark:text-gray-400">
                          {new Date(automation.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-6 text-gray-500 dark:text-gray-400">
                          {new Date(automation.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            {/* Pause/Resume Button */}
                            <button
                              onClick={() => handleToggle(automation.id, automation.isActive)}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg flex items-center gap-1.5 ${
                                automation.isActive
                                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
                                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                              }`}
                            >
                              {automation.isActive ? (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Pause
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Resume
                                </>
                              )}
                            </button>
                            {/* Leads Data */}
                            <button
                              onClick={() => navigate(`/automations/${automation.id}/leads`)}
                              className="px-3 py-1.5 text-sm border border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30"
                            >
                              Leads
                            </button>
                            {/* Edit Button */}
                            <button
                              onClick={() => handleEdit(automation.id)}
                              className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                              title="Edit automation"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            {/* Delete Button */}
                            <button
                              onClick={() => handleDelete(automation.id)}
                              className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                              title="Delete automation"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredAutomations.length > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  Rows per page:
                  <select className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-700 dark:text-white">
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-8 h-8 flex items-center justify-center rounded bg-purple-600 text-white text-sm font-medium">
                    1
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Automations;
