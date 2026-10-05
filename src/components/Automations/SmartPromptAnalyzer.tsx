import React, { useState } from 'react';
import { AlertCircle, Bot, Check, CheckCircle2, Copy, Database, Lightbulb, RefreshCw, Sparkles, Target, User, X } from 'lucide-react';
import { PromptAnalysisResult } from '../../types';
import { auth } from '../../lib/supabase';

interface Props {
  currentPrompt: string;
  onApplyStructuredPrompt: (prompt: string) => void;
  onAnalysisComplete?: (result: PromptAnalysisResult) => void;
}

const List = ({ items }: { items: string[] }) => items?.length ? (
  <ul className="mt-2 space-y-2">{items.map((x,i)=><li key={i} className="flex gap-2 text-xs leading-5 text-slate-600"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500"/><span>{x}</span></li>)}</ul>
) : <p className="mt-2 text-xs text-slate-400">Nothing detected.</p>;

export const SmartPromptAnalyzer: React.FC<Props> = ({ currentPrompt, onApplyStructuredPrompt, onAnalysisComplete }) => {
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState<PromptAnalysisResult|null>(null);
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);

  const analyze=async()=>{
    if(!currentPrompt.trim()){setError('पहले AI को क्या करना है, वह लिखें।');return;}
    setLoading(true);setError('');
    try{
      const token=await auth.currentUser?.getIdToken();
      if(!token) throw new Error('Prompt analyze करने के लिए sign in करें.');
      const res=await fetch('/api/openai/analyze-prompt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},credentials:'same-origin',body:JSON.stringify({prompt:currentPrompt})});
      const data=await res.json().catch(()=>null);
      if(!res.ok||!data?.analysis) throw new Error(data?.error||'Prompt analysis failed.');
      setResult(data.analysis);onAnalysisComplete?.(data.analysis);
    }catch(e:any){setError(e?.message||'Prompt analyze नहीं हो पाया.');}
    finally{setLoading(false)}
  };

  const apply=()=>{if(!result)return;onApplyStructuredPrompt(result.enhanced_structured_prompt);setResult(null)};
  const copy=async()=>{if(!result)return;await navigator.clipboard.writeText(result.enhanced_structured_prompt);setCopied(true);setTimeout(()=>setCopied(false),1500)};

  return <>
    <button type="button" onClick={analyze} disabled={loading||!currentPrompt.trim()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-50">
      {loading?<><RefreshCw className="h-4 w-4 animate-spin"/>Analyzing your setup…</>:<><Sparkles className="h-4 w-4"/>Analyze AI Setup</>}
    </button>
    <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">AI checks behavior, business knowledge, missing details and customer data fields.</p>
    {error&&<div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"><AlertCircle className="h-4 w-4"/>{error}</div>}

    {result&&<div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[24px] border border-slate-200 bg-[#F8FAFD] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Bot className="h-5 w-5"/></span><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-indigo-600">AI setup analysis</p><h3 className="text-lg font-black text-slate-950">Here is how your assistant will work</h3><p className="mt-1 text-xs text-slate-500">{result.analysis_summary}</p></div></div>
          <button onClick={()=>setResult(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"><X className="h-4 w-4"/></button>
        </header>

        <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2">
          <Card icon={<User className="h-4 w-4"/>} title="AI role & audience"><p className="text-sm font-black text-slate-900">{result.role_identity.role}</p><p className="mt-1 text-xs leading-5 text-slate-600">{result.role_identity.persona} · {result.role_identity.target_audience}</p></Card>
          <Card icon={<Target className="h-4 w-4"/>} title="What AI will do"><List items={result.primary_objectives}/></Card>
          <Card icon={<Database className="h-4 w-4"/>} title="Business knowledge found"><List items={[...(result.knowledge_context.products_or_services||[]),...(result.knowledge_context.faqs_or_policies||[])]}/></Card>
          <Card icon={<Lightbulb className="h-4 w-4"/>} title="Missing information"><List items={result.missing_information?.length?result.missing_information:result.suggestions}/></Card>
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 md:col-span-2">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-slate-900">Customer details AI should collect</p><p className="mt-1 text-[11px] text-slate-500">These become editable Google Sheet columns automatically.</p></div><span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-indigo-700 ring-1 ring-indigo-100">{result.customer_data_fields?.length||0} fields</span></div>
            <div className="mt-3 flex flex-wrap gap-2">{result.customer_data_fields?.length?result.customer_data_fields.map(x=><span key={x} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{x}</span>):<span className="text-xs text-slate-500">No customer data collection was clearly requested.</span>}</div>
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end">
          <button onClick={copy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700">{copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}{copied?'Copied':'Copy structured prompt'}</button>
          <button onClick={apply} className="h-11 rounded-xl bg-indigo-600 px-5 text-xs font-black text-white">Use this setup</button>
        </footer>
      </div>
    </div>}
  </>;
};

const Card=({icon,title,children}:{icon:React.ReactNode;title:string;children:React.ReactNode})=><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2 text-indigo-600">{icon}<h4 className="text-xs font-black text-slate-900">{title}</h4></div>{children}</section>;
