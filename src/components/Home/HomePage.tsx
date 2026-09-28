import React, { useMemo, useState } from 'react';
import {
  Zap, ChevronRight, ArrowRight, MessageCircle, Send, Plus, Instagram,
  Users, Activity, CheckCircle2, AlertTriangle, Bot, Webhook, Trash2, Settings, MoreHorizontal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserAvatar } from '../Common/UserAvatar';

type Period = 'today' | '7d' | '30d';

export const HomePage: React.FC = () => {
  const {
    user, instagramAccount, automations, inboxMessages, contacts,
    setActiveTab, setIsConnectModalOpen, setIsBuilderOpen, disconnectChannel,
  } = useApp();
  const [period, setPeriod] = useState<Period>('today');

  const isConnected = Boolean(instagramAccount?.username);
  const accountExpired = instagramAccount?.status === 'expired' || instagramAccount?.status === 'action_required';
  const accountMeta = instagramAccount as (typeof instagramAccount & { following_count?: number; media_count?: number; account_type?: string }) | null;
  const accountType = accountMeta?.account_type;
  const followingCount = accountMeta?.following_count;
  const postsCount = accountMeta?.media_count;
  const activeAutomations = (automations || []).filter(a => a?.status === 'active');
  const totalDmsSent = (automations || []).reduce((n, a) => n + (a?.stats?.dms_sent || 0), 0);
  const commentsReplied = (automations || []).filter(a => a?.trigger_type === 'comment').reduce((n, a) => n + (a?.stats?.runs || 0), 0);
  const newLeads = (contacts || []).length;

  const topAutomations = useMemo(
    () => [...(automations || [])].sort((a,b) => (b?.stats?.runs || 0) - (a?.stats?.runs || 0)).slice(0,3),
    [automations]
  );

  const recentActivity = useMemo(
    () => [...(inboxMessages || [])].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0,4),
    [inboxMessages]
  );

  const relativeTime = (iso?: string) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.max(0, Math.floor(ms / 60000));
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  const kpis = [
    { label:'Active Automations', value:activeAutomations.length, icon:Zap, tone:'text-violet-600 bg-violet-50' },
    { label:'DMs Sent', value:totalDmsSent, icon:Send, tone:'text-blue-600 bg-blue-50' },
    { label:'Comments Replied', value:commentsReplied, icon:MessageCircle, tone:'text-pink-600 bg-pink-50' },
    { label:'New Leads', value:newLeads, icon:Users, tone:'text-orange-600 bg-orange-50' },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_85%_5%,rgba(221,214,254,.45),transparent_28%),linear-gradient(180deg,#fbfdff_0%,#f7f8ff_100%)] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-slate-950 sm:text-[26px]">Good evening, {user.name || 'Creator'} 👋</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Here’s what’s happening with your Instagram automation today.</p>
          </div>
          <div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {([['today','Today'],['7d','7 Days'],['30d','30 Days']] as const).map(([id,label]) => (
              <button key={id} onClick={() => setPeriod(id)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition ${period === id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
        </header>

        <section className={`relative overflow-hidden rounded-[18px] border p-4 shadow-[0_8px_28px_rgba(76,88,160,.08)] sm:p-5 ${isConnected ? "border-indigo-200/70 bg-gradient-to-br from-blue-50/95 via-indigo-50/90 to-violet-100/75" : "border-slate-200/80 bg-white"}`}>
          {isConnected && <><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(129,140,248,0.16),transparent_30%),radial-gradient(circle_at_10%_85%,rgba(56,189,248,0.12),transparent_34%)]" aria-hidden="true" /><div className="pointer-events-none absolute -right-14 -top-16 h-52 w-52 rounded-full bg-violet-300/20 blur-3xl" aria-hidden="true" /><div className="pointer-events-none absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-cyan-200/20 blur-3xl" aria-hidden="true" /></>}
          <div className="relative z-10">
          {isConnected ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar src={instagramAccount?.profile_pic_url} username={instagramAccount?.username} showInstagramBadge size="lg" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="max-w-[220px] truncate whitespace-nowrap text-[14px] font-semibold text-slate-900 sm:max-w-[320px]">@{instagramAccount?.username}</p>
                      <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${accountExpired?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${accountExpired?'bg-amber-500':'bg-emerald-500'}`} />{accountExpired?'Action required':'Connected'}</span>
                    </div>
                    <p className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-500">{accountType ? `${accountType.charAt(0).toUpperCase() + accountType.slice(1).toLowerCase()} Account` : 'Instagram account'}</p>
                    <p className="mt-0.5 whitespace-nowrap text-[10px] font-medium text-slate-400">{accountExpired ? 'Connection needs attention' : instagramAccount?.connected_at ? `Connected ${relativeTime(instagramAccount.connected_at)}` : 'Connected'}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => setActiveTab('settings')} className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Settings className="h-3.5 w-3.5" />Manage Account</button>
                  <button title="Disconnect account" aria-label="Disconnect Instagram account" onClick={() => { if (window.confirm('Disconnect this Instagram account?')) disconnectChannel(); }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"><MoreHorizontal className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 pt-3">
                <Metric label="Followers" value={instagramAccount?.followers_count} />
                <Metric label="Following" value={followingCount} />
                <Metric label="Posts" value={postsCount} />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[96px] flex-col justify-center gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FA7E1E] via-[#D62976] to-[#962FBF] text-white shadow-sm"><Instagram className="h-5 w-5" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-slate-950">Instagram Account</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Not Connected</span></div>
                  <p className="mt-1 text-xs font-semibold text-slate-700">No Instagram account connected</p>
                  <p className="mt-1 max-w-xl text-[11px] leading-4 text-slate-500 sm:text-xs">Connect your Instagram account to enable automatic DM & comment replies and start growing your audience.</p>
                  <div className="mt-2 hidden flex-wrap gap-x-3 gap-y-1 text-[10px] font-medium text-slate-500 sm:flex"><span>✓ Auto reply to DMs</span><span>✓ Reply to comments</span><span>✓ Capture leads</span><span>✓ 24/7 automation</span></div>
                </div>
              </div>
              <button onClick={() => setIsConnectModalOpen(true)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl px-4 text-xs font-bold text-white shadow-md transition hover:-translate-y-px hover:brightness-105 sm:self-auto" style={{backgroundImage:'linear-gradient(100deg,#FA7E1E 0%,#D62976 48%,#962FBF 100%)'}}><Instagram className="h-4 w-4" />Connect Instagram <ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
          )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(({label,value,icon:Icon,tone}) => (
            <div key={label} className="rounded-[18px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_26px_rgba(30,41,59,.05)] transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4.5 w-4.5" /></div>
              <p className="mt-3 text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">{value.toLocaleString()}</p>
              
            </div>
          ))}
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.05fr)_minmax(230px,.75fr)]">
          <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_28px_rgba(30,41,59,.05)] sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div><h2 className="flex items-center gap-2 text-base font-bold text-slate-950"><Zap className="h-4.5 w-4.5 text-violet-600" />Top Performing Automations</h2><p className="mt-1 text-xs font-medium text-slate-500">Performance from your existing automation data.</p></div>
            <button onClick={() => setActiveTab('automations')} className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">View All <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          {topAutomations.length === 0 ? (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Zap className="h-5 w-5" /></div>
              <p className="mt-3 text-sm font-bold text-slate-800">No automations yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">Create your first Instagram automation to start seeing performance here.</p>
              <button onClick={() => setIsBuilderOpen(true)} className="mt-4 min-h-11 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white transition hover:bg-indigo-700"><Plus className="mr-1 inline h-4 w-4" />Create Automation</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topAutomations.map(auto => {
                const runs=auto.stats?.runs || 0, sent=auto.stats?.dms_sent || 0;
                const pct=runs > 0 ? Math.min(100,Math.round((sent/runs)*100)) : 0;
                return <div key={auto.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><p className="truncate text-sm font-bold text-slate-900">{auto.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${auto.status==='active'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{auto.status==='active'?'Active':'Paused'}</span></div>
                    <p className="mt-1 text-xs capitalize text-slate-500">{auto.trigger_type.replaceAll('_',' ')} automation</p>
                    <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{width:`${pct}%`}} /></div>
                  </div>
                  <div className="flex gap-5 text-xs sm:text-right"><div><p className="font-bold text-slate-900">{runs.toLocaleString()}</p><p className="text-slate-400">Triggered</p></div><div><p className="font-bold text-slate-900">{sent.toLocaleString()}</p><p className="text-slate-400">DMs sent</p></div><div><p className="font-bold text-slate-900">{pct}%</p><p className="text-slate-400">Delivery</p></div></div>
                </div>;
              })}
            </div>
          )}
        </section>
          <section className="rounded-[20px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_28px_rgba(30,41,59,.05)] sm:p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4"><h2 className="text-base font-bold text-slate-950">Recent Activity</h2><button onClick={() => setActiveTab('inbox')} className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-indigo-600">View All <ChevronRight className="h-4 w-4" /></button></div>
            {recentActivity.length === 0 ? <div className="py-8 text-center"><Activity className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">No recent activity yet</p><p className="mt-1 text-xs text-slate-500">New Instagram conversations will appear here.</p></div> :
              <div className="divide-y divide-slate-100">{recentActivity.map(msg => <div key={msg.id} className="flex items-center gap-3 py-3.5"><UserAvatar src={msg.from_avatar} username={msg.from_username} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{msg.direction==='out' ? `DM sent to @${msg.from_username}` : `@${msg.from_username} sent a DM`}</p><p className="truncate text-xs text-slate-500">{msg.message_text}</p></div><span className="shrink-0 text-[11px] text-slate-400">{relativeTime(msg.timestamp)}</span></div>)}</div>}
          </section>
          <section className="rounded-[20px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_28px_rgba(30,41,59,.05)] sm:p-5">
            <h2 className="border-b border-slate-100 pb-4 text-base font-bold text-slate-950">System Status</h2>
            <div className="mt-2 divide-y divide-slate-100">
              <StatusRow icon={Instagram} ok={isConnected && !accountExpired} label={accountExpired?'Instagram Connection Expired':'Instagram Connected'} detail={isConnected ? (accountExpired?'Reconnect Instagram':'Account is connected') : 'No account connected'} />
              <StatusRow icon={Zap} ok={activeAutomations.length > 0} label="Automations Running" detail={activeAutomations.length > 0 ? `${activeAutomations.length} active workflow${activeAutomations.length===1?'':'s'}` : 'No active workflows'} />
              <StatusRow icon={Bot} ok={activeAutomations.some(a=>a.trigger_type==='dm_ai_conversation')} label="AI Replies Active" detail={activeAutomations.some(a=>a.trigger_type==='dm_ai_conversation') ? 'AI conversation automation active' : 'No active AI conversation automation'} />
              <StatusRow icon={Webhook} ok={null} label="Webhook Connection" detail={isConnected ? "Live webhook health is not exposed here" : "Waiting for Instagram connection"} />
            </div>
          </section>
        </div>

        <footer className="pb-2 pt-1 text-center text-[11px] font-medium text-slate-400">© 2026 AutoReply.io</footer>
      </div>
    </div>
  );
};

const StatusRow: React.FC<{icon:React.ComponentType<{className?:string}>;ok:boolean|null;label:string;detail:string}> = ({icon:Icon,ok,label,detail}) => (
  <div className="flex items-start gap-3 py-3.5">
    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ok===true?'bg-emerald-50 text-emerald-600':ok===false?'bg-amber-50 text-amber-600':'bg-slate-100 text-slate-500'}`}>{ok===false?<AlertTriangle className="h-4 w-4" />:ok===true?<CheckCircle2 className="h-4 w-4" />:<Icon className="h-4 w-4" />}</div>
    <div><p className="text-xs font-bold text-slate-800">{label}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{detail}</p></div>
  </div>
);

const Metric: React.FC<{label:string;value:number|undefined}> = ({label,value}) => (
  <div className="min-w-0 text-center lg:text-left"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-base font-bold text-slate-900">{typeof value === 'number' ? value.toLocaleString() : '—'}</p></div>
);
