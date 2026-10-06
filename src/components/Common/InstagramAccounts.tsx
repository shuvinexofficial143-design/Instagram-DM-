import React from 'react';
import { Check, Plus, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserAvatar } from './UserAvatar';

export const InstagramAccounts = () => {
  const { instagramAccounts, workspaceId, accountSwitching, accountError, switchInstagramAccount, startInstagramConnection, refreshInstagramAccounts } = useApp();
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Instagram accounts</h2><p className="mt-1 text-xs text-slate-500">Each account has its own inbox, leads and automations.</p></div>
      <button type="button" onClick={()=>startInstagramConnection('add')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white"><Plus size={16}/>Add Instagram account</button>
    </div>
    {accountError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{accountError}</p>}
    <div className="mt-4 space-y-2">{(instagramAccounts || []).map(item => {
      const selected = item.workspaceId === workspaceId;
      return <div key={item.workspaceId} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${selected ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
        <div className="flex min-w-0 items-center gap-3"><UserAvatar src={item.account.profile_pic_url} username={item.account.username}/><div><p className="text-sm font-bold text-slate-900">@{item.account.username}</p><p className="text-xs text-slate-500">{item.account.status === 'connected' ? 'Connected' : 'Disconnected'}{selected ? ' · Current account' : ''}</p></div></div>
        <div className="flex gap-2"><button type="button" disabled={selected || accountSwitching} onClick={()=>void switchInstagramAccount(item.workspaceId)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-indigo-200 px-3 text-xs font-bold text-indigo-700 disabled:opacity-60">{selected ? <><Check size={14}/>Selected</> : accountSwitching ? 'Switching…' : 'Switch account'}</button>
        {selected && <button type="button" onClick={()=>startInstagramConnection('reconnect')} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">Reconnect</button>}</div>
      </div>;
    })}</div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Switching the view keeps other accounts' enabled automations running.</p><button type="button" onClick={()=>void refreshInstagramAccounts()} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-indigo-600"><RefreshCw size={14}/>Refresh accounts</button></div>
  </section>;
};
