import { useState, useEffect, useRef } from 'react';
import { supportAPI } from '../utils/api';
import Sidebar from '../components/Sidebar';

const AdminChat = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load messages when user selected
  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.userId);
      pollRef.current = setInterval(() => fetchMessages(selectedUser.userId), 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedUser?.userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const res = await supportAPI.getConversations();
      setConversations(res.data.conversations || []);
    } catch {}
  };

  const fetchMessages = async (userId) => {
    try {
      const res = await supportAPI.getAdminMessages(userId);
      setMessages(res.data.messages || []);
    } catch {}
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedUser || sending) return;
    setSending(true);
    try {
      const res = await supportAPI.sendAdminReply(selectedUser.userId, input.trim());
      setMessages(prev => [...prev, res.data.message]);
      setInput('');
      fetchConversations(); // Refresh sidebar
    } catch {}
    setSending(false);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className="ml-64 flex-1 flex">
        {/* Conversations List */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Support Inbox</h2>
            <p className="text-xs text-gray-400 mt-1">{conversations.length} conversation(s)</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.userId}
                onClick={() => setSelectedUser(conv)}
                className={`w-full p-4 text-left border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                  selectedUser?.userId === conv.userId ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">{conv.name || 'Unknown'}</p>
                      {conv.unreadCount > 0 && (
                        <span className="w-5 h-5 bg-purple-600 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{conv.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{conv.lastMessage}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{formatTime(conv.lastMessageAt)}</span>
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">No messages yet</div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950">
          {selectedUser ? (
            <>
              {/* Chat Header */}
              <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <p className="font-semibold text-gray-800 dark:text-white">{selectedUser.name || 'Unknown User'}</p>
                <p className="text-xs text-gray-400">{selectedUser.email}</p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.fromAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[60%] px-4 py-2.5 rounded-2xl text-sm ${
                      msg.fromAdmin
                        ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-br-md'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-md'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      <p className={`text-[10px] mt-1 ${msg.fromAdmin ? 'text-white/60' : 'text-gray-400'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type your reply..."
                    className="flex-1 px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-xl border-0 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400">Select a conversation to start replying</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminChat;
