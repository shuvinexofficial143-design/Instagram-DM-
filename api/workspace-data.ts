import { typedFetch as httpFetch } from '../src/server/typedFetch.js';
import adminHandler from '../src/server/adminAccess.js';
import threadControl from '../src/server/threadControl.js';
import supportHandler from '../src/server/support.js';
import lifecycleHandler from '../src/server/customerLifecycle.js';
import { guestStoreHeaders } from '../src/server/guestStoreAuth.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../src/server/supabaseConfig.js';

const GUEST_COOKIE = 'autoreply_guest_workspace';

function getCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;

    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

function isWorkspaceId(value: string): boolean {
  return /^guest_[a-f0-9-]{16,}$/i.test(value);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    return await httpFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  if(req.query?.action==='thread-control')return threadControl(req,res);
  if (String(req.query?.action || '').startsWith('admin-')) return adminHandler(req,res);

  // Route authenticated support actions through an existing Vercel function.
  // Keeps Hobby deployment under the 12-function limit without changing
  // existing GET /api/workspace-data guest automation behavior.
  if (String(req.query?.action || '').startsWith('mail-')) {
    return lifecycleHandler(req,res);
  }
  if (String(req.query?.action || '').startsWith('support-')) {
    return supportHandler(req, res);
  }

  if(['inbox-page','inbox-analytics','inbox-read'].includes(String(req.query?.action||''))){
    const action=String(req.query.action),workspaceId=getCookie(req,GUEST_COOKIE);
    if(!isWorkspaceId(workspaceId))return res.status(401).json({ok:false,error:'Workspace session required.'});
    if(req.method!==(action==='inbox-read'?'POST':'GET'))return res.status(405).json({ok:false,error:'Method Not Allowed'});
    try{
      const response=await fetchWithTimeout(SUPABASE_URL+'/functions/v1/instagram-account-store',{method:'POST',headers:{'Content-Type':'application/json',...guestStoreHeaders()},body:JSON.stringify({
        action:action==='inbox-page'?'list_inbox_page':action==='inbox-analytics'?'inbox_analytics':'mark_inbox_read',workspaceId,
        sender:action==='inbox-read'?req.body?.sender:String(req.query.sender||''),read:req.body?.read,
        before_time:req.query.before_time||null,before_id:req.query.before_id||null,start:req.query.start,end:req.query.end,timezone:req.query.timezone,
      })});
      const data=await response.json();res.setHeader('Cache-Control','private, no-store');return res.status(response.status).json(data);
    }catch{return res.status(503).json({ok:false,error:'Inbox service unavailable.'});}
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const workspaceId = getCookie(req, GUEST_COOKIE);
  if (!isWorkspaceId(workspaceId)) {
    return res.status(200).json({
      ok: true,
      automations: [],
      contacts: [],
      inboxMessages: [],
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/functions/v1/instagram-account-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...guestStoreHeaders() },
        body: JSON.stringify({
          action: 'list_workspace_data',
          workspaceId,
        }),
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return res.status(response.status >= 400 ? response.status : 500).json({
        ok: false,
        error: payload?.error || 'Workspace data could not be loaded.',
      });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      ok: true,
      automations: Array.isArray(payload?.automations) ? payload.automations : [],
      contacts: Array.isArray(payload?.contacts) ? payload.contacts : [],
      inboxMessages: Array.isArray(payload?.inboxMessages) ? payload.inboxMessages : [],
      inboxUnreadCounts:payload?.inboxUnreadCounts||{},
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error:
        err?.name === 'AbortError'
          ? 'Workspace data request timed out.'
          : err?.message || 'Workspace data request failed.',
    });
  }
}
