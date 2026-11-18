import { typedFetch as httpFetch } from './typedFetch.js';
import { authenticatedWorkspace, SUPABASE_URL } from './supabaseConfig.js';
import { readCookie, enforceRateLimit } from '../../api/_auth.js';
import { guestStoreHeaders } from './guestStoreAuth.js';
import {adminDb,runAdminOperation} from './adminOperations.js';
import {adminRelayHeaders} from './adminAccess.js';
import {authenticatedUser} from './supabaseConfig.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ok:false,sent:false,error:'Method Not Allowed'});
  }
  try {
    const identity = await authenticatedWorkspace(req);
    if (req.headers?.authorization && !identity) return res.status(401).json({ok:false,sent:false,error:'Sign in again to send a reply.'});
    const guest = readCookie(req,'autoreply_guest_workspace');
    const workspaceId = identity?.id || (/^guest_[a-f0-9-]{16,}$/i.test(guest) ? guest : '');
    if (!workspaceId) return res.status(401).json({ok:false,sent:false,error:'Sign in and connect Instagram first.'});
    const rate = enforceRateLimit(`manual-dm:${workspaceId}`,30,60000);
    if (!rate.allowed) { res.setHeader('Retry-After',String(rate.retryAfter)); return res.status(429).json({ok:false,sent:false,error:'Please wait before sending more replies.'}); }
    if(identity?.supportMode){
      const actor=await authenticatedUser(req);
      if(!actor)return res.status(401).json({ok:false,sent:false,error:'Admin sign-in expired.'});
      const alias=String(req.body?.recipientUsername||'').trim().toLowerCase().replace(/^@/,'');
      const message=String(req.body?.messageText||'').trim();
      if(!alias||!message||message.length>1000)return res.status(400).json({ok:false,sent:false,error:'Choose a conversation and enter a message of up to 1,000 characters.'});
      const contactRows=await adminDb('autoreply_documents?select=id,data&user_id=eq.'+encodeURIComponent(workspaceId)+'&collection=eq.contacts&limit=10000');
      const matches=(contactRows||[]).filter((r:any)=>[r.id,r.data?.ig_username,r.data?.ig_user_id,...(Array.isArray(r.data?.ig_user_ids)?r.data.ig_user_ids:[])].some((value:any)=>String(value||'').toLowerCase().replace(/^@/,'')===alias));
      const ids=[...new Set(matches.map((r:any)=>String(r.data?.ig_user_id||'')).filter((id:string)=>/^\d{5,30}$/.test(id)))];
      if(ids.length!==1)return res.status(409).json({ok:false,sent:false,error:'No unique Meta messaging-scoped recipient for this customer. Ask them to send a fresh DM.'});
      const handoff=await runAdminOperation({query:{action:'admin-support-takeover',workspaceId},body:{workspaceId,sender:ids[0]}},actor);
      if(!handoff?.ok||!handoff?.id)return res.status(502).json({ok:false,sent:false,error:'Could not pause the AI and take over this conversation.'});
      const jwt=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
      const response=await httpFetch(`${SUPABASE_URL}/functions/v1/instagram-account-store`,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt,...adminRelayHeaders('admin_handoff_reply',jwt)},
        body:JSON.stringify({action:'admin_handoff_reply',handoffId:handoff.id,messageText:message}),
        signal:AbortSignal.timeout(20000),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.sent||!payload?.message_id)return res.status(response.status>=400?response.status:502).json({ok:false,sent:false,error:payload?.error||'Instagram did not confirm delivery. Check the conversation before retrying.'});
      return res.status(200).json(payload);
    }
    const response = await httpFetch(`${SUPABASE_URL}/functions/v1/instagram-account-store`,{
      method:'POST',headers:{'Content-Type':'application/json',...(identity ? {Authorization:String(req.headers.authorization)} : guestStoreHeaders())},
      body:JSON.stringify({action:'send_dm',workspaceId,recipientUsername:req.body?.recipientUsername,messageText:req.body?.messageText}),
      signal:AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(()=>null);
    if (!response.ok || payload?.ok !== true || payload?.sent !== true || !payload?.message_id) {
      return res.status(response.status >= 400 ? response.status : 502).json({ok:false,sent:false,error:payload?.error || 'Instagram did not confirm the message.'});
    }
    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(err?.status || 502).json({ok:false,sent:false,error:err?.message || 'Instagram delivery could not be confirmed. Check Instagram before retrying.'});
  }
}
