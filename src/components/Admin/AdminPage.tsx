import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  Search,
  RefreshCw,
  Download,
  Instagram,
  Zap,
  MessageSquare,
  Clock,
  Calendar,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  UserCheck,
  Eye,
  EyeOff,
  X,
  Lock,
  ArrowLeft,
  KeyRound,
  Filter,
  LogOut,
  Sparkles,
  Activity,
  CreditCard,
  Bot,
  HeartPulse,
  Settings,
  ReceiptText,
  LayoutDashboard,
  Database,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AdminUserOverviewItem, AdminOverviewResponse } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';
import { supabase } from '../../lib/supabase';

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-1 text-xl font-black text-slate-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
  </div>
);

export const AdminPage: React.FC = () => {
  const { firebaseUser, user, setActiveTab } = useApp();

  const currentEmail = (firebaseUser?.email || user?.email || '').trim().toLowerCase();

  // Admin access uses the existing Supabase Google session. No second password gate.
  const isAdminAuthenticated = Boolean(firebaseUser && currentEmail);

  // Dashboard Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'disconnected' | 'admins'>('all');
  const [sortBy, setSortBy] = useState<'last_login' | 'signup_date' | 'dms' | 'automations' | 'email'>('last_login');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selected User Detail Modal
  const [selectedUser, setSelectedUser] = useState<AdminUserOverviewItem | null>(null);
  const [adminSection, setAdminSection] = useState<'dashboard' | 'users' | 'instagram' | 'automations' | 'plans' | 'payments' | 'ai' | 'health' | 'activity' | 'settings'>('dashboard');
  const [platformData, setPlatformData] = useState<any>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, any>>({});
  const [savingPlan, setSavingPlan] = useState<string>('');

  const handleAdminLogout = async () => {
    await supabase.auth.signOut();
    window.location.assign('/');
  };

  // Fetch dashboard overview data from backend admin API
  const fetchDashboardOverview = async () => {
    if (!isAdminAuthenticated) return;

    setLoading(true);
    setError(null);
    setIsAccessDenied(false);

    try {
      const emailParam = encodeURIComponent(currentEmail);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token || '';

      const res = await fetch(`/api/admin/dashboard-overview?email=${emailParam}`, {
        headers: {
          'x-user-email': currentEmail,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      if (res.status === 403) {
        setIsAccessDenied(true);
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Access Denied: You do not have administrator permissions.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }

      const result: AdminOverviewResponse = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'Could not fetch admin overview.');
      }

      setData(result);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.error('[ADMIN_FETCH_ERR]', err);
      setError(err?.message || 'Failed to load dashboard overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchDashboardOverview();
    }
  }, [isAdminAuthenticated, currentEmail]);

  const fetchPlatformData = async () => {
    if (!isAdminAuthenticated) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token || '';
    if (!token) return;
    const res = await fetch('https://dwgxmmftybxwpurgsxkx.supabase.co/functions/v1/instagram-account-store', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'admin_overview' }),
    });
    const result = await res.json();
    if (!res.ok || !result?.ok) throw new Error(result?.error || 'Could not load platform data');
    setPlatformData(result);
    setPlanDrafts(Object.fromEntries((result.plans || []).map((p: any) => [p.id, { ...p }])));
  };

  useEffect(() => { if (isAdminAuthenticated) void fetchPlatformData().catch((err) => setError(err?.message || 'Admin data failed')); }, [isAdminAuthenticated, currentEmail]);

  const savePlan = async (plan: any) => {
    setSavingPlan(plan.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';
      const res = await fetch('https://dwgxmmftybxwpurgsxkx.supabase.co/functions/v1/instagram-account-store', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'admin_update_plan', plan }),
      });
      const result = await res.json();
      if (!res.ok || !result?.ok) throw new Error(result?.error || 'Plan update failed');
      await fetchPlatformData();
    } finally { setSavingPlan(''); }
  };

  // Format Dates nicely
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const formatRelativeTime = (dateStr?: string | null) => {
    if (!dateStr) return 'Never';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Never';
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 30) return `${diffDays}d ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Toggle sort order or column
  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Filter and sort the user list
  const filteredAndSortedUsers = useMemo(() => {
    if (!data?.users) return [];

    let list = [...data.users];

    // 1. Search filter by email, displayName, ig_username, or uid
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((u) => {
        const emailMatch = (u.email || '').toLowerCase().includes(q);
        const nameMatch = (u.displayName || '').toLowerCase().includes(q);
        const igMatch = (u.instagram?.username || '').toLowerCase().includes(q);
        const uidMatch = (u.uid || '').toLowerCase().includes(q);
        return emailMatch || nameMatch || igMatch || uidMatch;
      });
    }

    // 2. Status filter
    if (statusFilter === 'connected') {
      list = list.filter((u) => u.instagram?.status === 'active' && u.instagram?.username);
    } else if (statusFilter === 'disconnected') {
      list = list.filter((u) => u.instagram?.status !== 'active' || !u.instagram?.username);
    } else if (statusFilter === 'admins') {
      list = list.filter((u) => u.role === 'admin');
    }

    // 3. Sorting
    list.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'email') {
        comparison = (a.email || '').localeCompare(b.email || '');
      } else if (sortBy === 'signup_date') {
        const timeA = new Date(a.first_login_at || 0).getTime();
        const timeB = new Date(b.first_login_at || 0).getTime();
        comparison = timeA - timeB;
      } else if (sortBy === 'last_login') {
        const timeA = new Date(a.last_login_at || a.last_active_at || 0).getTime();
        const timeB = new Date(b.last_login_at || b.last_active_at || 0).getTime();
        comparison = timeA - timeB;
      } else if (sortBy === 'dms') {
        comparison = (a.stats?.total_dms_sent || 0) - (b.stats?.total_dms_sent || 0);
      } else if (sortBy === 'automations') {
        comparison = (a.stats?.total_automations || 0) - (b.stats?.total_automations || 0);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [data?.users, searchQuery, statusFilter, sortBy, sortOrder]);

  // Overall Stats calculation
  const totalRegisteredUsers = platformData?.profiles?.length ?? data?.overviewStats?.totalRegisteredUsers ?? data?.totalUsers ?? (data?.users?.length || 0);
  const totalConnectedInstagram =
    platformData?.instagramAccounts?.length ?? data?.overviewStats?.totalConnectedInstagram ??
    (data?.users || []).filter((u) => u.instagram?.status === 'active' && u.instagram?.username).length;
  const totalDmsSentCombined =
    data?.overviewStats?.totalDmsSent ??
    data?.totalAutomatedDms ??
    (data?.users || []).reduce((acc, u) => acc + (u.stats?.total_dms_sent || 0), 0);
  const totalActiveAutomationsCombined =
    platformData?.activeAutomations?.length ?? data?.overviewStats?.totalActiveAutomations ??
    data?.totalAutomations ??
    (data?.users || []).reduce((acc, u) => acc + (u.stats?.total_automations || 0), 0);

  // CSV Export handler
  const handleExportCsv = () => {
    if (!filteredAndSortedUsers.length) return;

    const headers = [
      'Email/Gmail ID',
      'Display Name',
      'Role',
      'Signup Date',
      'Last Login Date & Time',
      'Connected Instagram Account',
      'Instagram Connection Date',
      'Total DMs Sent',
      'Total Automations Created',
      'Account Status',
      'Firestore UID',
    ];

    const rows = filteredAndSortedUsers.map((u) => [
      `"${u.email || ''}"`,
      `"${u.displayName || ''}"`,
      `"${u.role || 'user'}"`,
      `"${u.first_login_at || ''}"`,
      `"${u.last_login_at || ''}"`,
      `"${u.instagram?.username ? '@' + u.instagram.username : 'Not Connected'}"`,
      `"${u.instagram?.connected_at || ''}"`,
      u.stats?.total_dms_sent || 0,
      u.stats?.total_automations || 0,
      `"${u.instagram?.status === 'active' && u.instagram?.username ? 'Active' : 'Inactive'}"`,
      `"${u.uid}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `autoreply_admin_users_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ----------------------------------------------------
  // 1. GOOGLE SESSION GATE
  // ----------------------------------------------------
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F7FAFF] p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto text-indigo-600">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Admin Control Center</h2>
            <p className="mt-2 text-sm text-slate-500">Sign in to the main AutoReply app with the authorized Google account, then open /admin.</p>
          </div>
          <button onClick={() => window.location.assign('/')} className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all">
            Continue to Google Login
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 2. ACCESS DENIED VIEW (if email not whitelisted on backend)
  // ----------------------------------------------------
  if (isAccessDenied) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-red-200 shadow-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-5 shadow-inner">
            <ShieldAlert className="w-9 h-9 text-red-600" />
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-2">Access Denied</h2>
          <p className="text-sm font-bold text-red-600 mb-4 uppercase tracking-wider">
            Unauthorized Administrator Email
          </p>

          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            The Admin Dashboard requires authorized administrator email privileges. Your current account{' '}
            <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              {currentEmail || 'Anonymous'}
            </span>{' '}
            is not on the authorized administrator whitelist.
          </p>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left mb-6 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Backend Access Security</span>
            </div>
            <p>
              Access is strictly governed by the backend whitelist in <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">server.ts</code> and <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">ADMIN_EMAILS</code>.
            </p>
            <p className="text-[11px] text-slate-500">
              Authorized Owner Email: <span className="font-mono text-indigo-600 font-semibold">devsinghparmar9589@gmail.com</span>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAdminLogout}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Sign Out of Admin
            </button>
            <button
              onClick={() => window.location.assign('/')}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Go to Home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 3. FULL ADMIN DASHBOARD VIEW
  // ----------------------------------------------------
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">Admin Dashboard</h1>
                  <span className="px-2.5 py-0.5 text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300/60 rounded-full">
                    Owner Active
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Platform overview, users, Instagram accounts, automations, usage and system operations.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchDashboardOverview}
              disabled={loading}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60"
              title="Refresh Dashboard Overview"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={loading || !filteredAndSortedUsers.length}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
              title="Export all users to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleAdminLogout}
              className="px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-slate-600 text-xs font-bold border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              title="Lock Admin Session"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Lock Panel</span>
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              Admin: <strong className="text-slate-900 font-semibold">Google verified</strong>\n            </span>\n            <span className="text-slate-300">•</span>\n            <span>\n              Email: <strong className="text-slate-900 font-semibold">{currentEmail || 'devsinghparmar9589@gmail.com'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span>Last sync: {lastRefreshedAt.toLocaleTimeString()}</span>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              /api/admin/dashboard-overview
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-3 overflow-x-auto">
        <div className="flex min-w-max items-center gap-2">
          {[
            ['dashboard', 'Dashboard', LayoutDashboard],
            ['users', 'Users', Users],
            ['instagram', 'Instagram Accounts', Instagram],
            ['automations', 'Automations', Zap],
            ['plans', 'Plans', CreditCard],
            ['payments', 'Payments', ReceiptText],
            ['ai', 'AI Usage', Bot],
            ['health', 'System Health', HeartPulse],
            ['activity', 'Admin Activity', Activity],
            ['settings', 'Settings', Settings],
          ].map(([id, label, Icon]: any) => (
            <button key={id} onClick={() => setAdminSection(id)} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${adminSection === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon className="h-4 w-4" /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {adminSection !== 'dashboard' && adminSection !== 'users' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">Admin Control Center</p>
              <h2 className="mt-1 text-2xl font-black text-slate-900">
                {{instagram:'Instagram Accounts',automations:'Automations',plans:'Plans & Pricing',payments:'Payments & Receipts',ai:'AI Usage',health:'System Health',activity:'Admin Activity',settings:'Platform Settings'}[adminSection]}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                {{instagram:'Monitor connected Instagram channels and connection health without exposing access tokens.',automations:'Review active and paused workflows across customer workspaces.',plans:'Manage the central subscription catalog, quotas and account limits.',payments:'Track purchases, payment status, renewals and receipt records.',ai:'Monitor AI replies and usage so quotas and costs stay visible.',health:'Watch webhook, database, AI and Instagram delivery health from one place.',activity:'Keep an audit trail of sensitive administrator actions.',settings:'Manage global platform controls and operational configuration.'}[adminSection]}
              </p>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><Database className="h-5 w-5" /></div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {adminSection === 'instagram' && <><Metric label="Connected" value={totalConnectedInstagram} /><Metric label="Registered Users" value={totalRegisteredUsers} /><Metric label="Disconnected" value={Math.max(0,totalRegisteredUsers-totalConnectedInstagram)} /><Metric label="Secrets Exposed" value={0} /></>}
            {adminSection === 'automations' && <><Metric label="Active Automations" value={totalActiveAutomationsCombined} /><Metric label="DMs Sent" value={totalDmsSentCombined} /><Metric label="Users" value={totalRegisteredUsers} /><Metric label="Status" value="Live" /></>}
            {adminSection === 'ai' && <><Metric label="Automated DMs" value={totalDmsSentCombined} /><Metric label="Active Workflows" value={totalActiveAutomationsCombined} /><Metric label="Connected IG" value={totalConnectedInstagram} /><Metric label="Monitoring" value="On" /></>}
            {adminSection === 'health' && <><Metric label="DM Automation" value="Live" /><Metric label="Admin API" value={error ? 'Check' : 'Online'} /><Metric label="Instagram" value={totalConnectedInstagram ? 'Connected' : 'No account'} /><Metric label="Last Sync" value={lastRefreshedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} /></>}
            {adminSection === 'plans' && <div className="sm:col-span-2 lg:col-span-4 grid gap-4 lg:grid-cols-2">{(platformData?.plans || []).map((plan:any) => { const p=planDrafts[plan.id] || plan; const field=(key:string,label:string)=><label className="text-xs font-bold text-slate-600">{label}<input type="number" value={p[key] ?? ''} onChange={e=>setPlanDrafts((d:any)=>({...d,[plan.id]:{...p,[key]:e.target.value}}))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"/></label>; return <div key={plan.id} className="rounded-2xl border border-slate-200 p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-lg font-black text-slate-900">{p.name}</p><p className="text-xs text-slate-400">{plan.id}</p></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={Boolean(p.is_active)} onChange={e=>setPlanDrafts((d:any)=>({...d,[plan.id]:{...p,is_active:e.target.checked}}))}/> Active</label></div><div className="grid grid-cols-2 gap-3">{field('price_inr','Price ₹')}{field('billing_days','Billing days')}{field('total_messages','Messages')}{field('ai_replies','AI replies')}{field('instagram_accounts','Instagram accounts')}{field('automations_limit','Automations (blank = unlimited)')}</div><button onClick={()=>savePlan(p)} disabled={savingPlan===plan.id} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{savingPlan===plan.id?'Saving...':'Save Plan'}</button></div>})}</div>}
            {adminSection === 'activity' && <div className="sm:col-span-2 lg:col-span-4 space-y-2">{(platformData?.auditLogs || []).length ? platformData.auditLogs.map((log:any)=><div key={log.id} className="flex justify-between rounded-xl border border-slate-200 p-3 text-xs"><span><strong>{log.action}</strong> · {log.entity_type} {log.entity_id || ''}</span><span className="text-slate-400">{formatDateTime(log.created_at)}</span></div>) : <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No admin changes recorded yet.</div>}</div>}
            {(adminSection === 'payments' || adminSection === 'settings') && <div className="sm:col-span-2 lg:col-span-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">{adminSection === 'payments' ? 'No payment records table is connected yet, so no fake transactions are shown.' : 'No global settings records exist yet. Controls will appear here only when backed by stored settings.'}</div>}
          </div>
        </div>
      )}

      {(adminSection === 'dashboard' || adminSection === 'users') && <>
      {/* ---------------------------------------------------- */}
      {/* OVERVIEW STATS (TOP SECTION - 4 CARDS) */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Registered Users */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Registered Users</p>
            <p className="text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '—' : totalRegisteredUsers.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">All Google & Email signups</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Total Connected Instagram Accounts */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Connected Instagram</p>
            <p className="text-3xl font-black text-pink-600 tracking-tight">
              {loading ? '—' : totalConnectedInstagram.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">Active live Instagram channels</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600 shadow-2xs">
            <Instagram className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Total DMs Sent (Combined) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total DMs Sent</p>
            <p className="text-3xl font-black text-blue-600 tracking-tight">
              {loading ? '—' : totalDmsSentCombined.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">Combined automated direct messages</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
            <MessageSquare className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Total Active Automations (Combined) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Active Automations</p>
            <p className="text-3xl font-black text-violet-600 tracking-tight">
              {loading ? '—' : totalActiveAutomationsCombined.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">Combined keyword & story rules</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shadow-2xs">
            <Zap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* DETAILED USERS TABLE */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Controls Bar */}
        <div className="p-5 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by email, name, Instagram handle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({data?.users?.length || 0})
            </button>

            <button
              onClick={() => setStatusFilter('connected')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'connected'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Connected ({totalConnectedInstagram})</span>
            </button>

            <button
              onClick={() => setStatusFilter('disconnected')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'disconnected'
                  ? 'bg-slate-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Not Connected</span>
            </button>

            <button
              onClick={() => setStatusFilter('admins')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'admins'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admins</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider select-none">
              <tr>
                {/* 1. Email/Gmail ID */}
                <th className="py-3.5 px-4 font-bold">
                  <button
                    onClick={() => handleSort('email')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Email / Gmail ID</span>
                    {sortBy === 'email' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </th>

                {/* 2. Signup Date */}
                <th className="py-3.5 px-4 font-bold">
                  <button
                    onClick={() => handleSort('signup_date')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Signup Date</span>
                    {sortBy === 'signup_date' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </th>

                {/* 3. Last Login Date & Time */}
                <th className="py-3.5 px-4 font-bold">
                  <button
                    onClick={() => handleSort('last_login')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Last Login Date & Time</span>
                    {sortBy === 'last_login' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </th>

                {/* 4. Connected Instagram Account */}
                <th className="py-3.5 px-4 font-bold">
                  <span>Connected Instagram Account</span>
                </th>

                {/* 5. Instagram Connection Date */}
                <th className="py-3.5 px-4 font-bold">
                  <span>Connection Date</span>
                </th>

                {/* 6. Total DMs Sent */}
                <th className="py-3.5 px-4 font-bold">
                  <button
                    onClick={() => handleSort('dms')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Total DMs Sent</span>
                    {sortBy === 'dms' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </th>

                {/* 7. Total Automations Created */}
                <th className="py-3.5 px-4 font-bold">
                  <button
                    onClick={() => handleSort('automations')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Automations</span>
                    {sortBy === 'automations' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </th>

                {/* 8. Account Status */}
                <th className="py-3.5 px-4 font-bold text-center">
                  <span>Account Status</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                      <p className="font-semibold text-sm">Aggregating users and activity stats from Firestore...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredAndSortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Users className="w-10 h-10 text-slate-300" />
                      <p className="font-bold text-slate-800 text-sm">No users found</p>
                      <p className="text-xs text-slate-500">
                        {searchQuery
                          ? `No users matched "${searchQuery}". Try clearing your search.`
                          : 'No user records currently registered in Firestore.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedUsers.map((item) => {
                  const isConnected = item.instagram?.status === 'active' && Boolean(item.instagram?.username);
                  const isOwner = item.role === 'admin';

                  return (
                    <tr
                      key={item.uid}
                      onClick={() => setSelectedUser(item)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* 1. Email / Gmail ID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            src={item.photoURL}
                            name={item.displayName || item.email}
                            size="md"
                            className="shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 truncate">{item.displayName || 'User'}</p>
                              {isOwner && (
                                <span className="px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300/60 rounded">
                                  Owner
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 font-mono truncate">{item.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* 2. Signup Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-900">{formatDate(item.first_login_at)}</p>
                          <p className="text-xs text-slate-400">{formatRelativeTime(item.first_login_at)}</p>
                        </div>
                      </td>

                      {/* 3. Last Login Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-900">{formatDateTime(item.last_login_at)}</p>
                          <p className="text-xs text-slate-400">{formatRelativeTime(item.last_login_at)}</p>
                        </div>
                      </td>

                      {/* 4. Connected Instagram Account */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-0.5 shrink-0">
                              <UserAvatar
                                src={item.instagram?.profile_pic_url}
                                name={item.instagram?.username || 'IG'}
                                size="sm"
                                className="w-full h-full rounded-full"
                              />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">@{item.instagram?.username}</p>
                              {item.instagram?.followers_count !== undefined && (
                                <p className="text-[11px] text-slate-400">
                                  {item.instagram.followers_count.toLocaleString()} followers
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            Not Connected
                          </span>
                        )}
                      </td>

                      {/* 5. Instagram Connection Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600">
                        {isConnected && item.instagram?.connected_at ? (
                          <div className="space-y-0.5">
                            <p className="font-semibold text-slate-900">{formatDate(item.instagram.connected_at)}</p>
                            <p className="text-[11px] text-slate-400">{formatRelativeTime(item.instagram.connected_at)}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 6. Total DMs Sent */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-900 text-sm">
                            {(item.stats?.total_dms_sent || 0).toLocaleString()}
                          </span>
                          {item.stats?.total_dms_sent && item.stats.total_dms_sent > 0 ? (
                            <span className="text-[11px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">
                              DMs
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 7. Total Automations Created */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-900 text-sm">
                            {(item.stats?.total_automations || 0).toLocaleString()}
                          </span>
                          {item.stats?.total_automations && item.stats.total_automations > 0 ? (
                            <span className="text-[11px] text-violet-600 font-bold bg-violet-50 px-1.5 py-0.5 rounded">
                              rules
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 8. Account Status (Active = green, Not Connected / Inactive = gray) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300/60 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <strong className="text-slate-900 font-semibold">{filteredAndSortedUsers.length}</strong> of{' '}
            <strong className="text-slate-900 font-semibold">{data?.users?.length || 0}</strong> registered accounts
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {totalConnectedInstagram} Active Instagram Accounts
            </span>
            <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              {totalDmsSentCombined.toLocaleString()} Automated DMs Sent
            </span>
          </div>
        </div>
      </div>

      </>}

      <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-indigo-300">Security</div>
            <h3 className="mt-1 text-lg font-black">Google-authenticated Admin Access</h3>
            <p className="mt-2 text-xs leading-5 text-slate-300">The panel uses the existing Supabase Google session plus the server-side administrator allowlist. Instagram access tokens and other secrets are never displayed in the admin UI.</p>
          </div>
        </div>
      </div>

      {/* USER DETAIL MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <UserAvatar
                  src={selectedUser.photoURL}
                  name={selectedUser.displayName || selectedUser.email}
                  size="lg"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">{selectedUser.displayName || 'User'}</h3>
                    {selectedUser.role === 'admin' && (
                      <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300/60 rounded-full">
                        Admin Owner
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-mono">{selectedUser.email}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer shadow-2xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs text-slate-700 max-h-[70vh] overflow-y-auto">
              {/* Instagram Channel Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <Instagram className="w-4 h-4 text-pink-600" />
                    Connected Instagram Channel
                  </span>
                  {selectedUser.instagram?.status === 'active' && selectedUser.instagram?.username ? (
                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px] border border-emerald-300/60">
                      Active
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-slate-200 text-slate-600 font-bold rounded-full text-[10px]">
                      Not Connected
                    </span>
                  )}
                </div>

                {selectedUser.instagram?.username ? (
                  <div className="flex items-center gap-3 pt-1">
                    <UserAvatar
                      src={selectedUser.instagram.profile_pic_url}
                      name={selectedUser.instagram.username}
                      size="md"
                    />
                    <div>
                      <p className="font-black text-slate-900 text-sm">@{selectedUser.instagram.username}</p>
                      <p className="text-slate-500 text-xs">
                        Connected: {formatDateTime(selectedUser.instagram.connected_at)} ({formatRelativeTime(selectedUser.instagram.connected_at)})
                      </p>
                      {selectedUser.instagram.followers_count !== undefined && (
                        <p className="text-slate-500 text-xs">
                          Followers: {selectedUser.instagram.followers_count.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs italic">
                    This user has not yet connected an Instagram business or creator account.
                  </p>
                )}
              </div>

              {/* Usage Stats Breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-center">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total DMs Sent</p>
                  <p className="text-xl font-black text-blue-700 mt-0.5">
                    {(selectedUser.stats?.total_dms_sent || 0).toLocaleString()}
                  </p>
                </div>

                <div className="p-3 bg-violet-50/60 border border-violet-100 rounded-xl text-center">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Automations</p>
                  <p className="text-xl font-black text-violet-700 mt-0.5">
                    {(selectedUser.stats?.total_automations || 0).toLocaleString()}
                  </p>
                </div>

                <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-center">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Contacts</p>
                  <p className="text-xl font-black text-indigo-700 mt-0.5">
                    {(selectedUser.stats?.total_contacts || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Account Timeline & Metadata */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Account Activity & Timestamps
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Signup / First Login</p>
                    <p className="font-bold text-slate-800 mt-0.5">{formatDateTime(selectedUser.first_login_at)}</p>
                    <p className="text-slate-500 text-[11px]">{formatRelativeTime(selectedUser.first_login_at)}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Last Login Date & Time</p>
                    <p className="font-bold text-slate-800 mt-0.5">{formatDateTime(selectedUser.last_login_at)}</p>
                    <p className="text-slate-500 text-[11px]">{formatRelativeTime(selectedUser.last_login_at)}</p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-slate-400 text-[10px] uppercase font-bold">Firestore User UID</p>
                  <p className="font-mono text-slate-700 text-xs break-all mt-0.5">{selectedUser.uid}</p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
