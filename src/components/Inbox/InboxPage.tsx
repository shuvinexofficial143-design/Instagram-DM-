import React, { useEffect, useMemo, useState } from 'react';
import {
  AlarmClock, ArrowLeft, Bot, BotOff, CheckCircle2, ChevronDown, Circle, Clock3,
  Inbox, MessageSquareText, MoreHorizontal, Plus, Search, Send, Star, Tag, Trash2,
  UserCheck, X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth, removeUserDocument, saveUserDocument, subscribeToUserCollection } from '../../lib/supabase';
import { UserAvatar } from '../Common/UserAvatar';

type ThreadStatus = 'open' | 'pending' | 'resolved';
type Priority = 'normal' | 'high';

type ThreadMeta = {
  id: string;
  status: ThreadStatus;
  priority: Priority;
  assignee: string;
  labels: string[];
  snooze_until?: string;
  updated_at: string;
};

type InboxNote = {
  id: string;
  thread_id: string;
  text: string;
  created_at: string;
};

type SavedReply = {
  id: string;
  title: string;
  text: string;
  created_at: string;
};

const cleanKey = (value: string) => value.replace(/^@/, '').trim().toLowerCase();
const emptyMeta = (id: string): ThreadMeta => ({
  id,
  status: 'open',
  priority: 'normal',
  assignee: '',
  labels: [],
  updated_at: new Date().toISOString(),
});

export const InboxPage: React.FC = () => {
  const {
    inboxMessages, instagramAccount, contacts, firebaseUser, sendManualReply,
    isAiPausedForUser, toggleAiForUser, deleteInboxThread, markInboxThreadRead, markInboxThreadUnread,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'open' | 'pending' | 'resolved' | 'high' | 'snoozed'>('all');
  const [activeUsername, setActiveUsername] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [metas, setMetas] = useState<ThreadMeta[]>([]);
  const [notes, setNotes] = useState<InboxNote[]>([]);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const [noteText, setNoteText] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newReplyTitle, setNewReplyTitle] = useState('');
  const [newReplyText, setNewReplyText] = useState('');
  const [showSavedReplies, setShowSavedReplies] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const stopMeta = subscribeToUserCollection<ThreadMeta>(uid, 'inbox_thread_meta', setMetas);
    const stopNotes = subscribeToUserCollection<InboxNote>(uid, 'inbox_notes', setNotes);
    const stopReplies = subscribeToUserCollection<SavedReply>(uid, 'inbox_saved_replies', setSavedReplies);
    return () => { stopMeta(); stopNotes(); stopReplies(); };
  }, []);

  const metaMap = useMemo(() => new Map(metas.map((item) => [cleanKey(item.id), item])), [metas]);
  const myUsername = cleanKey(instagramAccount?.username || '');

  const groupedUsers = useMemo(() => {
    const users = new Set<string>();
    for (const message of inboxMessages || []) {
      if (message.is_test) continue;
      const value = message.from_username || message.from_ig_id || '';
      const key = cleanKey(value);
      if (key && key !== myUsername && !key.startsWith('user_') && !key.includes('test_user')) users.add(value.replace(/^@/, ''));
    }
    for (const contact of contacts || []) {
      if (contact.is_test) continue;
      const value = contact.ig_username || contact.ig_user_id || '';
      const key = cleanKey(value);
      if (key && key !== myUsername && !key.startsWith('user_') && !key.includes('test_user')) users.add(value.replace(/^@/, ''));
    }
    return [...users];
  }, [inboxMessages, contacts, myUsername]);

  const summaryFor = (username: string) => {
    const key = cleanKey(username);
    const messages = (inboxMessages || [])
      .filter((m) => cleanKey(m.from_username || m.from_ig_id || '') === key)
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    const unread = messages.filter((m) => m.direction === 'in' && !m.is_read).length;
    return { messages, last: messages[0], unread };
  };

  const visibleUsers = groupedUsers.filter((username) => {
    const key = cleanKey(username);
    const meta = metaMap.get(key) || emptyMeta(key);
    const summary = summaryFor(username);
    const matchesSearch = !search.trim() || key.includes(cleanKey(search));
    if (!matchesSearch) return false;
    if (filter === 'unread') return summary.unread > 0;
    if (filter === 'open') return meta.status === 'open';
    if (filter === 'pending') return meta.status === 'pending';
    if (filter === 'resolved') return meta.status === 'resolved';
    if (filter === 'high') return meta.priority === 'high';
    if (filter === 'snoozed') return Boolean(meta.snooze_until && new Date(meta.snooze_until).getTime() > Date.now());
    return true;
  }).sort((a, b) => {
    const aTs = new Date(summaryFor(a).last?.timestamp || 0).getTime();
    const bTs = new Date(summaryFor(b).last?.timestamp || 0).getTime();
    return bTs - aTs;
  });

  useEffect(() => {
    const requested = sessionStorage.getItem('autoreply:open-inbox-user');
    if (requested) {
      setActiveUsername(requested.replace(/^@/, ''));
      setMobileChatOpen(true);
      sessionStorage.removeItem('autoreply:open-inbox-user');
    }
  }, []);

  const selectedUser = activeUsername || visibleUsers[0] || '';
  const selectedKey = cleanKey(selectedUser);
  const selectedMeta = metaMap.get(selectedKey) || emptyMeta(selectedKey);
  const selectedSummary = selectedUser ? summaryFor(selectedUser) : { messages: [], last: undefined, unread: 0 };
  const currentThread = [...selectedSummary.messages].sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
  const selectedContact = (contacts || []).find((contact) => cleanKey(contact.ig_username || contact.ig_user_id || '') === selectedKey);
  const selectedNotes = notes.filter((note) => cleanKey(note.thread_id) === selectedKey).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const aiPaused = selectedUser ? isAiPausedForUser(selectedUser) : false;

  useEffect(() => {
    if (selectedUser) void markInboxThreadRead(selectedUser);
  }, [selectedKey]);

  const saveMeta = async (updates: Partial<ThreadMeta>) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !selectedKey) return;
    const next: ThreadMeta = { ...selectedMeta, ...updates, id: selectedKey, updated_at: new Date().toISOString() };
    await saveUserDocument(uid, 'inbox_thread_meta', next);
    setMetas((prev) => prev.some((item) => cleanKey(item.id) === selectedKey)
      ? prev.map((item) => cleanKey(item.id) === selectedKey ? next : item)
      : [next, ...prev]);
  };

  const addNote = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !selectedKey || !noteText.trim()) return;
    const note: InboxNote = { id: 'note_' + Date.now(), thread_id: selectedKey, text: noteText.trim(), created_at: new Date().toISOString() };
    await saveUserDocument(uid, 'inbox_notes', note);
    setNotes((prev) => [note, ...prev]);
    setNoteText('');
  };

  const addLabel = async () => {
    const label = newLabel.trim();
    if (!label) return;
    await saveMeta({ labels: Array.from(new Set([...(selectedMeta.labels || []), label])) });
    setNewLabel('');
  };

  const removeLabel = async (label: string) => {
    await saveMeta({ labels: (selectedMeta.labels || []).filter((item) => item !== label) });
  };

  const saveQuickReply = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !newReplyTitle.trim() || !newReplyText.trim()) return;
    const reply: SavedReply = { id: 'reply_' + Date.now(), title: newReplyTitle.trim(), text: newReplyText.trim(), created_at: new Date().toISOString() };
    await saveUserDocument(uid, 'inbox_saved_replies', reply);
    setSavedReplies((prev) => [reply, ...prev]);
    setNewReplyTitle('');
    setNewReplyText('');
  };

  const deleteQuickReply = async (reply: SavedReply) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await removeUserDocument(uid, 'inbox_saved_replies', reply.id);
    setSavedReplies((prev) => prev.filter((item) => item.id !== reply.id));
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser || !inputText.trim()) return;
    await Promise.resolve(sendManualReply(selectedUser, inputText.trim()));
    setInputText('');
    if (selectedMeta.status === 'resolved') await saveMeta({ status: 'open' });
  };

  const snoozeFor = async (hours: number) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await saveMeta({ status: 'pending', snooze_until: until });
  };

  const getAvatar = (username: string) => {
    const key = cleanKey(username);
    const contact = (contacts || []).find((item) => cleanKey(item.ig_username || item.ig_user_id || '') === key);
    if (contact?.avatar_url && !contact.avatar_url.includes('dicebear')) return contact.avatar_url;
    const message = (inboxMessages || []).find((item) => cleanKey(item.from_username || item.from_ig_id || '') === key && item.from_avatar);
    return message?.from_avatar || '';
  };

  const statusCounts = {
    all: groupedUsers.length,
    unread: groupedUsers.filter((u) => summaryFor(u).unread > 0).length,
    open: groupedUsers.filter((u) => (metaMap.get(cleanKey(u)) || emptyMeta(cleanKey(u))).status === 'open').length,
    pending: groupedUsers.filter((u) => (metaMap.get(cleanKey(u)) || emptyMeta(cleanKey(u))).status === 'pending').length,
    resolved: groupedUsers.filter((u) => (metaMap.get(cleanKey(u)) || emptyMeta(cleanKey(u))).status === 'resolved').length,
  };

  return (
    <div className="min-h-full bg-[#F7FAFF] p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">Conversation workspace</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Advanced Inbox</h1><p className="mt-1 text-sm text-slate-500">Prioritize, assign, snooze, resolve and document Instagram conversations.</p></div>
          <div className="flex flex-wrap gap-2">
            {(['all','unread','open','pending','resolved'] as const).map((id) => (
              <button key={id} onClick={() => setFilter(id)} className={'rounded-xl border px-3 py-2 text-xs font-bold ' + (filter === id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600')}>{id[0].toUpperCase() + id.slice(1)} <span className="opacity-70">({statusCounts[id]})</span></button>
            ))}
            <button onClick={() => setFilter('high')} className={'rounded-xl border px-3 py-2 text-xs font-bold ' + (filter === 'high' ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 bg-white text-slate-600')}>High priority</button>
            <button onClick={() => setFilter('snoozed')} className={'rounded-xl border px-3 py-2 text-xs font-bold ' + (filter === 'snoozed' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-200 bg-white text-slate-600')}>Snoozed</button>
          </div>
        </header>

        <div className="flex h-[78vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <aside className={(mobileChatOpen ? 'hidden md:flex' : 'flex') + ' w-full flex-col border-r border-slate-200 md:w-[310px] xl:w-[340px]'}>
            <div className="border-b border-slate-200 p-3">
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-indigo-400" /></label>
            </div>
            <div className="flex-1 overflow-y-auto">
              {visibleUsers.map((username) => {
                const key = cleanKey(username);
                const meta = metaMap.get(key) || emptyMeta(key);
                const summary = summaryFor(username);
                const active = key === selectedKey;
                return (
                  <button key={key} onClick={() => { setActiveUsername(username); setMobileChatOpen(true); }} className={'w-full border-b border-slate-100 p-3 text-left transition ' + (active ? 'bg-indigo-50' : 'hover:bg-slate-50')}>
                    <div className="flex gap-2.5">
                      <UserAvatar src={getAvatar(username)} username={username} size="sm" isAiPaused={isAiPausedForUser(username)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5"><p className="truncate text-xs font-bold text-slate-900">@{username}</p>{meta.priority === 'high' && <Star className="h-3 w-3 fill-rose-500 text-rose-500" />}{summary.unread > 0 && <span className="ml-auto min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-center text-[9px] font-black text-white">{Math.min(99, summary.unread)}</span>}</div>
                        <p className="mt-1 truncate text-[11px] text-slate-500">{summary.last?.message_text || 'No messages yet'}</p>
                        <div className="mt-1.5 flex items-center gap-1.5"><span className={'rounded-full px-1.5 py-0.5 text-[9px] font-bold ' + (meta.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : meta.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700')}>{meta.status}</span>{meta.assignee && <span className="truncate text-[9px] font-semibold text-slate-400">· {meta.assignee}</span>}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!visibleUsers.length && <div className="p-8 text-center text-xs text-slate-400">No conversations match this filter.</div>}
            </div>
          </aside>

          <main className={(mobileChatOpen ? 'flex' : 'hidden md:flex') + ' min-w-0 flex-1 flex-col'}>
            {!selectedUser ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a conversation</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <button onClick={() => setMobileChatOpen(false)} className="rounded-lg p-2 text-slate-500 md:hidden"><ArrowLeft className="h-4 w-4" /></button>
                    <UserAvatar src={getAvatar(selectedUser)} username={selectedUser} size="md" isAiPaused={aiPaused} />
                    <div className="min-w-0"><h2 className="truncate text-sm font-bold text-slate-900">@{selectedUser}</h2><p className="text-[10px] text-slate-500">{selectedMeta.assignee ? 'Assigned to ' + selectedMeta.assignee : 'Unassigned'} · {selectedMeta.status}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => void saveMeta({ priority: selectedMeta.priority === 'high' ? 'normal' : 'high' })} className={'rounded-lg border p-2 ' + (selectedMeta.priority === 'high' ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 text-slate-500')} title="Toggle priority"><Star className="h-4 w-4" /></button>
                    <button onClick={() => void saveMeta({ assignee: selectedMeta.assignee ? '' : (firebaseUser?.displayName || firebaseUser?.email || 'Me') })} className="rounded-lg border border-slate-200 p-2 text-slate-600" title="Assign to me"><UserCheck className="h-4 w-4" /></button>
                    <button onClick={() => void snoozeFor(1)} className="rounded-lg border border-slate-200 p-2 text-slate-600" title="Snooze 1 hour"><AlarmClock className="h-4 w-4" /></button>
                    <button onClick={() => toggleAiForUser(selectedUser)} className={'rounded-lg border p-2 ' + (aiPaused ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')} title={aiPaused ? 'Enable AI' : 'Pause AI'}>{aiPaused ? <BotOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</button>
                    <button onClick={() => void saveMeta({ status: selectedMeta.status === 'resolved' ? 'open' : 'resolved', snooze_until: undefined })} className={'rounded-lg px-3 py-2 text-xs font-bold ' + (selectedMeta.status === 'resolved' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-600 text-white')}>{selectedMeta.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>
                    <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className="rounded-lg border border-slate-200 p-2 text-slate-500"><MoreHorizontal className="h-4 w-4" /></button>
                  </div>
                </div>

                {selectedMeta.snooze_until && new Date(selectedMeta.snooze_until).getTime() > Date.now() && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800">Snoozed until {new Date(selectedMeta.snooze_until).toLocaleString()} · <button onClick={() => void saveMeta({ snooze_until: undefined, status: 'open' })} className="underline">Unsnooze</button></div>}

                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                  {currentThread.map((message) => {
                    const outgoing = message.direction === 'out';
                    return (
                      <div key={message.id} className={'flex flex-col ' + (outgoing ? 'items-end' : 'items-start')}>
                        <div className={'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm ' + (outgoing ? 'rounded-br-sm bg-indigo-600 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800')}>{message.message_text}</div>
                        <span className="mt-1 px-1 text-[9px] font-medium text-slate-400">{new Date(message.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}{outgoing && message.delivery_status ? ' · ' + message.delivery_status : ''}</span>
                      </div>
                    );
                  })}
                  {!currentThread.length && <div className="py-16 text-center text-xs text-slate-400">No messages yet.</div>}
                </div>

                <div className="relative border-t border-slate-200 bg-white p-3">
                  {showSavedReplies && (
                    <div className="absolute bottom-full left-3 right-3 z-20 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-800">Saved replies</p><button onClick={() => setShowSavedReplies(false)}><X className="h-4 w-4 text-slate-400" /></button></div>
                      <div className="mt-2 space-y-2">{savedReplies.map((reply) => <div key={reply.id} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2"><button onClick={() => { setInputText(reply.text); setShowSavedReplies(false); }} className="min-w-0 flex-1 text-left"><p className="text-xs font-bold text-slate-800">{reply.title}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{reply.text}</p></button><button onClick={() => void deleteQuickReply(reply)} className="p-1 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
                      <div className="mt-3 border-t border-slate-100 pt-3"><input value={newReplyTitle} onChange={(e) => setNewReplyTitle(e.target.value)} placeholder="Reply title" className="min-h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs" /><textarea value={newReplyText} onChange={(e) => setNewReplyText(e.target.value)} rows={2} placeholder="Saved reply text" className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" /><button onClick={() => void saveQuickReply()} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white">Save reply</button></div>
                    </div>
                  )}
                  <form onSubmit={handleSend} className="flex items-end gap-2">
                    <button type="button" onClick={() => setShowSavedReplies(!showSavedReplies)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600" title="Saved replies"><MessageSquareText className="h-4 w-4" /></button>
                    <textarea rows={1} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (inputText.trim()) void handleSend(e as any); } }} placeholder="Reply to this conversation…" className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                    <button disabled={!inputText.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
                  </form>
                </div>
              </>
            )}
          </main>

          {selectedUser && rightPanelOpen && (
            <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white xl:block">
              <div className="border-b border-slate-200 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact</p>
                <div className="mt-3 flex items-center gap-3"><UserAvatar src={getAvatar(selectedUser)} username={selectedUser} size="lg" /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">@{selectedUser}</p><p className="mt-1 text-[10px] text-slate-500">{selectedContact?.status || 'lead'} · {(selectedContact?.tags || []).join(', ') || 'No contact tags'}</p></div></div>
              </div>

              <div className="border-b border-slate-200 p-4">
                <p className="text-xs font-bold text-slate-800">Conversation controls</p>
                <div className="mt-3 grid grid-cols-3 gap-2">{(['open','pending','resolved'] as const).map((status) => <button key={status} onClick={() => void saveMeta({ status, snooze_until: status === 'open' ? undefined : selectedMeta.snooze_until })} className={'rounded-lg px-2 py-2 text-[10px] font-bold ' + (selectedMeta.status === status ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600')}>{status}</button>)}</div>
                <label className="mt-3 block"><span className="text-[10px] font-bold text-slate-500">Assignee</span><input value={selectedMeta.assignee} onChange={(e) => void saveMeta({ assignee: e.target.value })} placeholder="Unassigned" className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs" /></label>
              </div>

              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center gap-2"><Tag className="h-3.5 w-3.5 text-slate-400" /><p className="text-xs font-bold text-slate-800">Labels</p></div>
                <div className="mt-2 flex flex-wrap gap-1.5">{(selectedMeta.labels || []).map((label) => <span key={label} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">{label}<button onClick={() => void removeLabel(label)}><X className="h-3 w-3" /></button></span>)}</div>
                <div className="mt-2 flex gap-1.5"><input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addLabel(); } }} placeholder="Add label" className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-xs" /><button onClick={() => void addLabel()} className="rounded-lg bg-slate-900 px-2.5 text-white"><Plus className="h-3.5 w-3.5" /></button></div>
              </div>

              <div className="p-4">
                <p className="text-xs font-bold text-slate-800">Internal notes</p>
                <p className="mt-1 text-[10px] text-slate-400">Visible only inside your workspace.</p>
                <textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add context for this lead…" className="mt-3 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />
                <button onClick={() => void addNote()} disabled={!noteText.trim()} className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40">Add note</button>
                <div className="mt-3 space-y-2">{selectedNotes.map((note) => <div key={note.id} className="rounded-lg bg-slate-50 p-2.5"><p className="whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{note.text}</p><p className="mt-1 text-[9px] text-slate-400">{new Date(note.created_at).toLocaleString()}</p></div>)}</div>
              </div>

              <div className="border-t border-slate-200 p-4">
                <button onClick={() => void markInboxThreadUnread(selectedUser)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Mark unread</button>
                <button onClick={async () => { if (window.confirm('Delete this conversation permanently?')) { await deleteInboxThread(selectedUser); setActiveUsername(''); } }} className="mt-2 w-full rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">Delete conversation</button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
