import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { automationAPI, instagramAPI } from '../utils/api';

const Leads = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [pendingDMs, setPendingDMs] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'all'
  const [currentTime, setCurrentTime] = useState(new Date());
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    }
  }, []);

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for account changes (only refetch if account actually changed)
  const lastAccountId = useRef(localStorage.getItem('selectedAccountId'));
  useEffect(() => {
    const checkAccountChange = () => {
      const savedAccountId = localStorage.getItem('selectedAccountId');
      if (savedAccountId && savedAccountId !== lastAccountId.current) {
        lastAccountId.current = savedAccountId;
        hasFetched.current = false;
        fetchData();
      }
    };

    const interval = setInterval(checkAccountChange, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterLeads();
  }, [leads, searchQuery, filterSource, filterStatus]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all automations
      const automationsRes = await automationAPI.getAll();
      const automations = automationsRes.data.automations || [];

      // Fetch triggers and DM queue for each automation
      const allLeads = [];
      const allPendingDMs = [];

      for (const automation of automations) {
        try {
          // Get triggers
          const triggersRes = await automationAPI.getTriggers(automation.id);
          const triggers = triggersRes.data.triggers || [];

          triggers.forEach(trigger => {
            // Determine conversation step - if DM sent but waiting for button click
            const conversationStep = trigger.conversationStep ||
              (trigger.dmSent && !trigger.buttonClicked ? 'waiting_button' :
               trigger.linkSent ? 'link_sent' :
               trigger.dmSent ? 'dm_sent' : 'pending');

            // Check if this lead is still "in progress" (waiting for user action)
            const isWaitingForAction = conversationStep === 'waiting_button' ||
                                       conversationStep === 'waiting_follow' ||
                                       conversationStep === 'waiting_email';

            allLeads.push({
              id: trigger.id,
              username: trigger.username || trigger.commenterUsername,
              name: trigger.username || trigger.commenterUsername,
              comment: trigger.commentText,
              keyword: trigger.matchedKeyword || trigger.detectedKeyword,
              source: automation.name,
              automationId: automation.id,
              status: trigger.dmSent ? 'sent' : (trigger.dmStatus || trigger.status),
              conversationStep: conversationStep,
              buttonClicked: trigger.buttonClicked,
              linkSent: trigger.linkSent,
              emailCollected: trigger.emailCollected || null,
              capturedAt: new Date(trigger.createdAt),
              dmScheduledAt: trigger.dmScheduledAt ? new Date(trigger.dmScheduledAt) : null,
              estimatedResponseTime: trigger.estimatedResponseTime
            });

            // Add to pending list if waiting for user action OR if DM not sent yet
            if (isWaitingForAction || (!trigger.dmSent && trigger.dmScheduledAt)) {
              allPendingDMs.push({
                id: trigger.id,
                username: trigger.username || trigger.commenterUsername,
                comment: trigger.commentText,
                keyword: trigger.matchedKeyword || trigger.detectedKeyword,
                source: automation.name,
                scheduledAt: trigger.dmScheduledAt ? new Date(trigger.dmScheduledAt) : new Date(trigger.createdAt),
                status: trigger.dmStatus || 'pending',
                conversationStep: conversationStep,
                isWaitingForAction: isWaitingForAction
              });
            }
          });
        } catch (e) {
          console.log(`Could not fetch triggers for automation ${automation.id}`);
        }
      }

      // Sort by most recent
      allLeads.sort((a, b) => b.capturedAt - a.capturedAt);
      allPendingDMs.sort((a, b) => a.scheduledAt - b.scheduledAt);

      setLeads(allLeads);
      setPendingDMs(allPendingDMs);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterLeads = () => {
    let filtered = [...leads];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (lead) =>
          (lead.name || '').toLowerCase().includes(query) ||
          (lead.username || '').toLowerCase().includes(query) ||
          (lead.comment || '').toLowerCase().includes(query)
      );
    }

    if (filterSource !== 'all') {
      filtered = filtered.filter((lead) => lead.source === filterSource);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((lead) => lead.status === filterStatus);
    }

    setFilteredLeads(filtered);
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map((lead) => lead.id));
    }
  };

  const toggleSelectLead = (leadId) => {
    if (selectedLeads.includes(leadId)) {
      setSelectedLeads(selectedLeads.filter((id) => id !== leadId));
    } else {
      setSelectedLeads([...selectedLeads, leadId]);
    }
  };

  const exportToCSV = () => {
    const dataToExport = selectedLeads.length > 0
      ? leads.filter((lead) => selectedLeads.includes(lead.id))
      : filteredLeads;

    const headers = ['Username', 'Comment', 'Keyword', 'Source', 'Email', 'Status', 'Captured At'];
    const csvContent = [
      headers.join(','),
      ...dataToExport.map((lead) =>
        [
          lead.username,
          `"${(lead.comment || '').replace(/"/g, '""')}"`,
          lead.keyword || '',
          lead.source,
          lead.emailCollected || '',
          lead.status,
          new Date(lead.capturedAt).toISOString()
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `replyflow-leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const getStatusBadge = (status, conversationStep) => {
    // Use conversation step if available for more detailed status
    const step = conversationStep || status;
    const styles = {
      // Conversation flow steps
      opening: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      waiting_button: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      waiting_follow: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      waiting_email: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      link_sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      // Legacy statuses
      pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      dm_sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      detected: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    };
    return styles[step] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  const getStatusLabel = (status, conversationStep) => {
    const step = conversationStep || status;
    const labels = {
      opening: 'Opening DM Sent',
      waiting_button: 'Waiting for Click',
      waiting_follow: 'Waiting for Follow',
      waiting_email: 'Waiting for Email',
      link_sent: 'Link Sent',
      completed: 'Completed',
      pending: 'Pending',
      processing: 'Processing',
      sent: 'Sent',
      dm_sent: 'DM Sent',
      failed: 'Failed'
    };
    return labels[step] || step;
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  };

  const formatCountdown = (scheduledAt) => {
    const now = currentTime;
    const scheduled = new Date(scheduledAt);
    const diff = scheduled - now;

    if (diff <= 0) return 'Sending now...';

    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const uniqueSources = [...new Set(leads.map((lead) => lead.source))];

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

      <div className="flex-1 ml-64">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leads & DM Queue</h1>
              <p className="text-gray-600 dark:text-gray-400">Track triggered comments and pending DMs</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export {selectedLeads.length > 0 ? `(${selectedLeads.length})` : ''}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Leads</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{leads.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">In Progress</p>
              <p className="text-3xl font-bold text-orange-600">
                {leads.filter((l) =>
                  l.conversationStep === 'waiting_button' ||
                  l.conversationStep === 'waiting_follow' ||
                  l.conversationStep === 'waiting_email'
                ).length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Pending</p>
              <p className="text-3xl font-bold text-yellow-600">
                {leads.filter((l) => l.status === 'pending' && !l.conversationStep?.startsWith('waiting')).length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-600">
                {leads.filter((l) => l.linkSent || l.conversationStep === 'completed' || l.conversationStep === 'link_sent').length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Today</p>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {leads.filter((l) => {
                  const today = new Date();
                  const capturedDate = new Date(l.capturedAt);
                  return capturedDate.toDateString() === today.toDateString();
                }).length}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === 'pending'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              Pending DMs ({pendingDMs.length})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              All Leads ({leads.length})
            </button>
          </div>

          {/* Pending DMs Tab */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              {pendingDMs.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center shadow-sm">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">All caught up!</h3>
                  <p className="text-gray-500 dark:text-gray-400">No pending DMs in the queue</p>
                </div>
              ) : (
                pendingDMs.map((dm) => (
                  <div key={dm.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {(dm.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">@{dm.username}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded text-xs font-medium mr-2">
                              {dm.keyword}
                            </span>
                            {dm.source}
                          </p>
                          {dm.comment && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">"{dm.comment}"</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {dm.isWaitingForAction ? (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse"></div>
                              <span className="text-sm font-medium text-orange-600">
                                {getStatusLabel(dm.status, dm.conversationStep)}
                              </span>
                            </div>
                            <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-4 py-2 rounded-xl">
                              <p className="text-xs opacity-80">Waiting for</p>
                              <p className="text-lg font-bold">
                                {dm.conversationStep === 'waiting_button' ? 'Button Click' :
                                 dm.conversationStep === 'waiting_follow' ? 'Follow' :
                                 dm.conversationStep === 'waiting_email' ? 'Email' : 'Response'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                              <span className="text-sm font-medium text-yellow-600">DM Scheduled</span>
                            </div>
                            <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-xl">
                              <p className="text-xs opacity-80">Sending in</p>
                              <p className="text-xl font-bold">{formatCountdown(dm.scheduledAt)}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* All Leads Tab */}
          {activeTab === 'all' && (
            <>
              {/* Filters */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm mb-6">
                <div className="flex items-center gap-4">
                  <div className="flex-1 relative">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by username or comment..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                    />
                  </div>
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 dark:text-white"
                  >
                    <option value="all">All Automations</option>
                    {uniqueSources.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 dark:text-white"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              {/* Leads Table */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                      <th className="py-4 px-6 text-left">
                        <input
                          type="checkbox"
                          checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-medium text-gray-500 dark:text-gray-400">USER</th>
                      <th className="py-4 px-6 text-left text-sm font-medium text-gray-500 dark:text-gray-400">COMMENT</th>
                      <th className="py-4 px-6 text-left text-sm font-medium text-gray-500 dark:text-gray-400">KEYWORD</th>
                      <th className="py-4 px-6 text-left text-sm font-medium text-gray-500 dark:text-gray-400">AUTOMATION</th>
                      <th className="py-4 px-6 text-left text-sm font-medium text-gray-500 dark:text-gray-400">EMAIL</th>
                      <th className="py-4 px-6 text-left text-sm font-medium text-gray-500 dark:text-gray-400">TIME</th>
                      <th className="py-4 px-6 text-left text-sm font-medium text-gray-500 dark:text-gray-400">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-16 text-center">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">No leads yet</h3>
                          <p className="text-gray-500 dark:text-gray-400">Triggers will appear here when keywords are detected.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => (
                        <tr key={lead.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-4 px-6">
                            <input
                              type="checkbox"
                              checked={selectedLeads.includes(lead.id)}
                              onChange={() => toggleSelectLead(lead.id)}
                              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                            />
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-semibold">
                                {(lead.username || '?').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">@{lead.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                            {lead.comment || '-'}
                          </td>
                          <td className="py-4 px-6">
                            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-1 rounded text-sm font-medium">
                              {lead.keyword || '-'}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{lead.source}</span>
                          </td>
                          <td className="py-4 px-6">
                            {lead.emailCollected ? (
                              <span className="text-sm text-green-600 dark:text-green-400 font-medium">{lead.emailCollected}</span>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-gray-500 dark:text-gray-400 text-sm">
                            {formatTimeAgo(lead.capturedAt)}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(lead.status, lead.conversationStep)}`}>
                              {getStatusLabel(lead.status, lead.conversationStep)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {filteredLeads.length > 0 && (
                  <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Showing {filteredLeads.length} of {leads.length} leads
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Export Leads</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {selectedLeads.length > 0
                ? `Export ${selectedLeads.length} selected leads to CSV`
                : `Export all ${filteredLeads.length} leads to CSV`}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                Cancel
              </button>
              <button
                onClick={exportToCSV}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
