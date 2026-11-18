import React, {useState} from 'react';
import {adminToolsRequest as request} from '../../lib/adminTools';
import {CatalogEditor, ProductEditor} from '../Catalog/CatalogEditors';
import {AdminAiAllowance} from './AdminAiAllowance';

export function CustomerControls({workspaceId,data,reload}:{workspaceId:string;data:any;reload:()=>Promise<boolean>}) {
 const [tab,setTab]=useState(location.hash==='#allowance'?'Plan & AI limit':'Overview');
 const [preview,setPreview]=useState('');
 const [older,setOlder]=useState<any[]>([]);
 const [noMore,setNoMore]=useState(false);
 const [editor,setEditor]=useState<any>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [recipient,setRecipient]=useState('');
 const [reply,setReply]=useState('');
 const [note,setNote]=useState('');
 async function save(action:string,fields:Record<string,unknown>){
  await request(action,{workspaceId,...fields});
  if(!await reload())throw Error('Saved. Refresh to see the updated workspace.');
 }
 return <section className="at-panel at-editor">
 <nav className="at-actions" aria-label="Customer workspace">{['Overview','Plan & AI limit','Catalog & products','Inbox','Activity'].map(t=><button key={t} className={t===tab?'at-primary':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>
 {tab==='Overview'&&<><h3>Setup checklist</h3><p>{data.catalogs.length?'✓':'○'} Catalog · {data.products.length?'✓':'○'} Product · {data.automations.some((a:any)=>a.status==='active')?'✓':'○'} Active automation</p>
 <label>Preview automation<select value={preview} onChange={ev=>setPreview(ev.target.value)}><option value="">Choose automation</option>{data.automations.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 {data.automations.filter((a:any)=>a.id===preview).map((a:any)=><article key={a.id}><strong>{a.trigger_type} · {a.status}</strong>{a.actions.map((v:any,i:number)=><p key={i}>{v.type} · {v.message_text||v.ai_system_instruction||v.comment_reply_text} {data.catalogs.find((c:any)=>c.id===v.catalog_id)?.name}</p>)}</article>)}</>}
 {tab==='Plan & AI limit'&&<AdminAiAllowance workspaceId={workspaceId} entitlement={data.entitlement} planEntitlement={data.planEntitlement} history={data.allowances||[]} reload={reload}/>}
 {tab==='Catalog & products'&&<><h3>Catalogs and products</h3><button onClick={()=>setEditor({kind:'catalog'})}>New catalog</button>
 {data.catalogs.filter((c:any)=>!c.deleted).map((c:any)=><section key={c.id}><strong>{c.name}</strong> <button onClick={()=>setEditor({kind:'catalog',catalog:c})}>Edit catalog</button> <button onClick={()=>setEditor({kind:'product',catalog:c})}>Add product</button>{data.products.filter((p:any)=>p.catalog_id===c.id).map((p:any)=><button key={p.id} onClick={()=>setEditor({kind:'product',catalog:c,product:p})}>{p.name}</button>)}</section>)}
 {editor?.kind==='catalog'&&<CatalogEditor catalog={editor.catalog} onClose={()=>setEditor(null)} onSave={record=>save('admin-catalog-save',{collection:'catalogs',record})}/>}
 {editor?.kind==='product'&&<ProductEditor workspaceId={workspaceId} catalog={editor.catalog} product={editor.product} onClose={()=>setEditor(null)} onSave={record=>save('admin-catalog-save',{collection:'catalog_products',record})} onDelete={async()=>{throw Error('Product deletion is unavailable in support mode.');}}/>}
 </>}{tab==='Inbox'&&<><h3>Inbox messages</h3>{[...data.messages,...older].map((m:any)=><p key={m.id}><strong>{m.direction==='out'?'Sent':m.from_username||'Received'}</strong> {m.message_text} {m.from_ig_id&&<button onClick={()=>{setRecipient(m.from_ig_id);setReply('');}}>Reply</button>}</p>)}
 {recipient&&<form onSubmit={async ev=>{ev.preventDefault();setBusy(true);setError('');try{const handoff=await request('admin-support-takeover',{workspaceId,sender:recipient});const result=await request('admin-handoff-reply',{id:handoff.id,messageText:reply});if(!result.sent||!result.message_id)throw Error('Check Instagram to verify delivery.');setRecipient('');setReply('');await reload();}catch(err:any){setError(err.message);}finally{setBusy(false);}}}><label>Reply to {recipient}<textarea required maxLength={1000} value={reply} onChange={ev=>setReply(ev.target.value)}/></label><button disabled={busy}>Pause AI and send from this Instagram account</button></form>}
 {data.messages.length===50&&!noMore&&<button disabled={busy} onClick={async()=>{setBusy(true);try{const result=await request('admin-support-inbox',undefined,{workspaceId,offset:String(50+older.length)});setOlder(previous=>[...previous,...result.messages]);setNoMore(result.messages.length<50);}catch(err:any){setError(err.message);}finally{setBusy(false);}}}>Older messages</button>}</>}
 {tab==='Activity'&&<><h3>Internal notes and activity</h3>{data.activity.map((row:any)=><p key={row.id}>{new Date(row.created_at).toLocaleString()} · {row.action} {row.after_data?.note}</p>)}
 <form onSubmit={async ev=>{ev.preventDefault();setBusy(true);try{await save('admin-support-note',{note});}catch(err:any){setError(err.message);}finally{setBusy(false);}}}><label>Staff note<input required maxLength={1000} value={note} onChange={ev=>setNote(ev.target.value)}/></label><button disabled={busy}>Add note</button></form></>}
 {error&&<p role="alert">{error}</p>}</section>;
}
