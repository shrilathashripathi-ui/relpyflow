import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { automationAPI, subscriptionAPI } from '../utils/api';

const Analytics = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [timeRange, setTimeRange] = useState('7d');
  const [stats, setStats] = useState({
    totalDMs: 0,
    totalReplies: 0,
    totalLeads: 0,
    replyRate: 0,
    conversionRate: 0
  });
  const [chartData, setChartData] = useState([]);
  const [topKeywords, setTopKeywords] = useState([]);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      checkPremiumAndFetch();
    }
  }, []);

  const checkPremiumAndFetch = async () => {
    try {
      const subRes = await subscriptionAPI.getStatus();
      const { plan, status } = subRes.data;
      const premium = plan === 'pro' || plan === 'scale' || status === 'active' || status === 'trial';
      setIsPremium(premium);

      if (premium) {
        await fetchAnalytics();
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const automationsRes = await automationAPI.getAll();
      const automations = automationsRes.data.automations || [];

      // Calculate stats
      const totalDMs = automations.reduce((sum, a) => sum + (a.dmsSentCount || 0), 0);
      const totalReplies = automations.reduce((sum, a) => sum + (a.repliesCount || 0), 0);
      const totalLeads = automations.reduce((sum, a) => sum + (a.leadsCount || 0), 0);
      const replyRate = totalDMs > 0 ? ((totalReplies / totalDMs) * 100).toFixed(1) : 0;
      const conversionRate = totalReplies > 0 ? ((totalLeads / totalReplies) * 100).toFixed(1) : 0;

      setStats({ totalDMs, totalReplies, totalLeads, replyRate, conversionRate });

      // Chart data starts empty - will be populated when real daily analytics are available
      setChartData([]);

      // Build top keywords from automation keyword data
      const keywordMap = {};
      automations.forEach(a => {
        (a.keywords || []).forEach(kw => {
          const word = typeof kw === 'string' ? kw : kw.keyword;
          if (!word) return;
          if (!keywordMap[word]) keywordMap[word] = { keyword: word, dms: 0, replies: 0 };
          keywordMap[word].dms += (kw.dmsSentCount || 0);
          keywordMap[word].replies += (kw.repliesCount || 0);
        });
      });
      const kwList = Object.values(keywordMap)
        .map(kw => ({ ...kw, rate: kw.dms > 0 ? `${((kw.replies / kw.dms) * 100).toFixed(0)}%` : '0%' }))
        .sort((a, b) => b.dms - a.dms)
        .slice(0, 5);
      setTopKeywords(kwList);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
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

  // Premium gate
  if (!isPremium) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="w-20 h-20 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Unlock Advanced Analytics</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Get detailed insights into your DM performance, reply rates, and lead conversion with Pro.
            </p>
            <button
              onClick={() => navigate('/pricing')}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all"
            >
              Upgrade to Pro - $19/mo
            </button>
          </div>
        </div>
      </div>
    );
  }

  const maxDM = Math.max(...chartData.map(d => d.dms), 1);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar />

      <div className="flex-1 ml-64">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics</h1>
              <p className="text-gray-600 dark:text-gray-400">Track your DM performance and conversion rates</p>
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700">
              {['7d', '30d', '90d'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    timeRange === range
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-5 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Total DMs</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalDMs}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stats.totalDMs > 0 ? 'All time' : 'No data yet'}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Replies</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalReplies}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stats.totalReplies > 0 ? 'All time' : 'No data yet'}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Leads</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalLeads}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stats.totalLeads > 0 ? 'All time' : 'No data yet'}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Reply Rate</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.replyRate}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stats.totalDMs > 0 ? 'All time' : 'No data yet'}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-pink-100 dark:bg-pink-900/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Conversion</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.conversionRate}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stats.totalReplies > 0 ? 'All time' : 'No data yet'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {/* Chart */}
            <div className="col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">DM Performance</h3>
              {chartData.length > 0 ? (
                <>
                  <div className="h-64 flex items-end gap-4">
                    {chartData.map((data, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full flex flex-col gap-1 items-center">
                          <div
                            className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t-lg transition-all hover:from-purple-700 hover:to-purple-500"
                            style={{ height: `${(data.dms / maxDM) * 180}px` }}
                            title={`DMs: ${data.dms}`}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{data.day}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-6">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-purple-500 rounded"></div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">DMs Sent</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Replies</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-pink-500 rounded"></div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Leads</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                  <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm font-medium">No performance data yet</p>
                  <p className="text-xs mt-1">Chart will appear once your automations start sending DMs</p>
                </div>
              )}
            </div>

            {/* Funnel */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Conversion Funnel</h3>
              {stats.totalDMs > 0 ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">DMs Sent</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.totalDMs}</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Replies</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.totalReplies}</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.totalDMs > 0 ? (stats.totalReplies / stats.totalDMs * 100) : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Leads Captured</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.totalLeads}</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-pink-500 rounded-full" style={{ width: `${stats.totalDMs > 0 ? (stats.totalLeads / stats.totalDMs * 100) : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
                  <p className="text-sm">No funnel data yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Top Keywords */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm mt-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Top Performing Keywords</h3>
            {topKeywords.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">KEYWORD</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">DMs SENT</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">REPLIES</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">REPLY RATE</th>
                  </tr>
                </thead>
                <tbody>
                  {topKeywords.map((kw, index) => (
                    <tr key={index} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-sm font-medium">
                          {kw.keyword}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white font-medium">{kw.dms}</td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white font-medium">{kw.replies}</td>
                      <td className="py-4 px-4">
                        <span className={`font-medium ${
                          parseFloat(kw.rate) >= 45 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'
                        }`}>
                          {kw.rate}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                <p className="text-sm">No keyword data yet. Keywords will appear here once your automations start matching comments.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
