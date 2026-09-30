import React, { useEffect, useMemo, useState } from 'react';
import { BadgeIndianRupee, CalendarClock, ChevronRight, CircleDollarSign, Filter, Mail, MessageCircle, Phone, Search, Target, UserRound, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth, saveUserDocument, subscribeToUserCollection } from '../../lib/supabase';
import { Contact } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';

type Stage = 'new' | 'qualified' | 'follow_up' | 'won' | 'lost';
type Priority = 'low' | 'normal' | 'high';

type CrmRecord = {
  id: string;
  stage: Stage;
  priority: Priority;
  deal_value: number;
  owner: string;
  phone: string;
  email: string;
  company: string;
  source: string;
  next_follow_up: string;
  notes: string;
  updated_at: string;
};

const stages: Array<{ id: Stage; label: string }> = [
  { id: 'new', label: 'New Lead' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'follow_up', label: 'Follow-up' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

const emptyRecord = (id: string): CrmRecord => ({
  id,
  stage: 'new',
  priority: 'normal',
  deal_value: 0,
  owner: '',
  phone: '',
  email: '',
  company: '',
  source: 'Instagram',
  next_follow_up: '',
  notes: '',
  updated_at: new Date().toISOString(),
});

export const CrmPage: React.FC = () => {
  const { contacts, inboxMessages, setActiveTab } = useApp();
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<CrmRecord | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToUserCollection<CrmRecord>(uid, 'crm_records', setRecords);
  }, []);

  const recordMap = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const usableContacts = useMemo(
    () => (contacts || []).filter((contact) => !contact.is_test && Boolean(contact.id)),
    [contacts]
  );

  const merged = useMemo(() => usableContacts.map((contact) => ({
    contact,
    record: recordMap.get(contact.id) || emptyRecord(contact.id),
  })), [usableContacts, recordMap]);

  const filtered = merged.filter(({ contact, record }) => {
    const haystack = [contact.ig_username, contact.ig_user_id, record.phone, record.email, record.company, record.owner, ...(contact.tags || [])].join(' ').toLowerCase();
    return (!search.trim() || haystack.includes(search.toLowerCase())) && (stageFilter === 'all' || record.stage === stageFilter);
  });

  const selected = merged.find(({ contact }) => contact.id === selectedId);
  useEffect(() => {
    if (!selected) return;
    setDraft({ ...selected.record });
  }, [selectedId, records.length]);

  const save = async (next?: CrmRecord) => {
    const uid = auth.currentUser?.uid;
    const value = next || draft;
    if (!uid || !value) return;
    setSaving(true);
    try {
      const payload = { ...value, deal_value: Math.max(0, Number(value.deal_value) || 0), updated_at: new Date().toISOString() };
      await saveUserDocument(uid, 'crm_records', payload);
      setRecords((prev) => {
        const exists = prev.some((row) => row.id === payload.id);
        return exists ? prev.map((row) => row.id === payload.id ? payload : row) : [payload, ...prev];
      });
      setDraft(payload);
    } finally {
      setSaving(false);
    }
  };

  const moveStage = async (contactId: string, stage: Stage) => {
    const current = recordMap.get(contactId) || emptyRecord(contactId);
    await save({ ...current, stage });
  };

  const openInbox = (contact: Contact) => {
    sessionStorage.setItem('autoreply:open-inbox-user', contact.ig_username || contact.ig_user_id || '');
    setActiveTab('inbox');
  };

  const totalPipeline = merged.filter(({ record }) => record.stage !== 'lost').reduce((sum, { record }) => sum + Number(record.deal_value || 0), 0);
  const wonValue = merged.filter(({ record }) => record.stage === 'won').reduce((sum, { record }) => sum + Number(record.deal_value || 0), 0);
  const followUps = merged.filter(({ record }) => record.stage === 'follow_up' || Boolean(record.next_follow_up)).length;

  const lastMessageFor = (contact: Contact) => (inboxMessages || []).find((message) => {
    const key = (contact.ig_username || contact.ig_user_id || '').toLowerCase();
    return (message.from_username || message.from_ig_id || '').toLowerCase() === key;
  });

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">Sales workspace</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">CRM Pipeline</h1>
            <p className="mt-1 text-sm text-slate-500">Turn Instagram contacts into trackable leads, follow-ups and won deals.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[520px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Pipeline</p><p className="mt-1 text-lg font-bold text-slate-900">₹{totalPipeline.toLocaleString('en-IN')}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Won</p><p className="mt-1 text-lg font-bold text-emerald-700">₹{wonValue.toLocaleString('en-IN')}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Follow-ups</p><p className="mt-1 text-lg font-bold text-indigo-700">{followUps}</p></div>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <label className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username, phone, email, company, owner or tag" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-indigo-400" /></label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Filter className="h-4 w-4 text-slate-400" /><select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as Stage | 'all')} className="min-h-10 bg-transparent text-sm font-semibold text-slate-700 outline-none"><option value="all">All stages</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></div>
        </section>

        <section className="grid gap-3 xl:grid-cols-5">
          {stages.map((stage) => {
            const cards = filtered.filter(({ record }) => record.stage === stage.id);
            const value = cards.reduce((sum, { record }) => sum + Number(record.deal_value || 0), 0);
            return (
              <div key={stage.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100/60 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div><h2 className="text-xs font-black text-slate-800">{stage.label}</h2><p className="mt-0.5 text-[10px] font-semibold text-slate-400">{cards.length} leads · ₹{value.toLocaleString('en-IN')}</p></div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map(({ contact, record }) => {
                    const last = lastMessageFor(contact);
                    return (
                      <button key={contact.id} onClick={() => setSelectedId(contact.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md">
                        <div className="flex items-start gap-2.5">
                          <UserAvatar src={contact.avatar_url} username={contact.ig_username || contact.ig_user_id} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-900">@{contact.ig_username || contact.ig_user_id}</p>{record.priority === 'high' && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">HIGH</span>}</div>
                            <p className="mt-1 truncate text-[10px] text-slate-500">{record.company || record.phone || last?.message_text || 'No CRM details yet'}</p>
                            <div className="mt-2 flex items-center justify-between"><span className="text-[10px] font-bold text-indigo-600">₹{Number(record.deal_value || 0).toLocaleString('en-IN')}</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {!cards.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center text-[11px] text-slate-400">No leads</div>}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {selected && draft && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={() => setSelectedId('')}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3"><UserAvatar src={selected.contact.avatar_url} username={selected.contact.ig_username || selected.contact.ig_user_id} size="lg" /><div><h2 className="text-xl font-bold text-slate-950">@{selected.contact.ig_username || selected.contact.ig_user_id}</h2><p className="mt-1 text-xs text-slate-500">{selected.contact.tags?.join(' · ') || 'Instagram lead'}</p></div></div>
              <button onClick={() => setSelectedId('')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Close</button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label><span className="text-xs font-bold text-slate-600">Stage</span><select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value as Stage })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
              <label><span className="text-xs font-bold text-slate-600">Priority</span><select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
              <label><span className="text-xs font-bold text-slate-600">Deal value</span><div className="relative mt-1"><BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min={0} value={draft.deal_value} onChange={(e) => setDraft({ ...draft, deal_value: Number(e.target.value) })} className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></div></label>
              <label><span className="text-xs font-bold text-slate-600">Owner / assignee</span><input value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} placeholder="Your name or team member" className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <label><span className="text-xs font-bold text-slate-600">Phone</span><div className="relative mt-1"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></div></label>
              <label><span className="text-xs font-bold text-slate-600">Email</span><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></div></label>
              <label><span className="text-xs font-bold text-slate-600">Company</span><input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <label><span className="text-xs font-bold text-slate-600">Source</span><input value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <label className="sm:col-span-2"><span className="text-xs font-bold text-slate-600">Next follow-up</span><div className="relative mt-1"><CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="datetime-local" value={draft.next_follow_up} onChange={(e) => setDraft({ ...draft, next_follow_up: e.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></div></label>
              <label className="sm:col-span-2"><span className="text-xs font-bold text-slate-600">CRM notes</span><textarea rows={5} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Needs, objections, order details, follow-up context…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button disabled={saving} onClick={() => void save()} className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save CRM record'}</button>
              <button onClick={() => openInbox(selected.contact)} className="flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-700"><MessageCircle className="h-4 w-4" />Open Inbox</button>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-700">Quick stage move</p>
              <div className="mt-3 flex flex-wrap gap-2">{stages.map((stage) => <button key={stage.id} onClick={() => void moveStage(selected.contact.id, stage.id)} className={'rounded-lg px-3 py-2 text-xs font-bold ' + (draft.stage === stage.id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600')}>{stage.label}</button>)}</div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
