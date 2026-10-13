import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, HelpCircle, LifeBuoy, MessageSquareText, RefreshCw, Send, ShieldCheck, Ticket, Wallet, XCircle } from 'lucide-react';
import { auth } from '../../lib/supabase';

type TicketType='general'|'technical'|'payment'|'refund'|'cancellation'|'account_deletion';
type TicketStatus='open'|'in_review'|'waiting_customer'|'resolved'|'closed'|'approved'|'rejected'|'refund_initiated'|'refunded';
type SupportTicket={id:string;ticket_number:number;owner_user_id:string;ticket_type:TicketType;subject:string;reason:string;order_id:string|null;status:TicketStatus;admin_note:string|null;created_at:string;updated_at:string;last_message_at:string};
type SupportMessage={id:string;ticket_id:string;sender_role:'customer'|'support';body:string;created_at:string};
type Evidence={id:string;ticket_id:string;filename:string;mime_type:string;byte_size:number;created_at:string};
async function openEvidence(id:string,admin:boolean){const p=await request('attachment-link','GET',undefined,'attachmentId='+encodeURIComponent(id)+(admin?'&asAdmin=1':''));const a=document.createElement('a');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';document.body.appendChild(a);a.click();a.remove();}
async function uploadEvidence(ticketId:string,file:File,admin:boolean){if(file.size>2097152)throw new Error('Screenshot must be under 2 MB.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Select PNG, JPEG, or WebP.');const bytes=await file.arrayBuffer();const b=new Uint8Array(bytes);let str='';for(let i=0;i<b.length;i+=8192)str+=String.fromCharCode(...b.subarray(i,i+8192));return request('attachment-upload','POST',{ticketId,filename:file.name,mimeType:file.type,base64:btoa(str),asAdmin:admin});}
function EvidencePanel({attachments,asAdmin,onUploaded,ticketId}:{attachments:Evidence[];asAdmin:boolean;onUploaded:()=>Promise<void>;ticketId:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function choose(e:React.ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{await uploadEvidence(ticketId,file,asAdmin);await onUploaded()}catch(err:any){setError(err?.message||'Upload failed')}finally{setBusy(false)}}
 return <div className="my-4 rounded-xl border border-orange-100 bg-orange-50/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-slate-900">Screenshots & evidence</h4><label className="cursor-pointer rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-orange-800">{busy?'Uploading…':'+ Add screenshot'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||attachments.length>=5} onChange={choose} className="sr-only"/></label></div><p className="mt-1 text-xs text-slate-500">PNG, JPG or WebP. Maximum 2 MB per file, up to 5 images. Files are private to you and support staff.</p>{error&&<p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}<div className="mt-3 flex flex-wrap gap-2">{attachments.map(x=><button key={x.id} type="button" onClick={()=>void openEvidence(x.id,asAdmin).catch(e=>setError(e.message))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">📎 {x.filename}</button>)}</div></div>;
}
type SupportOrder={order_id:string;plan_id:string;amount_inr:number;status:string;environment:string;created_at:string;access_expires_at:string|null};
const labels:Record<TicketType,string>={general:'General question',technical:'Automation / technical issue',payment:'Payment problem',refund:'Refund request',cancellation:'Request cancellation / stop paid plan',account_deletion:'Account or data deletion'};
const statusLabel:Record<TicketStatus,string>={open:'Received',in_review:'In review',waiting_customer:'Awaiting your reply',resolved:'Resolved',closed:'Closed',approved:'Approved',rejected:'Declined',refund_initiated:'Refund initiated',refunded:'Refunded'};
const fmt=(v:string)=>new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
const reference=(t:SupportTicket)=>'AR-'+String(t.ticket_number).padStart(6,'0');
const paymentTypes:TicketType[]=['payment','refund','cancellation'];
async function request(action:string,method='GET',body?:unknown,query=''){
  const token=await auth.currentUser?.getIdToken();
  if(!token)throw new Error('Sign in to send a support request.');
  const response=await fetch('/api/workspace-data?action=support-'+encodeURIComponent(action)+(query?'&'+query:''),{
    method,cache:'no-store',credentials:'same-origin',
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(25000)
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.ok)throw new Error(result?.error||'Support request could not be completed.');
  return result;
}
const Box=({children,className=''}:{children:React.ReactNode;className?:string})=><section className={'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 '+className}>{children}</section>;
function Messages({messages}:{messages:SupportMessage[]}){
  return <div className="max-h-[380px] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3 sm:p-4" aria-label="Support conversation">
    {!messages.length&&<p className="text-sm text-slate-500">No messages yet.</p>}
    {messages.map(m=><div key={m.id} className={'flex '+(m.sender_role==='customer'?'justify-end':'justify-start')}>
      <div className={'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[82%] '+(m.sender_role==='customer'?'bg-indigo-600 text-white':'border border-slate-200 bg-white text-slate-800')}>
        <p className="mb-1 text-xs font-semibold opacity-80">{m.sender_role==='support'?'Auto Replies Support':'Customer'}</p>
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        <small className="mt-2 block text-[11px] opacity-70">{fmt(m.created_at)}</small>
      </div>
    </div>)}
  </div>;
}
export function SupportDesk({initialType}:{initialType?:TicketType}){
  const initial=(initialType||new URLSearchParams(window.location.search).get('type')||'general') as TicketType;
  const [kind,setKind]=useState<TicketType>(Object.hasOwn(labels,initial)?initial:'general');
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [orders,setOrders]=useState<SupportOrder[]>([]);
  const [selected,setSelected]=useState<SupportTicket|null>(null);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [attachments,setAttachments]=useState<Evidence[]>([]);
  const [subject,setSubject]=useState('');
  const [detail,setDetail]=useState('');
  const [reason,setReason]=useState('');
  const [orderId,setOrderId]=useState('');
  const [reply,setReply]=useState('');
  const [sending,setSending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [mode,setMode]=useState<'new'|'list'>(initial!=='general'?'new':'list');
  const paidOrders=orders.filter(o=>o.status==='paid'&&o.environment==='production');
  const eligibleOrders=kind==='payment'?orders:paidOrders;
  const refresh=useCallback(async()=>{
    try{
      const [a,b]=await Promise.all([request('list'),request('orders')]);
      setTickets(a.tickets||[]);setOrders(b.orders||[]);setError('');
    }catch(e:any){setError(e.message)}finally{setLoading(false)}
  },[]);
  useEffect(()=>{void refresh()},[refresh]);
  const open=useCallback(async(id:string)=>{try{setError('');const p=await request('thread','GET',undefined,'id='+encodeURIComponent(id));setSelected(p.ticket);setMessages(p.messages||[]);setAttachments(p.attachments||[]);setReply('')}catch(e:any){setError(e.message)}},[]);
  useEffect(()=>{if(!selected)return;const timer=window.setInterval(()=>{if(!document.hidden)void open(selected.id)},20000);return()=>clearInterval(timer)},[selected?.id,open]);
  async function create(ev:React.FormEvent){
    ev.preventDefault();setError('');setSuccess('');
    if(paymentTypes.includes(kind)&&kind!=='payment'&&!orderId){setError('Select the paid order for the request.');return;}
    setSending(true);
    try{
      const r=await request('create','POST',{ticketType:kind,subject,reason,message:detail,orderId:paymentTypes.includes(kind)?orderId:null});
      setSubject('');setReason('');setDetail('');setOrderId('');setSuccess('Your request has been submitted.');
      await refresh();await open(r.ticket.id);setMode('list');
    }catch(e:any){setError(e.message)}finally{setSending(false)}
  }
  async function send(ev:React.FormEvent){
    ev.preventDefault();if(!selected||!reply.trim())return;setSending(true);setError('');
    try{await request('reply','POST',{ticketId:selected.id,message:reply});setReply('');await open(selected.id);await refresh()}catch(e:any){setError(e.message)}finally{setSending(false)}
  }
  return <div className="space-y-5">
    <Box>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Private customer service</p><h2 className="mt-1 text-xl font-bold text-slate-950">Contact support & track requests</h2><p className="mt-1 text-sm text-slate-600">Send a message, request a refund or ask to stop using your paid plan. Every request receives a ticket number.</p></div>
        <button type="button" onClick={()=>{setMode(mode==='new'?'list':'new');setSelected(null);setError('')}} className="min-h-11 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white">{mode==='new'?'My tickets':'+ New request'}</button>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600"/>Never share passwords, OTPs, API tokens or card / UPI PINs. Only you and authorized support staff can access your tickets.</p>
      {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {success&&<p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    </Box>
    {selected?<Box>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><button type="button" onClick={()=>setSelected(null)} className="mb-2 flex items-center gap-1 text-sm font-semibold text-indigo-600"><ArrowLeft className="h-4 w-4"/> All tickets</button><h3 className="text-lg font-bold text-slate-950">{selected.subject}</h3><p className="text-xs text-slate-500">{reference(selected)} · {labels[selected.ticket_type]} · {fmt(selected.created_at)}</p></div>
        <span className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">{statusLabel[selected.status]}</span>
      </div>
      {selected.admin_note&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Support decision: {selected.admin_note}</p>}
      <Messages messages={messages}/>
      <EvidencePanel ticketId={selected.id} asAdmin={false} attachments={attachments} onUploaded={()=>open(selected.id)}/>
      {selected.status!=='closed'?<form onSubmit={send} className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="support-followup">Your reply</label><textarea id="support-followup" maxLength={5000} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Write a message to our team…" required rows={2} className="min-h-14 w-full flex-1 rounded-xl border border-slate-300 p-3 text-sm"/><button type="submit" disabled={sending||!reply.trim()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4"/>Send reply</button></form>:<p className="mt-4 text-sm text-slate-500">This ticket is closed. Create another request if you still need help.</p>}
    </Box>:mode==='new'?<Box>
      <h3 className="text-lg font-bold text-slate-900">New support request</h3>
      <form onSubmit={create} className="mt-4 space-y-4">
        <label className="block text-sm font-semibold text-slate-700">What do you need help with?
          <select value={kind} onChange={e=>{setKind(e.target.value as TicketType);setOrderId('')}} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">{(Object.entries(labels) as [TicketType,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        </label>
        {(kind==='cancellation'||kind==='refund')&&<p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>One-time 30-day purchase:</strong> There is currently no automatic renewal or scheduled future charge. Stopping paid usage does not automatically issue a refund. Your paid access remains until its displayed expiry unless a separate change is approved. Refund requests are reviewed individually under our <a href="/refunds" className="underline">Refund & Cancellation Policy</a>.</p>}
        {paymentTypes.includes(kind)&&<label className="block text-sm font-semibold text-slate-700">Related payment {kind!=='payment'?'(required)':'(optional)'}
          <select value={orderId} onChange={e=>setOrderId(e.target.value)} required={kind!=='payment'} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">Select a payment</option>{eligibleOrders.map(o=><option key={o.order_id} value={o.order_id}>{o.plan_id} · ₹{o.amount_inr} · {new Date(o.created_at).toLocaleDateString('en-IN')} · {o.status}</option>)}</select>
          {!eligibleOrders.length&&<span className="mt-2 block text-xs font-normal text-slate-500">{kind==='payment'?'No payment orders yet. You can still describe the issue.':'No verified live paid orders found. Use a general support request for payment verification.'}</span>}
        </label>}
        <label className="block text-sm font-semibold text-slate-700">Subject
          <input required minLength={4} maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Briefly describe the issue" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3"/>
        </label>
        {(kind==='refund'||kind==='cancellation')&&<label className="block text-sm font-semibold text-slate-700">Reason
          <select value={reason} onChange={e=>setReason(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">
            <option value="">Select a reason</option>{['Accidental purchase','Duplicate payment','Not activated','Technical problem','No longer required','Service did not meet my expectations','Other'].map(x=><option key={x}>{x}</option>)}
          </select>
        </label>}
        <label className="block text-sm font-semibold text-slate-700">Your message
          <textarea required minLength={12} maxLength={5000} rows={5} value={detail} onChange={e=>setDetail(e.target.value)} placeholder="Please include what happened and approximately when. Do not include sensitive credentials." className="mt-2 w-full rounded-xl border border-slate-300 p-3"/>
        </label>
        <button disabled={sending} type="submit" className="min-h-12 rounded-xl bg-indigo-600 px-7 font-semibold text-white disabled:opacity-50">{sending?'Submitting…':'Submit request'}</button>
        <p className="text-xs leading-5 text-slate-500">A request is not an automatic cancellation, refund, payout or account deletion. We will review it and reply in your private support conversation.</p>
      </form>
    </Box>:<Box>
      <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-slate-950">Your support tickets</h3><button type="button" onClick={()=>void refresh()} className="flex items-center gap-1 text-xs font-semibold text-indigo-600"><RefreshCw className="h-4 w-4"/>Refresh</button></div>
      <div className="mt-4 space-y-3">{loading?<p className="py-6 text-sm text-slate-500">Loading tickets…</p>:!tickets.length?<div className="rounded-xl bg-slate-50 p-7 text-center"><Ticket className="mx-auto h-7 w-7 text-indigo-500"/><p className="mt-3 font-semibold text-slate-700">No support tickets yet</p><button onClick={()=>setMode('new')} className="mt-3 text-sm font-semibold text-indigo-600">Create your first request</button></div>:tickets.map(t=><button key={t.id} type="button" onClick={()=>void open(t.id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30"><span><strong className="block text-sm text-slate-900">{t.subject}</strong><small className="mt-1 block text-slate-500">{reference(t)} · {labels[t.ticket_type]} · {fmt(t.last_message_at)}</small></span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{statusLabel[t.status]}</span></button>)}</div>
    </Box>}
  </div>;
}

export function AdminSupportDesk(){
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [selected,setSelected]=useState<SupportTicket|null>(null);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [attachments,setAttachments]=useState<Evidence[]>([]);
  const [reply,setReply]=useState('');
  const [status,setStatus]=useState<TicketStatus>('open');
  const [note,setNote]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{try{const r=await request('admin-list');setTickets(r.tickets||[]);setError('')}catch(e:any){setError(e.message)}finally{setLoading(false)}},[]);
  const open=useCallback(async(id:string)=>{try{const r=await request('admin-thread','GET',undefined,'id='+encodeURIComponent(id));setSelected(r.ticket);setMessages(r.messages||[]);setAttachments(r.attachments||[]);setStatus(r.ticket.status);setNote(r.ticket.admin_note||'');setError('')}catch(e:any){setError(e.message)}},[]);
  useEffect(()=>{void load()},[load]);
  const initiateRefund=async()=>{if(!selected?.order_id)return;const confirmation=window.prompt('This will initiate a REAL full Cashfree refund for order '+selected.order_id+'. Type REFUND '+selected.order_id+' to confirm.');if(confirmation!=='REFUND '+selected.order_id)return;setBusy(true);setError('');try{await request('admin-refund','POST',{ticketId:selected.id,confirmRefund:confirmation});await open(selected.id);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const checkRefund=async()=>{if(!selected)return;setBusy(true);setError('');try{const r=await request('admin-refund-status','GET',undefined,'ticketId='+encodeURIComponent(selected.id));if(r.refund){await open(selected.id);await load()}else setError('No refund has been reserved for this ticket.')}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const save=async()=>{if(!selected)return;setBusy(true);try{await request('admin-update','POST',{ticketId:selected.id,status,note});await open(selected.id);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const send=async(ev:React.FormEvent)=>{ev.preventDefault();if(!selected||!reply.trim())return;setBusy(true);try{await request('admin-reply','POST',{ticketId:selected.id,message:reply});setReply('');await open(selected.id);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  return <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(0,1.5fr)]">
    <Box><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Customer requests ({tickets.length})</h3><button type="button" onClick={()=>void load()} className="text-sm text-indigo-600">Refresh</button></div>
      {error&&<p className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {loading?<p className="text-sm">Loading requests…</p>:!tickets.length?<p className="text-sm text-slate-500">No tickets.</p>:<div className="max-h-[650px] space-y-2 overflow-y-auto">{tickets.map(t=><button type="button" key={t.id} onClick={()=>void open(t.id)} className={'w-full rounded-xl border p-3 text-left text-sm '+(selected?.id===t.id?'border-indigo-400 bg-indigo-50':'border-slate-200 hover:bg-slate-50')}><strong className="block break-words">{t.subject}</strong><span className="mt-1 block text-xs text-slate-500">{reference(t)} · {labels[t.ticket_type]} · {statusLabel[t.status]}</span><span className="mt-1 block text-xs text-slate-400">Customer: {t.owner_user_id.slice(0,8)}…</span></button>)}</div>}
    </Box>
    <Box>{!selected?<div className="py-10 text-center text-sm text-slate-500"><MessageSquareText className="mx-auto mb-3 h-8 w-8"/>Select a ticket to view messages and respond.</div>:<>
      <h3 className="text-lg font-bold">{selected.subject}</h3><p className="mb-4 mt-1 break-all text-xs text-slate-500">{reference(selected)} · {labels[selected.ticket_type]} · {selected.owner_user_id} · {selected.order_id||'No payment'}</p>
      <Messages messages={messages}/>
      <EvidencePanel ticketId={selected.id} asAdmin={true} attachments={attachments} onUploaded={()=>open(selected.id)}/>
      <form onSubmit={send} className="mt-4 space-y-2"><label className="block text-sm font-semibold">Reply to customer<textarea maxLength={5000} rows={3} required value={reply} onChange={e=>setReply(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" placeholder="Type your response…"/></label><button type="submit" disabled={busy||selected.status==='closed'} className="min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white disabled:opacity-50">Send reply</button></form>
      <div className="mt-5 border-t border-slate-200 pt-4"><label className="block text-sm font-semibold">Ticket status
        <select className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" value={status} onChange={e=>setStatus(e.target.value as TicketStatus)}>{(Object.keys(statusLabel) as TicketStatus[]).filter(s=>!['refund_initiated','refunded'].includes(s)).map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></label>
        <label className="mt-3 block text-sm font-semibold">Decision / explanation
          <textarea maxLength={500} rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Required if rejecting a request" className="mt-2 w-full rounded-xl border border-slate-300 p-3"/></label>
        <p className="my-3 text-xs leading-5 text-amber-700">Approval here is a review status only. No Cashfree payout, account deletion, or plan termination is triggered automatically.</p>
        <button type="button" disabled={busy} onClick={()=>void save()} className="min-h-11 rounded-xl border border-indigo-500 px-5 text-sm font-semibold text-indigo-700 disabled:opacity-50">Save status</button>
        {selected.ticket_type==='refund'&&selected.order_id&&<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="font-bold text-amber-950">Merchant refund processing</h4>
          <p className="mt-2 text-sm leading-6 text-amber-900">Verify the payment, customer request and refund policy first. Only an approved ticket can initiate a full refund. A second refund is permanently blocked for the same order.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.status==='approved'&&<button type="button" disabled={busy} onClick={()=>void initiateRefund()} className="min-h-11 rounded-xl bg-amber-700 px-4 text-sm font-bold text-white disabled:opacity-50">Initiate full refund in Cashfree</button>}
            <button type="button" disabled={busy} onClick={()=>void checkRefund()} className="min-h-11 rounded-xl border border-amber-500 bg-white px-4 text-sm font-bold text-amber-900 disabled:opacity-50">Verify refund status</button>
          </div>
        </div>}
      </div>
    </>}</Box>
  </div>;
}
