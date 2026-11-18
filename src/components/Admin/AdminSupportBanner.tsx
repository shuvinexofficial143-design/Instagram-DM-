import React,{useState} from 'react';
import {auth} from '../../lib/supabase';
import {useApp} from '../../context/AppContext';
import {ShieldCheck,LogOut} from 'lucide-react';

/** The real workspace UI stays mounted; only the authenticated data scope changes. */
export function AdminSupportBanner(){
 const {supportSession}=useApp();
 const [leaving,setLeaving]=useState(false),[error,setError]=useState('');
 if(!supportSession)return null;
 const exit=async()=>{
   if(leaving)return;
   setLeaving(true);setError('');
   try{
     const token=await auth.currentUser?.getIdToken();
     if(!token)throw Error('Admin session expired.');
     const response=await fetch('/api/workspace-data?action=admin-support-stop',{
       method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
       credentials:'same-origin',cache:'no-store',body:'{}'
     });
     const data=await response.json();
     if(!response.ok||!data?.ok)throw Error(data?.error||'Could not end support session.');
     window.location.assign('/admin');
   }catch(err:any){setError(err?.message||'Could not end support session.');setLeaving(false);}
 };
 return <section role="status" aria-label="Administrator customer workspace" className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-800 bg-indigo-950 px-4 py-2 text-white">
   <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
     <ShieldCheck size={18} aria-hidden="true"/>
     <span className="truncate"><strong>Administrator Support Mode</strong> · Customer: {supportSession.customer.name} {supportSession.customer.email?'('+supportSession.customer.email+')':''}</span>
   </div>
   <div className="flex items-center gap-2">
     {error&&<span role="alert" className="text-xs text-amber-200">{error}</span>}
     <button onClick={()=>void exit()} disabled={leaving} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-indigo-950 hover:bg-indigo-100 disabled:opacity-60"><LogOut size={14}/>{leaving?'Exiting…':'Exit to Admin'}</button>
   </div>
 </section>;
}
