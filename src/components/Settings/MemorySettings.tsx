import React,{useEffect,useRef,useState} from 'react';
import {useApp} from '../../context/AppContext';
import {supabase} from '../../lib/supabase';
const defaults={enabled:true,recent_limit:12,summary_threshold:10,input_token_budget:32768};
export function MemorySettings(){
 const {workspaceId,instagramAccount,firebaseUser}=useApp();
 const [draft,setDraft]=useState(defaults),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[retry,setRetry]=useState(0),[loaded,setLoaded]=useState(false);
 const version=useRef(0);
 useEffect(()=>{const current=++version.current;setLoading(true);setLoaded(false);setSaving(false);setSaved(false);setError('');setDraft(defaults);
  if(!workspaceId||!firebaseUser?.uid){setLoading(false);return;}
  void Promise.resolve(supabase.from('autoreply_memory_settings').select('enabled,recent_limit,summary_threshold,input_token_budget').eq('workspace_id',workspaceId).maybeSingle()).then(({data,error})=>{
   if(version.current!==current)return;if(error)setError('Memory settings could not be loaded.');else {if(data)setDraft({...defaults,...data});setLoaded(true);}setLoading(false);
  }).catch(()=>{if(version.current===current){setError('Memory settings could not be loaded.');setLoading(false);}});return ()=>{version.current++;};
 },[workspaceId,firebaseUser?.uid,retry]);
 const save=async()=>{const current=version.current;setSaving(true);setError('');setSaved(false);
  try{const {error}=await supabase.from('autoreply_memory_settings').upsert({workspace_id:workspaceId,...draft,updated_at:new Date().toISOString()},{onConflict:'workspace_id'});if(error)throw error;if(version.current===current)setSaved(true);}
  catch{if(version.current===current)setError('Memory settings could not be saved. Your draft is still here.');}finally{if(version.current===current)setSaving(false);}
 };
 const disabled=!loaded||loading||saving||!instagramAccount||!firebaseUser?.uid;
 return <section aria-labelledby="memory-settings-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
  <h2 id="memory-settings-title" className="text-lg font-bold text-slate-950">AI conversation memory</h2>
  <p className="mt-1 text-sm text-slate-500">Remember customer requirements and past discussions for this Instagram account. Original chat history stays available in Inbox.</p>
  {!instagramAccount&&<p className="mt-3 text-sm text-slate-600">Connect Instagram to configure its conversation memory.</p>}
  {loading&&<p role="status" className="mt-3 text-sm text-slate-500">Loading memory settings…</p>}
  {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error} <button onClick={()=>setRetry(value=>value+1)} className="underline">Reload settings</button></p>}
  <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={draft.enabled} disabled={disabled} onChange={e=>{setDraft(value=>({...value,enabled:e.target.checked}));setSaved(false);}}/> Remember customer conversations</label>
  <div className="mt-4 grid gap-4 sm:grid-cols-3">
   <label className="text-sm text-slate-600">Recent messages<select disabled={disabled} value={draft.recent_limit} onChange={e=>{setDraft(value=>({...value,recent_limit:Number(e.target.value)}));setSaved(false);}} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3">{[6,8,10,12,16,20].map(n=><option key={n} value={n}>{n} messages</option>)}</select></label>
   <label className="text-sm text-slate-600">Update summary after<select disabled={disabled} value={draft.summary_threshold} onChange={e=>{setDraft(value=>({...value,summary_threshold:Number(e.target.value)}));setSaved(false);}} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3">{[8,9,10,11,12].map(n=><option key={n} value={n}>{n} new messages</option>)}</select></label>
   <label className="text-sm text-slate-600">AI context budget<select disabled={disabled} value={draft.input_token_budget} onChange={e=>{setDraft(value=>({...value,input_token_budget:Number(e.target.value)}));setSaved(false);}} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3"><option value={8192}>Small</option><option value={16384}>Standard</option><option value={32768}>Balanced (default)</option><option value={65536}>Extended</option></select></label>
  </div>
  <p className="mt-3 text-xs leading-5 text-slate-500">Summaries update in the background, including after a quiet conversation. Smaller context budgets can leave less room for recent messages. Images may use additional AI tokens.</p>
  <div className="mt-4 flex items-center gap-3"><button disabled={disabled||Boolean(error)&&loading} onClick={()=>void save()} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Save memory preferences'}</button>{saved&&<p role="status" className="text-sm text-emerald-700">Memory preferences saved</p>}</div>
 </section>;
}
