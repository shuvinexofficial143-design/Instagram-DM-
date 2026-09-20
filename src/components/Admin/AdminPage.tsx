import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bot, Check, ChevronRight, Instagram, Loader2, MessageSquare,
  Pencil, RefreshCw, Save, Search, ShieldCheck, Users, X, Zap
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Plan = {
  id:string; name:string; price_inr:number; total_messages:number; ai_replies:number;
  instagram_accounts:number; automations_limit:number|null; billing_days:number; is_active:boolean;
};
type AdminUser = {
  uid:string; email:string; displayName:string; photoURL?:string; role:string;
  last_login_at?:string|null; last_active_at?:string|null; instagramAccounts:number;
  instagramUsernames:string[]; automations:number; contacts:number; messages:number; aiReplies:number;
};
type Payload = {
  success:boolean; error?:string; admin?:{email:string};
  stats?:{totalUsers:number;active24h:number;active7d:number;active30d:number;connectedInstagram:number;totalAutomations:number;totalMessages:number;totalAiReplies:number};
  users?:AdminUser[]; plans?:Plan[]; auditLogs?:any[];
};

const fmt=(n:number)=>Number(n||0).toLocaleString('en-IN');
const when=(value?:string|null)=>{
  if(!value) return 'Never';
  const d=new Date(value); if(Number.isNaN(d.getTime())) return 'Never';
  return d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
};

export const AdminPage:React.FC=()=>{
  const { firebaseUser, isAdmin, setActiveTab }=useApp();
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<Plan|null>(null);
  const [saving,setSaving]=useState(false);
  const [selected,setSelected]=useState<AdminUser|null>(null);

  const token=async()=>firebaseUser ? firebaseUser.getIdToken() : '';

  const load=async()=>{
    if(!firebaseUser){setLoading(false);return;}
    setLoading(true); setError('');
    try{
      const accessToken=await token();
      const res=await fetch('/api/admin/control-center',{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store'});
      const json:Payload=await res.json().catch(()=>({success:false,error:'Invalid server response'}));
      if(!res.ok||!json.success) throw new Error(json.error||'Could not load admin data.');
      setData(json);
    }catch(e:any){setError(e?.message||'Could not load admin data.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{void load();},[firebaseUser?.uid]);

  const users=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const list=data?.users||[];
    if(!q) return list;
    return list.filter(u=>[u.email,u.displayName,u.uid,...(u.instagramUsernames||[])].some(v=>String(v||'').toLowerCase().includes(q)));
  },[data?.users,query]);

  const savePlan=async()=>{
    if(!editing) return;
    if(editing.ai_replies>editing.total_messages){setError('AI replies cannot be greater than total messages.');return;}
    setSaving(true); setError('');
    try{
      const accessToken=await token();
      const res=await fetch(`/api/admin/plans/${editing.id}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
        body:JSON.stringify(editing)
      });
      const json=await res.json().catch(()=>({success:false,error:'Invalid server response'}));
      if(!res.ok||!json.success) throw new Error(json.error||'Could not save plan.');
      setEditing(null); await load();
    }catch(e:any){setError(e?.message||'Could not save plan.');}
    finally{setSaving(false);}
  };

  if(!isAdmin) return <div className="min-h-full bg-[#F7FAFF] p-6"><div className="mx-auto mt-16 max-w-lg rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-10 w-10 text-rose-500"/><h1 className="mt-4 text-2xl font-black text-slate-950">Admin access required</h1><p className="mt-2 text-sm font-semibold text-slate-600">This area is available only to an authorized administrator account.</p><button onClick={()=>setActiveTab('home')} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Back to Home</button></div></div>;

  const s=data?.stats;
  const cards=[
    ['Registered Users',s?.totalUsers||0,Users],
    ['Active · 24h',s?.active24h||0,Activity],
    ['Instagram Accounts',s?.connectedInstagram||0,Instagram],
    ['Automations',s?.totalAutomations||0,Zap],
    ['Automated Messages',s?.totalMessages||0,MessageSquare],
    ['AI Replies',s?.totalAiReplies||0,Bot],
  ] as const;

  return <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-indigo-700"><ShieldCheck className="h-4 w-4"/>Owner Control Center</div><h1 className="text-3xl font-black tracking-tight text-slate-950">Admin Panel</h1><p className="mt-1 text-sm font-semibold text-slate-600">Users, plan pricing, limits and platform activity in one place.</p></div>
        <button onClick={()=>void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh</button>
      </div>

      {error&&<div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
      {loading&&!data?<div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600"/></div>:<>
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{cards.map(([label,value,Icon])=><div key={label} className="rounded-2xl border border-blue-100 bg-[#FCFDFF] p-4 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="h-5 w-5"/></span><p className="mt-4 text-2xl font-black text-slate-950">{fmt(value)}</p><p className="mt-1 text-xs font-bold text-slate-500">{label}</p></div>)}</div>

        <section className="mb-8">
          <div className="mb-4"><h2 className="text-xl font-black text-slate-950">Plans & Pricing</h2><p className="text-sm font-semibold text-slate-500">Changes become the current catalog for new purchases and renewals.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{(data?.plans||[]).map(p=><div key={p.id} className="rounded-3xl border border-blue-100 bg-[#FCFDFF] p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black text-slate-950">{p.name}</p><p className="mt-1 text-3xl font-black text-slate-950">₹{fmt(p.price_inr)}<span className="text-xs font-bold text-slate-500"> / {p.billing_days} days</span></p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${p.is_active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{p.is_active?'Active':'Hidden'}</span></div><div className="mt-5 space-y-2 text-sm font-semibold text-slate-700"><p>{fmt(p.total_messages)} total messages</p><p>{fmt(p.ai_replies)} AI replies</p><p>{p.instagram_accounts} Instagram account{p.instagram_accounts===1?'':'s'}</p><p>{p.automations_limit===null?'Unlimited':fmt(p.automations_limit)} automations</p></div><button onClick={()=>setEditing({...p})} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-black text-indigo-700 hover:bg-indigo-100"><Pencil className="h-4 w-4"/>Edit Plan</button></div>)}</div>
        </section>

        <section className="rounded-3xl border border-blue-100 bg-[#FCFDFF] shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-slate-950">Users</h2><p className="text-sm font-semibold text-slate-500">{users.length} visible accounts · Active 7d: {fmt(s?.active7d||0)} · Active 30d: {fmt(s?.active30d||0)}</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Gmail, name or Instagram" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-400"/></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-[#F7FAFF] text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-4 py-3">Instagram</th><th className="px-4 py-3">Automations</th><th className="px-4 py-3">Messages</th><th className="px-4 py-3">AI Replies</th><th className="px-4 py-3">Last Active</th><th className="px-4 py-3"></th></tr></thead><tbody>{users.map(u=><tr key={u.uid} className="border-t border-slate-100 text-sm"><td className="px-5 py-4"><div className="font-black text-slate-900">{u.displayName||'User'}</div><div className="max-w-[260px] truncate text-xs font-semibold text-slate-500">{u.email||u.uid}</div></td><td className="px-4 py-4 font-bold text-slate-700">{u.instagramUsernames?.length?u.instagramUsernames.map(x=>'@'+x).join(', '):'Not connected'}</td><td className="px-4 py-4 font-black text-slate-800">{fmt(u.automations)}</td><td className="px-4 py-4 font-black text-slate-800">{fmt(u.messages)}</td><td className="px-4 py-4 font-black text-slate-800">{fmt(u.aiReplies)}</td><td className="px-4 py-4 text-xs font-semibold text-slate-500">{when(u.last_active_at)}</td><td className="px-4 py-4"><button onClick={()=>setSelected(u)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="View user"><ChevronRight className="h-5 w-5"/></button></td></tr>)}{!users.length&&<tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">No matching users.</td></tr>}</tbody></table></div>
        </section>

        <section className="mt-8 rounded-3xl border border-blue-100 bg-[#FCFDFF] p-5 shadow-sm"><h2 className="text-lg font-black text-slate-950">Recent Admin Activity</h2><div className="mt-4 space-y-3">{(data?.auditLogs||[]).slice(0,8).map((a:any)=><div key={a.id||a.created_at} className="flex flex-col justify-between gap-1 rounded-xl bg-[#F7FAFF] px-4 py-3 text-sm sm:flex-row"><span className="font-bold text-slate-800">{a.action} · {a.entity_id}</span><span className="text-xs font-semibold text-slate-500">{when(a.created_at)}</span></div>)}{!(data?.auditLogs||[]).length&&<p className="text-sm font-semibold text-slate-500">No admin changes yet.</p>}</div></section>
      </>}

      {editing&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-2xl font-black text-slate-950">Edit {editing.name}</h2><p className="text-sm font-semibold text-slate-500">Set the catalog limits used for new purchases.</p></div><button onClick={()=>setEditing(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{[
        ['Price (₹)','price_inr'],['Total Messages','total_messages'],['AI Replies','ai_replies'],['Instagram Accounts','instagram_accounts'],['Billing Days','billing_days']
      ].map(([label,key])=><label key={key} className="text-xs font-black uppercase tracking-wide text-slate-600">{label}<input type="number" min="0" value={(editing as any)[key]} onChange={e=>setEditing({...editing,[key]:Math.max(0,Number(e.target.value))})} className="mt-2 w-full rounded-xl border border-slate-200 bg-[#F7FAFF] px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-400"/></label>)}<label className="text-xs font-black uppercase tracking-wide text-slate-600">Automations Limit<input type="number" min="0" disabled={editing.automations_limit===null} value={editing.automations_limit??''} onChange={e=>setEditing({...editing,automations_limit:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-slate-200 bg-[#F7FAFF] px-3 py-3 text-sm font-bold disabled:opacity-50"/></label></div><div className="mt-4 flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={editing.automations_limit===null} onChange={e=>setEditing({...editing,automations_limit:e.target.checked?null:5})}/>Unlimited automations</label><label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={editing.is_active} onChange={e=>setEditing({...editing,is_active:e.target.checked})}/>Plan active</label></div><div className="mt-7 flex gap-3"><button onClick={()=>setEditing(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Cancel</button><button onClick={()=>void savePlan()} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save Changes</button></div></div></div>}

      {selected&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-black text-slate-950">{selected.displayName}</h2><p className="text-sm font-semibold text-slate-500">{selected.email}</p></div><button onClick={()=>setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="mt-6 grid grid-cols-2 gap-3">{[['Instagram accounts',selected.instagramAccounts],['Automations',selected.automations],['Contacts',selected.contacts],['Messages',selected.messages],['AI replies',selected.aiReplies],['Role',selected.role]].map(([k,v])=><div key={String(k)} className="rounded-2xl bg-[#F7FAFF] p-4"><p className="text-xs font-bold text-slate-500">{k}</p><p className="mt-1 text-lg font-black text-slate-900">{typeof v==='number'?fmt(v):String(v)}</p></div>)}</div><p className="mt-5 text-xs font-semibold text-slate-500">Last login: {when(selected.last_login_at)}<br/>Last active: {when(selected.last_active_at)}</p></div></div>}
    </div>
  </div>;
};
