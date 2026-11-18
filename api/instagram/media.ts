import { typedFetch as httpFetch } from '../../src/server/typedFetch.js';
import { guestStoreHeaders } from '../../src/server/guestStoreAuth.js';
import { authenticatedWorkspace } from '../../src/server/supabaseConfig.js';
import { SUPABASE_URL } from '../../src/server/supabaseConfig.js';
import {adminDb} from '../../src/server/adminOperations.js';

const GUEST_COOKIE = 'autoreply_guest_workspace';

function getRequestCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;

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
  return /^guest_[a-f0-9-]{16,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAuthenticatedUserId(req:any) { return (await authenticatedWorkspace(req))?.id || ''; }

async function fetchWithTimeout(url:string,init:RequestInit={},ms=15000) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
  try{return await httpFetch(url,{...init,signal:controller.signal});}finally{clearTimeout(timer);}
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const authenticatedUid = await getAuthenticatedUserId(req);
    const workspaceId = authenticatedUid || getRequestCookie(req, GUEST_COOKIE);
    if (!isWorkspaceId(workspaceId)) {
      return res.status(401).json({
        ok: false,
        error: 'Connect Instagram first, then reopen the automation builder.',
      });
    }

    const requestedKind = String(req.query?.kind || 'comment');
    const kind = requestedKind === 'story' ? 'story' : 'comment';

    const verified=await authenticatedWorkspace(req);
    if(verified?.supportMode){
      const rows=await adminDb('autoreply_instagram_tokens?select=account&user_id=eq.'+encodeURIComponent(workspaceId)+'&limit=1');
      const account=rows?.[0]?.account;
      const token=String(account?.access_token||'');
      if(!token)return res.status(409).json({ok:false,error:'Customer Instagram account is not connected.'});
      const params=new URLSearchParams({fields:kind==='story'
        ?'id,media_type,media_url,thumbnail_url,permalink,timestamp'
        :'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp',limit:'50'});
      const endpoint=kind==='story'?'stories':'media';
      const igId=String(account?.ig_user_id||'me');
      const media=await fetchWithTimeout('https://graph.instagram.com/v25.0/'+encodeURIComponent(igId)+'/'+endpoint+'?'+params,{
        headers:{Authorization:'Bearer '+token}
      });
      const result=await media.json().catch(()=>({}));
      if(!media.ok)return res.status(media.status).json({ok:false,error:'Instagram media could not be loaded.'});
      const items=(Array.isArray(result?.data)?result.data:[]).map((item:any)=>{
        const rawType=String(item.media_type||'').toUpperCase(),prod=String(item.media_product_type||'').toUpperCase(),permalink=String(item.permalink||'');
        const contentType=kind==='story'?'STORY':prod==='REELS'||permalink.includes('/reel/')?'REEL':'POST';
        return {id:String(item.id||''),media_type:rawType,media_product_type:prod,
          content_type:contentType,caption:String(item.caption||''),media_url:String(item.media_url||''),
          thumbnail_url:String(item.thumbnail_url||item.media_url||''),permalink,timestamp:String(item.timestamp||'')};
      }).filter((item:any)=>item.id);
      res.setHeader('Cache-Control','private, no-store');
      return res.status(200).json({ok:true,kind,username:String(account.username||''),items});
    }

    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/functions/v1/instagram-account-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...guestStoreHeaders(), ...(req.headers?.authorization ? {Authorization:String(req.headers.authorization)} : {}) },
        body: JSON.stringify({
          action: 'list_media',
          workspaceId,
          kind,
        }),
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      console.error(
        '[INSTAGRAM_MEDIA_LIST_FAILED]',
        response.status,
        payload?.error || payload
      );

      return res.status(response.status >= 400 ? response.status : 500).json({
        ok: false,
        error:
          payload?.error ||
          (kind === 'story'
            ? 'Could not load active Instagram stories.'
            : 'Could not load Instagram posts and reels.'),
      });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      ok: true,
      kind,
      username: payload?.username || '',
      items: Array.isArray(payload?.items) ? payload.items : [],
    });
  } catch (err: any) {
    console.error('[INSTAGRAM_MEDIA_API_FATAL]', err);
    return res.status(err?.status || 500).json({
      ok: false,
      error: err?.name === 'AbortError'
        ? 'Instagram media request timed out. Please try again.'
        : err?.message || 'Instagram media request failed.',
    });
  }
}
