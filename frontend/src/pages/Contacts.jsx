import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { automationAPI } from '../utils/api';

const Contacts = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      // Get all leads from all automations as contacts
      const automationsRes = await automationAPI.getAll();
      const automations = automationsRes.data.automations || [];

      // For now, we'll use triggers as contacts (users who interacted)
      let allContacts = [];
      for (const automation of automations) {
        try {
          const triggersRes = await automationAPI.getTriggers(automation.id);
          const triggers = triggersRes.data.triggers || [];
          allContacts = [...allContacts, ...triggers.map(t => ({
            id: t.id,
            username: t.commenterUsername,
            comment: t.commentText,
            keyword: t.matchedKeyword,
            dmSent: t.dmSent,
            createdAt: t.createdAt,
            automationName: automation.name
          }))];
        } catch (e) {
          console.error('Error fetching triggers:', e);
        }
      }

      // Remove duplicates by username
      const uniqueContacts = allContacts.reduce((acc, contact) => {
        const existing = acc.find(c => c.username === contact.username);
        if (!existing) {
          acc.push(contact);
        }
        return acc;
      }, []);

      setContacts(uniqueContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Contacts</h1>
            <p className="text-gray-500 mt-1">
              Contact list stores all Instagram accounts that have interacted with you.
            </p>
          </div>

          {/* Contacts List */}
          <div className="bg-white rounded-2xl shadow-sm">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-500">Loading contacts...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-gray-500">No contacts found</p>
                <p className="text-sm text-gray-400 mt-1">
                  Contacts will appear here when users interact with your automations.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">USERNAME</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">COMMENT</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">KEYWORD</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">DM STATUS</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">DATE</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-500 text-sm">AUTOMATION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <a
                            href={`https://instagram.com/${contact.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:underline font-medium"
                          >
                            @{contact.username}
                          </a>
                        </td>
                        <td className="py-4 px-6 text-gray-600 max-w-xs truncate">
                          {contact.comment || '-'}
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                            {contact.keyword}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          {contact.dmSent ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                              Sent
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-gray-500 text-sm">
                          {new Date(contact.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-6 text-gray-500 text-sm">
                          {contact.automationName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contacts;
