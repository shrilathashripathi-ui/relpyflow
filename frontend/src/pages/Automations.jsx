import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { automationAPI } from '../utils/api';

const Automations = () => {
  const navigate = useNavigate();
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAutomation, setExpandedAutomation] = useState(null);
  const [triggers, setTriggers] = useState({});
  const [loadingTriggers, setLoadingTriggers] = useState({});

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    try {
      const response = await automationAPI.getAll();
      setAutomations(response.data.automations || []);
    } catch (err) {
      setError('Failed to load automations');
      console.error('Error fetching automations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (automationId) => {
    try {
      await automationAPI.toggle(automationId);
      // Update local state
      setAutomations((prev) =>
        prev.map((auto) =>
          auto.id === automationId
            ? { ...auto, isActive: !auto.isActive }
            : auto
        )
      );
    } catch (err) {
      setError('Failed to toggle automation');
      console.error('Error toggling automation:', err);
    }
  };

  const fetchTriggers = async (automationId) => {
    if (triggers[automationId]) {
      // If already loaded, just toggle expanded state
      setExpandedAutomation(
        expandedAutomation === automationId ? null : automationId
      );
      return;
    }

    setLoadingTriggers((prev) => ({ ...prev, [automationId]: true }));

    try {
      const response = await automationAPI.getTriggers(automationId);
      setTriggers((prev) => ({
        ...prev,
        [automationId]: response.data.triggers || [],
      }));
      setExpandedAutomation(automationId);
    } catch (err) {
      console.error('Error fetching triggers:', err);
    } finally {
      setLoadingTriggers((prev) => ({ ...prev, [automationId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-slate-400">Loading automations...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Your Automations
            </h1>
            <p className="text-slate-400">
              Manage and monitor your Instagram automation workflows
            </p>
          </div>
          <button
            onClick={() => navigate('/create-automation')}
            className="btn-primary"
          >
            + Create New
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {automations.length === 0 ? (
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">
              No automations yet
            </h3>
            <p className="text-slate-400 mb-6">
              Create your first automation to start automating Instagram DMs
            </p>
            <button
              onClick={() => navigate('/create-automation')}
              className="btn-primary"
            >
              Create Automation
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {automations.map((automation) => (
              <div key={automation.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-bold text-white">
                        {automation.name}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-sm ${
                          automation.isActive
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {automation.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mb-3">
                      Instagram: @{automation.instagramAccount?.username}
                    </p>

                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-slate-400 text-xs mb-1">Keywords</p>
                        <p className="text-white font-semibold">
                          {automation.keywords?.length || 0}
                        </p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-slate-400 text-xs mb-1">Triggered</p>
                        <p className="text-white font-semibold">
                          {automation.triggerCount || 0}
                        </p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-slate-400 text-xs mb-1">DMs Sent</p>
                        <p className="text-white font-semibold">
                          {automation.dmSentCount || 0}
                        </p>
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-slate-400 text-sm mb-1">Keywords:</p>
                      <div className="flex flex-wrap gap-2">
                        {automation.keywords?.map((keyword, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-purple-900/30 text-purple-300 rounded text-sm"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-slate-400 text-sm mb-1">Response:</p>
                      <p className="text-slate-300 text-sm bg-slate-700/50 rounded p-2">
                        {automation.responseMessage}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleToggle(automation.id)}
                      className={`relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        automation.isActive ? 'bg-purple-600' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          automation.isActive ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-4">
                  <button
                    onClick={() => fetchTriggers(automation.id)}
                    className="text-purple-400 hover:text-purple-300 text-sm font-semibold flex items-center space-x-1"
                  >
                    <span>
                      {expandedAutomation === automation.id
                        ? 'Hide Triggers'
                        : 'View Triggers'}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        expandedAutomation === automation.id ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {expandedAutomation === automation.id && (
                    <div className="mt-4">
                      {loadingTriggers[automation.id] ? (
                        <div className="text-center py-4">
                          <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : triggers[automation.id]?.length > 0 ? (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {triggers[automation.id].map((trigger) => (
                            <div
                              key={trigger.id}
                              className="bg-slate-700/50 rounded p-3 text-sm"
                            >
                              <div className="flex justify-between items-start mb-1">
                                <p className="text-white font-semibold">
                                  @{trigger.commenterUsername}
                                </p>
                                <span className="text-slate-400 text-xs">
                                  {new Date(trigger.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-slate-300 mb-2">
                                {trigger.commentText}
                              </p>
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  trigger.dmSent
                                    ? 'bg-green-900/50 text-green-300'
                                    : 'bg-yellow-900/50 text-yellow-300'
                                }`}
                              >
                                {trigger.dmSent ? 'DM Sent' : 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-sm text-center py-4">
                          No triggers yet
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Automations;
