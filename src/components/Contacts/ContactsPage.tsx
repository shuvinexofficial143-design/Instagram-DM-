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
  Sparkles,
  Bot,
  Send,
  WandSparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Contact } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';

export const ContactsPage: React.FC = () => {
  const { contacts, deleteContact, deleteContactsBulk, sendManualReply } = useApp();
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [bulkMode, setBulkMode] = useState<'normal' | 'ai'>('normal');
  const [bulkAudience, setBulkAudience] = useState<'selected' | 'all'>('selected');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkConsentConfirmed, setBulkConsentConfirmed] = useState(false);

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
    <div className="min-h-screen space-y-5 bg-[#F7FAFF] p-4 sm:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white/90 via-blue-50/75 to-violet-50/80 p-5 shadow-[0_14px_45px_rgba(72,95,145,0.08)] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-200/35 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20"><Users className="h-6 w-6" /></div>
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-indigo-500"><Sparkles className="h-3.5 w-3.5" />Audience workspace</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Contacts</h1>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-600">Search, review and manage people captured from real Instagram interactions.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white/80 px-4 py-3 text-center shadow-sm">
            <div className="text-2xl font-black text-slate-950">{filteredContacts.length}</div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Visible contacts</div>
          </div>
        </div>
      </section>
      <section className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-white/90 via-blue-50/65 to-violet-50/80 p-5 shadow-[0_12px_36px_rgba(72,95,145,0.07)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md shadow-indigo-500/20"><Send className="h-4 w-4" /></div>
            <div><div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Bulk Messages</div><h2 className="mt-1 text-xl font-black text-slate-950">Send to your contacts</h2><p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-600">Send only to people who have already interacted with your account and are eligible for messaging. Bulk sending stops automatically if Instagram returns a rate-limit or permission error.</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setBulkAudience('selected')} className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${bulkAudience === 'selected' ? 'border-indigo-200 bg-indigo-600 text-white' : 'border-indigo-100 bg-white/80 text-slate-700'}`}>Selected ({selectedContactIds.length})</button>
            <button type="button" onClick={() => setBulkAudience('all')} className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${bulkAudience === 'all' ? 'border-indigo-200 bg-indigo-600 text-white' : 'border-indigo-100 bg-white/80 text-slate-700'}`}>All Visible ({filteredContacts.length})</button>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5">
          <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-amber-950">
            <input type="checkbox" checked={bulkConsentConfirmed} onChange={(e) => setBulkConsentConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-600" />
            <span>I confirm these recipients previously interacted with this Instagram account and this message is relevant to that interaction. Do not use this tool for unsolicited promotional DMs.</span>
          </label>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[180px_1fr_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500">Message Mode</label>
            <div className="flex rounded-xl border border-indigo-100 bg-white/80 p-1">
              <button type="button" onClick={() => setBulkMode('normal')} className={`flex-1 rounded-lg px-2 py-2 text-xs font-black ${bulkMode === 'normal' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}>Normal</button>
              <button type="button" onClick={() => setBulkMode('ai')} className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-black ${bulkMode === 'ai' ? 'bg-violet-50 text-violet-700' : 'text-slate-500'}`}><Bot className="h-3.5 w-3.5" />AI</button>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500">{bulkMode === 'ai' ? 'AI instruction / base message' : 'Message'}</label>
            <textarea value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} rows={2} placeholder={bulkMode === 'ai' ? 'Write the intent for a personalized message…' : 'Write the message to send…'} className="w-full resize-none rounded-xl border border-indigo-100 bg-white/90 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <button type="button" disabled={bulkSending || !bulkConsentConfirmed || !bulkMessage.trim() || (bulkAudience === 'selected' && selectedContactIds.length === 0)} onClick={async () => {
            const targets = bulkAudience === 'all' ? filteredContacts : filteredContacts.filter((contact) => selectedContactIds.includes(contact.id));
            if (!targets.length) return;
            if (!bulkConsentConfirmed) return;
            if (!window.confirm(`Send ${bulkMode === 'ai' ? 'AI-personalized ' : ''}message to ${targets.length} eligible contact(s)? Sending will stop if Instagram reports a rate-limit or permission error.`)) return;
            setBulkSending(true);
            setBulkStatus('');
            let sent = 0;
            let failed = 0;
            let lastError = '';
            let stoppedEarly = false;
            try {
              for (const contact of targets) {
                const username = contact.ig_username || contact.ig_user_id;
                if (!username) { failed += 1; continue; }
                try {
                  let finalMessage = bulkMessage.trim();
                  if (bulkMode === 'ai') {
                    const aiRes = await fetch('/api/openai/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        text: `Recipient Instagram username: @${String(username).replace(/^@/, '')}\nMessage goal/instruction: ${bulkMessage.trim()}\nWrite only the final DM text. Do not explain your answer.`,
                        systemInstruction: 'You write concise, natural Instagram direct messages. Follow the supplied message goal faithfully. Personalize only from facts explicitly provided and never invent personal details. Keep it useful and human, normally 1-3 short sentences. Do not mention AI or platform safeguards.',
                        personality: 'Friendly',
                        language: 'Auto Detect',
                        assistantName: 'Sales Assistant',
                        maxReplyLength: 'short',
                      }),
                    });
                    const aiData = await aiRes.json().catch(() => ({}));
                    if (!aiRes.ok || !aiData?.reply) throw new Error(aiData?.error || 'AI generation failed');
                    finalMessage = String(aiData.reply).trim();
                  }
                  const sendResult: any = await Promise.resolve(sendManualReply(username, finalMessage));
                  if (sendResult === false || sendResult?.ok === false) throw new Error(sendResult?.error || 'Instagram send failed');
                  sent += 1;
                  // Keep bulk traffic sequential instead of creating a burst.
                  await new Promise((resolve) => setTimeout(resolve, 1200));
                } catch (error) {
                  console.warn('[BULK_MESSAGE_ITEM_FAILED]', username, error);
                  lastError = error instanceof Error ? error.message : String(error || 'Unknown error');
                  failed += 1;
                  const lowerError = lastError.toLowerCase();
                  if (lowerError.includes('rate') || lowerError.includes('limit') || lowerError.includes('permission') || lowerError.includes('temporar') || lowerError.includes('429')) {
                    stoppedEarly = true;
                    break;
                  }
                }
              }
              setBulkStatus(`${stoppedEarly ? 'Stopped for account safety' : 'Completed'}: ${sent} sent${failed ? `, ${failed} failed${lastError ? ` — ${lastError}` : ''}` : ''}.`);
              if (sent > 0) setBulkMessage('');
              setBulkConsentConfirmed(false);
            } finally { setBulkSending(false); }
          }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 text-xs font-black text-white shadow-md disabled:cursor-not-allowed disabled:opacity-40"><WandSparkles className="h-4 w-4" />{bulkSending ? 'Sending…' : 'Send Message'}</button>
        </div>
        {bulkMode === 'ai' && <p className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs font-semibold leading-5 text-violet-800">AI mode uses the same OpenAI integration as AI Conversation to create a personalized DM for each chosen contact before sending.</p>}
        {bulkStatus && <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-800">{bulkStatus}</p>}
      </section>

      {/* Filter & Action Toolbar */}
      <div className="flex flex-col items-stretch justify-between gap-4 rounded-3xl border border-white/90 bg-white/85 p-4 shadow-[0_12px_36px_rgba(72,95,145,0.07)] backdrop-blur-sm md:flex-row md:items-center">
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
      <div className="overflow-hidden rounded-3xl border border-white/90 bg-white/85 shadow-[0_12px_36px_rgba(72,95,145,0.07)] backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-indigo-100 bg-gradient-to-r from-blue-50/90 to-violet-50/80 text-[11px] font-black uppercase tracking-wider text-slate-800">
              <tr>
                <th className="p-4 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    title="Select All"
                    className="text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="h-6 w-6 text-indigo-600 drop-shadow-sm" />
                    ) : (
                      <Square className="h-6 w-6 text-indigo-500 stroke-[2.5]" />
                    )}
                  </button>
                </th>
                <th className="p-3 sm:p-4">Instagram User</th>
                <th className="p-4">First Captured</th>
                <th className="p-4">Last Active</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-600 font-bold">
                    No captured contacts found. Incoming Instagram interactions will automatically appear here.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-indigo-50/35 transition-colors ${
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
                            <CheckSquare className="h-6 w-6 text-indigo-600 drop-shadow-sm" />
                          ) : (
                            <Square className="h-6 w-6 text-indigo-500 stroke-[2.5]" />
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
                            <div className="text-[10px] font-semibold text-slate-500">Instagram contact</div>
                          </div>
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
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setActiveContact(contact)}
                            className="whitespace-nowrap rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 transition-colors hover:bg-indigo-100 cursor-pointer"
                          >
                            View History
                          </button>
                          <button
                            onClick={() => handleRemoveSingle(contact)}
                            title="Remove contact from database permanently"
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-rose-100 bg-rose-50/70 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-100 cursor-pointer"
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
          <div className="flex h-full w-full max-w-md flex-col justify-between overflow-y-auto border-l border-indigo-100 bg-[#F7FAFF] p-5 shadow-2xl sm:p-6">
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

              <div className="mb-6 space-y-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-blue-50/70 to-violet-50/60 p-4">
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
