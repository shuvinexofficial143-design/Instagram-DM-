import { typedFetch as httpFetch } from './typedFetch.js';
import { authenticatedWorkspace, SUPABASE_URL } from './supabaseConfig.js';
import { readCookie, enforceRateLimit } from '../../api/_auth.js';
import { guestStoreHeaders } from './guestStoreAuth.js';

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
