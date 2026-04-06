import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { instagramAPI, subscriptionAPI } from '../utils/api';
import { removeToken } from '../utils/auth';
import { useTheme } from '../contexts/ThemeContext';
import ChatWidget from './ChatWidget';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [usage, setUsage] = useState({ dms: 0, contacts: 0, dmsLimit: 1000, contactsLimit: 1000 });
  const hasFetched = useRef(false);

  useEffect(() => {
    // Only fetch once on mount
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchAccounts();
      fetchUsage();
    }
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await instagramAPI.getAccounts();
      const accountsList = response.data.accounts || [];
      setAccounts(accountsList);

      if (accountsList.length > 0) {
        // Check if there's a saved selected account in localStorage
        const savedAccountId = localStorage.getItem('selectedAccountId');
        const savedAccount = accountsList.find(a => a.id === savedAccountId);

        if (savedAccount) {
          setSelectedAccount(savedAccount);
        } else {
          setSelectedAccount(accountsList[0]);
          localStorage.setItem('selectedAccountId', accountsList[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchUsage = async () => {
    try {
      const response = await subscriptionAPI.checkLimits();
      const limits = response.data?.limits;
      if (limits) {
        setUsage({
          dms: limits.dms?.used || 0,
          dmsLimit: limits.dms?.limit === -1 ? 'Unlimited' : (limits.dms?.limit || 1000),
          contacts: 0,
          contactsLimit: 1000
        });
      }
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="w-64 bg-white dark:bg-gray-900 h-screen fixed left-0 top-0 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-colors">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-800">
        <Link to="/dashboard" className="flex items-center">
          <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">Replyflows</span>
        </Link>
      </div>

      {/* Account Selector */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="relative">
          <button
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-semibold">
              {selectedAccount?.profilePictureUrl ? (
                <img src={selectedAccount.profilePictureUrl} alt={selectedAccount.username} className="w-full h-full object-cover" />
              ) : (
                selectedAccount?.username?.charAt(0).toUpperCase() || '?'
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                @{selectedAccount?.username || 'No account'}
              </p>
            </div>
            <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAccountDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    setSelectedAccount(account);
                    localStorage.setItem('selectedAccountId', account.id);
                    setShowAccountDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-sm font-semibold">
                    {account.profilePictureUrl ? (
                      <img src={account.profilePictureUrl} alt={account.username} className="w-full h-full object-cover" />
                    ) : (
                      account.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">@{account.username}</span>
                </button>
              ))}
              <Link
                to="/connect-instagram"
                className="flex items-center gap-3 p-3 border-t border-gray-100 dark:border-gray-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">Add Account</span>
              </Link>
              <div className="border-t border-gray-100 dark:border-gray-700">
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">My Account</div>
                <button
                  onClick={() => {
                    removeToken();
                    window.location.href = '/login';
                  }}
                  className="w-full flex items-center gap-3 p-3 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="text-sm font-medium">Log out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {/* Home */}
          <li>
            <Link
              to="/dashboard"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive('/dashboard')
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="font-medium">Home</span>
            </Link>
          </li>

          {/* Automations */}
          <li>
            <Link
              to="/automations"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive('/automations')
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-medium">Automations</span>
            </Link>
          </li>

          {/* Leads */}
          <li>
            <Link
              to="/leads"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive('/leads')
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="font-medium">Leads</span>
            </Link>
          </li>

          {/* Analytics */}
          <li>
            <Link
              to="/analytics"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive('/analytics')
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="font-medium">Analytics</span>
              <span className="ml-auto px-2 py-0.5 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300 text-xs font-medium rounded-full">Pro</span>
            </Link>
          </li>

          {/* Settings */}
          <li>
            <Link
              to="/settings"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive('/settings')
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-medium">Settings</span>
            </Link>
          </li>
        </ul>
      </nav>

      {/* Bottom Section: Theme Toggle + Usage Meters */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-4 py-2.5 mb-4 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
        >
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          </div>
          <div className={`w-10 h-5 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-purple-600' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {/* DM Usage */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
              {usage.dms}/{usage.dmsLimit} DM per month
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${usage.dmsLimit === 'Unlimited' ? 0 : Math.min((usage.dms / usage.dmsLimit) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Contacts Usage */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {usage.contacts}/{usage.contactsLimit} contacts per month
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-400 dark:bg-gray-500 rounded-full transition-all"
              style={{ width: `${Math.min((usage.contacts / usage.contactsLimit) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Chat Widget */}
        <ChatWidget />
      </div>
    </div>
  );
};

export default Sidebar;
