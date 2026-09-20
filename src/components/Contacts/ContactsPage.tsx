import React, { useState } from 'react';
import {
  Users,
  Search,
  Download,
  Filter,
  MessageCircle,
  MessageSquare,
  Instagram,
  Clock,
  Tag,
  ChevronRight,
  X,
  ExternalLink,
  ShieldCheck,
  Trash2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Contact } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';

export const ContactsPage: React.FC = () => {
  const { contacts, deleteContact, deleteContactsBulk } = useApp();
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  // Checkbox Selection State for Bulk Operations
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  // Collect unique tags
  const allTags = Array.from(new Set((contacts || []).flatMap((c) => c?.tags || [])));

  const filteredContacts = (contacts || []).filter((c) => {
    if (!c) return false;
    if (c.is_test === true) return false;
    const uname = (c.ig_username || c.ig_user_id || '').toLowerCase();
    if (
      uname.includes('940977') ||
      uname.startsWith('user_940977') ||
      uname === 'webhook_test_user' ||
      uname.startsWith('user_') ||
      uname.includes('test_user')
    ) {
      return false;
    }
    const matchesSearch = uname.includes(search.toLowerCase());
    const matchesTag = !selectedTag || (Array.isArray(c.tags) && c.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  const isAllSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((c) => selectedContactIds.includes(c.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(filteredContacts.map((c) => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRemoveSingle = async (contact: Contact) => {
    const uname = contact.ig_username || contact.ig_user_id || 'user';
    if (
      window.confirm(
        `Are you sure you want to permanently remove @${uname}? This will delete the contact and all associated chat history from the database.`
      )
    ) {
      await deleteContact(contact.id, contact.ig_username);
      setSelectedContactIds((prev) => prev.filter((id) => id !== contact.id));
      if (activeContact?.id === contact.id) {
        setActiveContact(null);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedContactIds.length === 0) return;
    const targetContacts = (contacts || []).filter((c) => selectedContactIds.includes(c.id));
    const targetUsernames = targetContacts.map((c) => c.ig_username || c.ig_user_id || '');

    if (
      window.confirm(
        `Are you sure you want to permanently remove ${selectedContactIds.length} selected contact(s) and their message histories from the database?`
      )
    ) {
      await deleteContactsBulk(selectedContactIds, targetUsernames);
      setSelectedContactIds([]);
      if (activeContact && selectedContactIds.includes(activeContact.id)) {
        setActiveContact(null);
      }
    }
  };

  const exportCsv = () => {
    const headers = 'IG Username,First Interaction,Last Interaction,Comments,DMs,Stories,Status\n';
    const rows = (contacts || [])
      .map(
        (c) =>
          `@${c.ig_username || c.ig_user_id || 'unknown'},${c.first_interaction_at || ''},${c.last_interaction_at || ''},${c.interactions?.comments || 0},${c.interactions?.dms || 0},${c.interactions?.stories || 0},${c.status || 'lead'}`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoreply_captured_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-8 space-y-6 bg-[#F7FAFF] min-h-screen">
      {/* Filter & Action Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 stroke-[2.2]" />
          <input
            type="text"
            placeholder="Search by Instagram username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-[#3B5BFF] focus:outline-hidden"
          />
        </div>

        {/* Tag Filters & Bulk Delete & Export Button */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          {selectedContactIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-black text-xs py-2 px-3.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedContactIds.length})</span>
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedTag === null ? 'bg-[#3B5BFF] text-white shadow-xs' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              All Tags
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedTag === tag ? 'bg-[#3B5BFF] text-white shadow-xs' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <button
            onClick={exportCsv}
            className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2 px-3.5 rounded-xl btn-primary-elevated flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 stroke-[2.2]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-900 font-black uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-4 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    title="Select All"
                    className="text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#3B5BFF]" />
                    ) : (
                      <Square className="w-4 h-4 stroke-[2.2]" />
                    )}
                  </button>
                </th>
                <th className="p-4">Instagram User</th>
                <th className="p-4">Interactions Breakdown</th>
                <th className="p-4">Tags</th>
                <th className="p-4">First Captured</th>
                <th className="p-4">Last Active</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-600 font-bold">
                    No captured contacts found. Incoming Instagram interactions will automatically appear here.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      {/* Select Checkbox */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleSelectOne(contact.id)}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#3B5BFF]" />
                          ) : (
                            <Square className="w-4 h-4 stroke-[2.2]" />
                          )}
                        </button>
                      </td>

                      {/* User Info */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            src={contact.avatar_url}
                            username={contact.ig_username}
                            size="md"
                          />
                          <div>
                            <div className="font-black text-slate-950">@{contact.ig_username}</div>
                            <div className="text-[10px] text-slate-500 font-bold">ID: {contact.ig_user_id}</div>
                          </div>
                        </div>
                      </td>

                      {/* Breakdown */}
                      <td className="p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 bg-purple-100 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md text-[11px] font-black">
                            <MessageSquare className="w-3 h-3 stroke-[2.2]" />
                            <span>{contact.interactions?.comments || 0} comments</span>
                          </div>
                          <div className="flex items-center gap-1 bg-blue-100 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md text-[11px] font-black">
                            <MessageCircle className="w-3 h-3 stroke-[2.2]" />
                            <span>{contact.interactions?.dms || 0} DMs</span>
                          </div>
                          <div className="flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md text-[11px] font-black">
                            <Instagram className="w-3 h-3 stroke-[2.2]" />
                            <span>{contact.interactions?.stories || 0} stories</span>
                          </div>
                        </div>
                      </td>

                      {/* Tags */}
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags?.map((t, idx) => (
                            <span
                              key={idx}
                              className="bg-slate-200 text-slate-900 border border-slate-300 font-bold px-2 py-0.5 rounded text-[10px]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* First Captured */}
                      <td className="p-4 text-slate-800 font-bold text-[11px]">
                        {new Date(contact.first_interaction_at).toLocaleDateString()}
                      </td>

                      {/* Last Active */}
                      <td className="p-4 text-slate-800 font-bold text-[11px]">
                        {new Date(contact.last_interaction_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setActiveContact(contact)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-[#3B5BFF] font-bold text-[11px] px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                          >
                            View History
                          </button>
                          <button
                            onClick={() => handleRemoveSingle(contact)}
                            title="Remove contact from database permanently"
                            className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] px-2.5 py-1.5 rounded-lg border border-red-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact History Detail Drawer */}
      {activeContact && (
        <div className="fixed inset-0 bg-slate-900/75 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <h3 className="font-bold text-slate-900 text-base">Contact Profile</h3>
                <button
                  onClick={() => setActiveContact(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-center mb-6">
                <div className="flex justify-center mb-2">
                  <UserAvatar
                    src={activeContact.avatar_url}
                    username={activeContact.ig_username}
                    size="2xl"
                  />
                </div>
                <h4 className="font-extrabold text-slate-900 text-lg">@{activeContact.ig_username}</h4>
                <p className="text-xs text-slate-500">Instagram User • Captured Contact</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 mb-6">
                <div className="text-xs font-bold text-slate-800">Engagement Breakdown:</div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="font-black text-purple-600">{activeContact.interactions.comments}</div>
                    <div className="text-[10px] text-slate-500">Comments</div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="font-black text-blue-600">{activeContact.interactions.dms}</div>
                    <div className="text-[10px] text-slate-500">DMs</div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="font-black text-amber-600">{activeContact.interactions.stories}</div>
                    <div className="text-[10px] text-slate-500">Stories</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleRemoveSingle(activeContact)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove Contact Permanently</span>
              </button>
              <button
                onClick={() => setActiveContact(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 rounded-xl text-xs cursor-pointer transition-all"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
