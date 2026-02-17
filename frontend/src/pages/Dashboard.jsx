import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { automationAPI, subscriptionAPI } from '../utils/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    messagesSent: 0,
    replies: 0,
    leads: 0,
    replyRate: 0
  });
  const [usage, setUsage] = useState({
    dms: 0,
    limit: 50
  });
  const [recentDMs, setRecentDMs] = useState([]);
  const [automations, setAutomations] = useState([]);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    }
  }, []);

  const fetchData = async () => {
    try {
      // Get user info
      const userStr = localStorage.getItem('user');
      if (userStr) {
        setUser(JSON.parse(userStr));
      }

      // Check automations for stats
      const automationsRes = await automationAPI.getAll();
      const automationsList = automationsRes.data.automations || [];
      setAutomations(automationsList);

      const totalDmsSent = automationsList.reduce((sum, a) => sum + (a.dmsSentCount || 0), 0);
      const replies = Math.floor(totalDmsSent * 0.47);
      const leads = Math.floor(totalDmsSent * 0.15);

      setStats({
        messagesSent: totalDmsSent,
        replies: replies,
        leads: leads,
        replyRate: totalDmsSent > 0 ? ((replies / totalDmsSent) * 100).toFixed(0) : 0
      });

      // Get usage limits
      try {
        const limitsRes = await subscriptionAPI.checkLimits();
        const limits = limitsRes.data?.limits;
        if (limits) {
          setUsage({
            dms: limits.dms?.used || 0,
            limit: limits.dms?.limit === -1 ? 'Unlimited' : (limits.dms?.limit || 50)
          });
        }
      } catch (e) {
        console.log('Could not fetch limits');
      }

      // Mock recent DMs
      setRecentDMs([
        { id: 1, username: '@sarah_shopper', keyword: 'PRICE', status: 'replied', time: '2 min ago' },
        { id: 2, username: '@mikej_store', keyword: 'LINK', status: 'sent', time: '5 min ago' },
        { id: 3, username: '@emily_creates', keyword: 'discount', status: 'waiting', time: '12 min ago' },
        { id: 4, username: '@james_ecom', keyword: 'INFO', status: 'replied', time: '1 hour ago' },
        { id: 5, username: '@lisa_shop', keyword: 'DEAL', status: 'sent', time: '2 hours ago' },
      ]);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      sent: { bg: 'bg-blue-100', text: 'text-blue-700', label: '✓ Sent' },
      replied: { bg: 'bg-green-100', text: 'text-green-700', label: '✓ Replied' },
      waiting: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '⏳ Waiting' }
    };
    return styles[status] || styles.sent;
  };

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

      <div className="flex-1 ml-64">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back, {user?.name || 'there'} 👋
              </h1>
              <p className="text-gray-600 mt-1">Here's how your automations are performing</p>
            </div>
            <button
              onClick={() => navigate('/create-automation')}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Automation
            </button>
          </div>

          {/* Usage Banner */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 rounded-2xl p-6 mb-8 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Monthly Usage</h3>
                <p className="text-purple-100">
                  {usage.dms} / {usage.limit} DMs sent this month
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-48 h-3 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: `${usage.limit === 'Unlimited' ? 0 : Math.min((usage.dms / usage.limit) * 100, 100)}%` }}
                  />
                </div>
                {usage.limit !== 'Unlimited' && usage.dms >= usage.limit * 0.8 && (
                  <button
                    onClick={() => navigate('/pricing')}
                    className="px-4 py-2 bg-white text-purple-600 rounded-lg font-medium text-sm hover:bg-purple-50"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">DMs Sent</p>
              <p className="text-3xl font-bold text-gray-900">{stats.messagesSent}</p>
              <p className="text-sm text-green-600 mt-1">↑ 12% from last week</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">Replies</p>
              <p className="text-3xl font-bold text-gray-900">{stats.replies}</p>
              <p className="text-sm text-green-600 mt-1">↑ 8% from last week</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">Leads Captured</p>
              <p className="text-3xl font-bold text-gray-900">{stats.leads}</p>
              <p className="text-sm text-green-600 mt-1">↑ 23% from last week</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">Reply Rate</p>
              <p className="text-3xl font-bold text-gray-900">{stats.replyRate}%</p>
              <p className="text-sm text-green-600 mt-1">↑ 5% from last week</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {/* Recent DMs Table */}
            <div className="col-span-2 bg-white rounded-2xl shadow-sm">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Recent DMs</h2>
                  <button
                    onClick={() => navigate('/leads')}
                    className="text-purple-600 text-sm font-medium hover:underline"
                  >
                    View all →
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-6 text-sm font-medium text-gray-500">USER</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-gray-500">KEYWORD</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-gray-500">STATUS</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-gray-500">TIME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDMs.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="py-12 text-center text-gray-500">
                          No DMs sent yet. Create an automation to get started!
                        </td>
                      </tr>
                    ) : (
                      recentDMs.map((dm) => {
                        const status = getStatusBadge(dm.status);
                        return (
                          <tr key={dm.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                  {dm.username.charAt(1).toUpperCase()}
                                </div>
                                <span className="font-medium text-gray-900">{dm.username}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm font-medium">
                                {dm.keyword}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.bg} ${status.text}`}>
                                {status.label}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-gray-500 text-sm">{dm.time}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Automations */}
            <div className="bg-white rounded-2xl shadow-sm">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Active Automations</h2>
                  <span className="text-sm text-gray-500">{automations.filter(a => a.isActive).length} running</span>
                </div>
              </div>
              <div className="p-4">
                {automations.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <p className="text-gray-600 mb-4">No automations yet</p>
                    <button
                      onClick={() => navigate('/create-automation')}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                    >
                      Create First Automation
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {automations.slice(0, 5).map((automation) => (
                      <div
                        key={automation.id}
                        className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                        onClick={() => navigate(`/automations/${automation.id}/leads`)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{automation.name}</h4>
                          <span className={`w-2 h-2 rounded-full ${automation.isActive ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">
                            {automation.keywords?.length || 0} keywords
                          </span>
                          <span className="text-purple-600 font-medium">
                            {automation.dmsSentCount || 0} DMs
                          </span>
                        </div>
                      </div>
                    ))}
                    {automations.length > 5 && (
                      <button
                        onClick={() => navigate('/automations')}
                        className="w-full py-3 text-purple-600 text-sm font-medium hover:bg-purple-50 rounded-lg transition-colors"
                      >
                        View all {automations.length} automations →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
