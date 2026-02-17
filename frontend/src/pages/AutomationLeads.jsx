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
    // Update current time every second for countdown timer
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [id]);

  const fetchAutomationData = async () => {
    try {
      const [automationRes, leadsRes] = await Promise.all([
        automationAPI.getById(id),
        automationAPI.getLeads(id)
      ]);
      setAutomation(automationRes.data.automation);
      setLeads(leadsRes.data.leads || []);
      setPendingDMs(leadsRes.data.pendingDMs || []);
    } catch (err) {
      setError('Failed to load automation data');
      console.error('Error fetching automation data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate countdown timer for pending DMs
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
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500">Loading leads...</p>
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/automations')}
              className="text-gray-500 hover:text-gray-700 flex items-center gap-2 mb-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Automations
            </button>
            <h1 className="text-3xl font-bold text-gray-800">
              {automation?.name || 'Automation'} - Leads
            </h1>
            <p className="text-gray-500">View and manage leads from this automation</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              automation?.isActive
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {automation?.isActive ? '● Running' : '○ Paused'}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Pending DMs Section */}
        {pendingDMs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Pending Messages</h2>
                <p className="text-sm text-gray-500">{pendingDMs.length} message(s) scheduled to be sent</p>
              </div>
            </div>

            <div className="space-y-3">
              {pendingDMs.map((dm) => (
                <div
                  key={dm.id}
                  className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                      {dm.recipientUsername?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">@{dm.recipientUsername}</p>
                      <p className="text-sm text-gray-500 truncate max-w-md">{dm.message}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-yellow-700">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-mono font-semibold">
                        {getCountdown(dm.scheduledFor)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Scheduled: {new Date(dm.scheduledFor).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leads Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">All Leads</h2>
                <p className="text-sm text-gray-500">{leads.length} total lead(s)</p>
              </div>
              {leads.length > 0 && (
                <button className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-6 font-medium text-gray-500 text-sm">USER</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 text-sm">STATUS</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 text-sm">TRIGGERED AT</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 text-sm">DM SENT</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-500 text-sm">KEYWORD</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-1">No leads yet</h3>
                        <p className="text-gray-500">Leads will appear here when users trigger your automation</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                            {lead.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">@{lead.username}</p>
                            {lead.email && <p className="text-sm text-gray-500">{lead.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          lead.dmStatus === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : lead.dmStatus === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : lead.dmStatus === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {lead.dmStatus || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-500">
                        {new Date(lead.triggeredAt).toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-gray-500">
                        {lead.dmSentAt ? new Date(lead.dmSentAt).toLocaleString() : '-'}
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm">
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
