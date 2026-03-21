import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { automationAPI } from '../utils/api';

const AutomationLeads = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [automation, setAutomation] = useState(null);
  const [leads, setLeads] = useState([]);
  const [pendingDMs, setPendingDMs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchAutomationData();
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [id]);

  const fetchAutomationData = async () => {
    try {
      const [automationRes, triggersRes] = await Promise.all([
        automationAPI.getById(id),
        automationAPI.getTriggers(id)
      ]);
      setAutomation(automationRes.data.automation);

      const triggers = triggersRes.data.triggers || [];
      const allLeads = [];
      const allPending = [];

      triggers.forEach(trigger => {
        const conversationStep = trigger.conversationStep ||
          (trigger.dmSent && !trigger.buttonClicked ? 'waiting_button' :
           trigger.linkSent ? 'link_sent' :
           trigger.dmSent ? 'dm_sent' : 'pending');

        const isWaitingForAction = conversationStep === 'waiting_button' ||
                                   conversationStep === 'waiting_follow' ||
                                   conversationStep === 'waiting_email';

        allLeads.push({
          id: trigger.id,
          username: trigger.username || trigger.commenterUsername,
          comment: trigger.commentText,
          keyword: trigger.matchedKeyword || trigger.detectedKeyword,
          dmStatus: trigger.dmSent ? 'sent' : (trigger.dmStatus || trigger.status),
          conversationStep,
          emailCollected: trigger.emailCollected || null,
          triggeredAt: trigger.createdAt,
          dmSentAt: trigger.dmSent ? trigger.updatedAt : null,
          dmScheduledAt: trigger.dmScheduledAt
        });

        if (isWaitingForAction || (!trigger.dmSent && trigger.dmScheduledAt)) {
          allPending.push({
            id: trigger.id,
            username: trigger.username || trigger.commenterUsername,
            comment: trigger.commentText,
            scheduledAt: trigger.dmScheduledAt || trigger.createdAt,
            conversationStep,
            isWaitingForAction
          });
        }
      });

      allLeads.sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));
      allPending.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

      setLeads(allLeads);
      setPendingDMs(allPending);
    } catch (err) {
      setError('Failed to load automation data');
      console.error('Error fetching automation data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getCountdown = (scheduledTime) => {
    const scheduled = new Date(scheduledTime);
    const diff = scheduled - currentTime;

    if (diff <= 0) return 'Sending...';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500 dark:text-gray-400">Loading leads...</p>
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/automations')}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-2 mb-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Automations
            </button>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
              {automation?.name || 'Automation'} - Leads
            </h1>
            <p className="text-gray-500 dark:text-gray-400">View and manage leads from this automation</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              automation?.isActive
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {automation?.isActive ? '● Running' : '○ Paused'}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Pending DMs Section */}
        {pendingDMs.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Pending Messages</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{pendingDMs.length} message(s) scheduled to be sent</p>
              </div>
            </div>

            <div className="space-y-3">
              {pendingDMs.map((dm) => (
                <div
                  key={dm.id}
                  className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                      {dm.username?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-white">@{dm.username}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">{dm.comment}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {dm.isWaitingForAction ? (
                      <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                        Waiting for response
                      </span>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-yellow-700">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-mono font-semibold">
                            {getCountdown(dm.scheduledAt)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Scheduled: {new Date(dm.scheduledAt).toLocaleTimeString()}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leads Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">All Leads</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{leads.length} total lead(s)</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left py-3 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">USER</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">COMMENT</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">STATUS</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">TRIGGERED AT</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 dark:text-gray-400 text-sm">KEYWORD</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">No leads yet</h3>
                        <p className="text-gray-500 dark:text-gray-400">Leads will appear here when users trigger your automation</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                            {lead.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white">@{lead.username}</p>
                            {lead.emailCollected && <p className="text-sm text-gray-500 dark:text-gray-400">{lead.emailCollected}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{lead.comment || '-'}</p>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          lead.dmStatus === 'sent'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : lead.dmStatus === 'pending'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : lead.dmStatus === 'failed'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          {lead.dmStatus || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-500 dark:text-gray-400">
                        {new Date(lead.triggeredAt).toLocaleString()}
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-sm">
                          {lead.keyword || '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationLeads;
