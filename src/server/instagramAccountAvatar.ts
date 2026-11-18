import {adminDb} from './adminOperations.js';
import {cacheInstagramProfilePhoto} from '../../supabase/functions/instagram-live-webhook/instagramProfiles.js';

type ConnectedAccount={workspaceId:string;account:{username?:string;status?:string;profile_pic_url?:string;profile_photo_cached_at?:string;[key:string]:unknown}};
type Store=typeof adminDb;
const WORKSPACE_ID=/^(?:[a-f0-9-]{36}|guest_[a-f0-9-]{16,})$/i;
const CACHED=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const FRESH_MS=24*60*60*1000;
const cached=(value:unknown):value is string=>typeof value==='string'&&value.length<=90000&&CACHED.test(value);

/** Called only after the account-list endpoint has verified the actual user or Admin Support session.
 * Cache a real Meta thumbnail server-side so browser hotlink blocking or expiring CDN
 * signatures no longer leave blank connected-account avatars. Never return tokens.
 */
export async function hydrateInstagramAccountAvatars<T extends ConnectedAccount>(
 items:T[],
 options:{db?:Store;fetcher?:typeof fetch;now?:number}={}
):Promise<T[]>{
 if(!Array.isArray(items)||!items.length)return items;
 const db=options.db||adminDb, fetcher=options.fetcher||fetch,now=options.now??Date.now();
 const toRefresh=items.filter(item=>item?.account?.status==='connected'&&WORKSPACE_ID.test(item.workspaceId)
   &&(!cached(item.account.profile_pic_url)
      ||!Number.isFinite(Date.parse(String(item.account.profile_photo_cached_at||'')))
      ||now-Date.parse(String(item.account.profile_photo_cached_at))>=FRESH_MS));
 if(!toRefresh.length)return items;
 let records:any[];
 try{
   const ids=[...new Set(toRefresh.map(item=>item.workspaceId))];
   records=await db('autoreply_instagram_tokens?select=user_id,account&user_id=in.('+ids.map(encodeURIComponent).join(',')+')');
 }catch{console.warn('[IG_AVATAR_PRIVATE_READ_UNAVAILABLE]');return items;}
 const tokenByWorkspace=new Map((records||[]).map((row:any)=>[String(row.user_id),row.account]));
 return Promise.all(items.map(async item=>{
   if(!toRefresh.includes(item))return item;
   const stored:any=tokenByWorkspace.get(item.workspaceId);
   const token=String(stored?.access_token||'');
   if(!token||!stored?.username)return item;
   const original=String(stored.profile_pic_url||'');
   const current=String(item.account.profile_pic_url||original);
   let photo='';
   // First try the existing Meta CDN photo. The helper validates the hostname,
   // magic bytes, MIME type and max size without forwarding the OAuth token.
   if(!cached(current))photo=await cacheInstagramProfilePhoto(current,fetcher);
   if(!cached(photo)){
     // Meta may have rotated an expiring signed CDN URL; request a fresh one.
     try{
       const response=await fetcher('https://graph.instagram.com/v25.0/me?fields=id,user_id,username,profile_picture_url',{
         headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(3500)
       });
       if(response.ok){
         const profile:any=await response.json();
         const expectedIds=[stored.ig_scoped_id,stored.ig_user_id].filter(Boolean).map(String);
         const freshIds=[profile?.id,profile?.user_id].filter(Boolean).map(String);
         // A replaced/revoked token must not display somebody else's profile photo.
         if(expectedIds.length&&freshIds.length&&!freshIds.some(id=>expectedIds.includes(id)))return item;
         const latest=String(profile?.profile_picture_url||'');
         if(latest)photo=await cacheInstagramProfilePhoto(latest,fetcher);
       }
     }catch{ /* Keep the saved profile and Instagram connection unchanged. */ }
   }
   if(!cached(photo))return item;
   // Update just the avatar keys, atomically and only if no reconnect replaced
   // this account while Meta was being queried.
   try{
     const saved=await db('rpc/autoreply_cache_instagram_account_photo','POST',{
       p_workspace:item.workspaceId,p_expected_photo:original,p_cached_photo:photo
     });
     if(saved!==true)return item;
   }catch{console.warn('[IG_AVATAR_PERSIST_UNAVAILABLE]');return {...item,account:{...item.account,profile_pic_url:photo}} as T;}
   return {...item,account:{...item.account,profile_pic_url:photo,profile_photo_cached_at:new Date(now).toISOString()}} as T;
 }));
}
