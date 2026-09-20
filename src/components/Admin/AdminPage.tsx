import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bot, Check, ChevronRight, CircleDollarSign, Instagram,
  Loader2, MessageSquare, RefreshCw, Save, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Users, Workflow, X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserAvatar } from '../Common/UserAvatar';

type Plan = {
  id: 'free' | 'starter' | 'pro' | 'business';
  name: string;
  price_inr: number;
  total_messages: number;
  ai_replies: number;
  instagram_accounts: number;
  automations_limit: number | null;
  billing_days: number;
  is_active: boolean;
  sort_order: number;
};

type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: string;
  last_login_at?: string | null;
  last_active_at?: string | null;
  instagramAccounts: number;
  instagramUsernames: string[];
  automations: number;
  contacts: number;
  messages: number;
  aiReplies: number;
};

type ControlCenter = {
  success: boolean;
  error?: string;
  admin?: { email: string };
  stats: {
    totalUsers: number;
    active24h: number;
    active7d: number;
    active30d: number;
    connectedInstagram: number;
    totalAutomations: number;
    totalMessages: number;
    totalAiReplies: number;
  };
  users: AdminUser[];
  plans: Plan[];
  auditLogs: Array<{
    id: number;
    admin_email: string;
    action: string;
    entity_id?: string;
    created_at: string;
  }>;
};

const nf = new Intl.NumberFormat('en-IN');

const defaultPlans: Plan[] = [
  { id: 'free', name: 'Free', price_inr: 0, total_messages: 1500, ai_replies: 1000, instagram_accounts: 1, automations_limit: 5, billing_days: 30, is_active: true, sort_order: 0 },
  { id: 'starter', name: 'Starter', price_inr: 299, total_messages: 7500, ai_replies: 5000, instagram_accounts: 1, automations_limit: null, billing_days: 30, is_active: true, sort_order: 1 },
  { id: 'pro', name: 'Pro', price_inr: 599, total_messages: 25000, ai_replies: 15000, instagram_accounts: 2, automations_limit: null, billing_days: 30, is_active: true, sort_order: 2 },
  { id: 'business', name: 'Business', price_inr: 1299, total_messages: 75000, ai_replies: 40000, instagram_accounts: 5, automations_limit: null, billing_days: 30, is_active: true, sort_order: 3 },
];

export const AdminPage: React.FC = () => {
  const { firebaseUser, isAdmin, setActiveTab } = useApp();
  const [section, setSection] = useState<'overview' | 'users' | 'plans' | 'activity'>('overview');
  const [data, setData] = useState<ControlCenter | null>(null);
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const authHeaders = async () => {
    if (!firebaseUser) throw new Error('Please sign in again.');
    const token = await firebaseUser.getIdToken();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/control-center', { headers, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load Admin Panel.');
      setData(json);
      setPlans(Array.isArray(json.plans) && json.plans.length ? json.plans : defaultPlans);
    } catch (e: any) {
      setError(e?.message || 'Could not load Admin Panel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin && firebaseUser) void load(); }, [isAdmin, firebaseUser?.uid]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.users || [];
    return (data?.users || []).filter((u) =>
      [u.email, u.displayName, u.uid, ...(u.instagramUsernames || [])]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [data?.users, search]);

  const savePlan = async () => {
    if (!editingPlan) return;
    if (editingPlan.ai_replies > editingPlan.total_messages) {
      setError('AI replies total automated messages से ज्यादा नहीं हो सकते।');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/plans/${editingPlan.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(editingPlan),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Plan update failed.');
      setPlans((prev) => prev.map((p) => p.id === editingPlan.id ? json.plan : p));
      setEditingPlan(null);
      setNotice(`${json.plan.name} plan updated successfully.`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Plan update failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-12 w-12 text-indigo-600" />
          <h2 className="mt-4 text-2xl font-black text-slate-950">Admin access required</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">यह area केवल authorized owner/admin Google account के लिए है।</p>
          <button onClick={() => setActiveTab('home')} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Back to Home</button>
        </div>
      </div>
    );
  }

  const stats = data?.stats || { totalUsers: 0, active24h: 0, active7d: 0, active30d: 0, connectedInstagram: 0, totalAutomations: 0, totalMessages: 0, totalAiReplies: 0 };
  const statCards = [
    ['Total Users', stats.totalUsers, Users],
    ['Active · 24h', stats.active24h, Activity],
    ['Instagram Accounts', stats.connectedInstagram, Instagram],
    ['Automations', stats.totalAutomations, Workflow],
    ['Automated Messages', stats.totalMessages, MessageSquare],
    ['AI Replies', stats.totalAiReplies, Bot],
  ] as const;

  return (
    <div className="min-h-full bg-[#F7FAFF] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-indigo-600"><ShieldCheck className="h-4 w-4" /> OWNER CONTROL CENTER</div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Admin Panel</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">Users, pricing, limits और platform usage एक ही जगह manage करें।</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh data
          </button>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {([
            ['overview', 'Overview', Activity],
            ['users', 'Users', Users],
            ['plans', 'Plans & Pricing', SlidersHorizontal],
            ['activity', 'Audit Activity', Sparkles],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${section === id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
        {notice && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><Check className="h-4 w-4" />{notice}</div>}

        {loading && !data ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
            <div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" /><p className="mt-3 text-sm font-bold text-slate-600">Loading control center…</p></div>
          </div>
        ) : null}

        {!loading || data ? (
          <>
            {section === 'overview' && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {statCards.map(([label, value, Icon]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{nf.format(Number(value || 0))}</p></div><div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Icon className="h-5 w-5" /></div></div>
                    </div>
                  ))}
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-lg font-black text-slate-950">Active users</h3>
                    <div className="mt-5 space-y-4">
                      {[['Last 24 hours', stats.active24h], ['Last 7 days', stats.active7d], ['Last 30 days', stats.active30d]].map(([label, value]) => (
                        <div key={String(label)} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-bold text-slate-600">{label}</span><span className="text-lg font-black text-slate-950">{nf.format(Number(value))}</span></div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-lg font-black text-slate-950">Current plans</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {plans.map((p) => <button key={p.id} onClick={() => { setEditingPlan({...p}); setSection('plans'); }} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-indigo-300"><p className="font-black text-slate-950">{p.name}</p><p className="mt-1 text-xl font-black text-indigo-600">₹{nf.format(p.price_inr)}<span className="text-xs text-slate-500"> / {p.billing_days}d</span></p></button>)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {section === 'users' && (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="text-xl font-black text-slate-950">Users</h3><p className="text-sm font-semibold text-slate-500">{filteredUsers.length} accounts</p></div>
                  <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Gmail, name, Instagram…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:border-indigo-400" /></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500"><tr><th className="p-4">User</th><th className="p-4">Instagram</th><th className="p-4">Automations</th><th className="p-4">Messages</th><th className="p-4">AI Replies</th><th className="p-4">Last Active</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => <tr key={u.uid} className="hover:bg-slate-50/70"><td className="p-4"><div className="flex items-center gap-3"><UserAvatar src={u.photoURL} name={u.displayName} size="md" /><div><p className="font-black text-slate-900">{u.displayName}</p><p className="text-xs font-semibold text-slate-500">{u.email || u.uid}</p></div></div></td><td className="p-4 text-sm font-bold text-slate-700">{u.instagramUsernames?.length ? u.instagramUsernames.map(x => '@'+x).join(', ') : 'Not connected'} <span className="text-xs text-slate-400">({u.instagramAccounts || 0})</span></td><td className="p-4 font-black text-slate-900">{nf.format(u.automations || 0)}</td><td className="p-4 font-black text-slate-900">{nf.format(u.messages || 0)}</td><td className="p-4 font-black text-slate-900">{nf.format(u.aiReplies || 0)}</td><td className="p-4 text-sm font-bold text-slate-600">{u.last_active_at ? new Date(u.last_active_at).toLocaleString() : '—'}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {section === 'plans' && (
              <div className="grid gap-5 xl:grid-cols-2">
                {plans.map((p) => (
                  <div key={p.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-indigo-600">{p.id}</p><h3 className="mt-1 text-2xl font-black text-slate-950">{p.name}</h3><p className="mt-2 text-3xl font-black text-slate-950">₹{nf.format(p.price_inr)} <span className="text-sm text-slate-500">/ {p.billing_days} days</span></p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.is_active ? 'ACTIVE' : 'OFF'}</span></div>
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold text-slate-500">Messages</p><p className="mt-1 font-black text-slate-900">{nf.format(p.total_messages)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold text-slate-500">AI Replies</p><p className="mt-1 font-black text-slate-900">{nf.format(p.ai_replies)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold text-slate-500">Instagram</p><p className="mt-1 font-black text-slate-900">{p.instagram_accounts}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold text-slate-500">Automations</p><p className="mt-1 font-black text-slate-900">{p.automations_limit === null ? 'Unlimited' : p.automations_limit}</p></div></div>
                    <button onClick={() => setEditingPlan({...p})} className="mt-5 flex w-full items-center justify-between rounded-xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700 hover:bg-indigo-100">Edit price & limits <ChevronRight className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}

            {section === 'activity' && (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-xl font-black text-slate-950">Admin audit activity</h3><p className="mt-1 text-sm font-semibold text-slate-500">Pricing और limit changes का record.</p>
                <div className="mt-5 space-y-3">{(data?.auditLogs || []).length ? data!.auditLogs.map((a) => <div key={a.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4"><div><p className="font-black text-slate-900">{a.action} · {a.entity_id || 'system'}</p><p className="text-xs font-semibold text-slate-500">{a.admin_email}</p></div><p className="shrink-0 text-xs font-bold text-slate-500">{new Date(a.created_at).toLocaleString()}</p></div>) : <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">No admin changes recorded yet.</div>}</div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {editingPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5"><div><p className="text-xs font-black uppercase tracking-wider text-indigo-600">Edit plan</p><h3 className="text-2xl font-black text-slate-950">{editingPlan.name}</h3></div><button onClick={() => setEditingPlan(null)} className="rounded-xl bg-slate-100 p-2 text-slate-600"><X className="h-5 w-5" /></button></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {[
                ['Price (₹)', 'price_inr'], ['Total Automated Messages', 'total_messages'],
                ['Maximum AI Replies', 'ai_replies'], ['Instagram Accounts', 'instagram_accounts'],
                ['Billing Days', 'billing_days']
              ].map(([label, key]) => <label key={key} className="space-y-1.5"><span className="text-xs font-black uppercase tracking-wide text-slate-600">{label}</span><input type="number" min="0" value={(editingPlan as any)[key]} onChange={(e) => setEditingPlan({...editingPlan, [key]: Math.max(0, Number(e.target.value))})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base font-black text-slate-900 outline-none focus:border-indigo-400" /></label>)}
              <label className="space-y-1.5"><span className="text-xs font-black uppercase tracking-wide text-slate-600">Automations</span><select value={editingPlan.automations_limit === null ? 'unlimited' : 'limited'} onChange={(e) => setEditingPlan({...editingPlan, automations_limit: e.target.value === 'unlimited' ? null : 5})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base font-black text-slate-900"><option value="unlimited">Unlimited</option><option value="limited">Limited</option></select></label>
              {editingPlan.automations_limit !== null && <label className="space-y-1.5"><span className="text-xs font-black uppercase tracking-wide text-slate-600">Automation Limit</span><input type="number" min="0" value={editingPlan.automations_limit} onChange={(e) => setEditingPlan({...editingPlan, automations_limit: Math.max(0, Number(e.target.value))})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base font-black" /></label>}
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2"><div><p className="font-black text-slate-900">Plan available</p><p className="text-xs font-semibold text-slate-500">OFF करने पर नई purchase के लिए hide किया जा सकता है।</p></div><input type="checkbox" checked={editingPlan.is_active} onChange={(e) => setEditingPlan({...editingPlan, is_active: e.target.checked})} className="h-5 w-5 accent-indigo-600" /></label>
            </div>
            <div className="flex gap-3 border-t border-slate-200 p-5"><button onClick={() => setEditingPlan(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">Cancel</button><button onClick={() => void savePlan()} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
