import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { instagramAPI, automationAPI } from '../utils/api';
import { getUser } from '../utils/auth';

const Dashboard = () => {
  const [stats, setStats] = useState({
    connectedAccounts: 0,
    activeAutomations: 0,
    totalTriggers: 0,
  });
  const [loading, setLoading] = useState(true);
  const user = getUser();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [accountsRes, automationsRes] = await Promise.all([
        instagramAPI.getAccounts(),
        automationAPI.getAll(),
      ]);

      const accounts = accountsRes.data.accounts || [];
      const automations = automationsRes.data.automations || [];
      const activeAutomations = automations.filter((a) => a.isActive);

      setStats({
        connectedAccounts: accounts.length,
        activeAutomations: activeAutomations.length,
        totalTriggers: automations.reduce(
          (sum, auto) => sum + (auto.triggerCount || 0),
          0
        ),
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Welcome back, {user?.name || 'User'}!
          </h1>
          <p className="text-slate-400">
            Manage your Instagram automation workflows
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-slate-400">Loading dashboard...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm mb-1">
                      Connected Accounts
                    </p>
                    <p className="text-4xl font-bold text-white">
                      {stats.connectedAccounts}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm mb-1">
                      Active Automations
                    </p>
                    <p className="text-4xl font-bold text-white">
                      {stats.activeAutomations}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white"
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
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm mb-1">
                      Total Triggers
                    </p>
                    <p className="text-4xl font-bold text-white">
                      {stats.totalTriggers}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="text-xl font-bold text-white mb-4">
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <Link
                    to="/connect-instagram"
                    className="block p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors border border-slate-600"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          Connect Instagram Account
                        </p>
                        <p className="text-sm text-slate-400">
                          Link your Instagram account to start automating
                        </p>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>

                  <Link
                    to="/create-automation"
                    className="block p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors border border-slate-600"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          Create New Automation
                        </p>
                        <p className="text-sm text-slate-400">
                          Set up keyword triggers and auto-responses
                        </p>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>

                  <Link
                    to="/automations"
                    className="block p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors border border-slate-600"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          View Automations
                        </p>
                        <p className="text-sm text-slate-400">
                          Manage and monitor your active automations
                        </p>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>
                </div>
              </div>

              <div className="card">
                <h3 className="text-xl font-bold text-white mb-4">
                  Getting Started
                </h3>
                <div className="space-y-4 text-slate-300">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-white text-sm font-bold">1</span>
                    </div>
                    <div>
                      <p className="font-semibold">Connect Instagram</p>
                      <p className="text-sm text-slate-400">
                        Link your Instagram account using OAuth
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-white text-sm font-bold">2</span>
                    </div>
                    <div>
                      <p className="font-semibold">Create Automation</p>
                      <p className="text-sm text-slate-400">
                        Set up keywords and response messages
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-white text-sm font-bold">3</span>
                    </div>
                    <div>
                      <p className="font-semibold">Monitor Results</p>
                      <p className="text-sm text-slate-400">
                        Track triggers and engagement metrics
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
