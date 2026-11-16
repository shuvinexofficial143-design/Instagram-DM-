/** Runtime JS mirror of adAttribution.ts for native ESM and Supabase Edge imports.
 * Keep this implementation in sync with the typed source.
 */
const limited = (value, max=200) => typeof value === 'string' || typeof value === 'number'
  ? String(value).trim().slice(0,max) : '';
export function mediaReferenceKey(value) {
  const raw=limited(value).replace(/\/$/,'');
  const match=raw.match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
  if(match)return match[1];
  return /^[a-z\d_-]{1,100}$/i.test(raw)?raw:'';
}
export function normalizeInstagramAdSource(raw) {
  if(!raw||typeof raw!=='object')return null;
  const ad=limited(raw.ad_id ?? raw.ads_context_data?.ad_id,100);
  const media=limited(raw.ads_context_data?.post_id ?? raw.media?.id ?? raw.post_id ?? raw.media_id,200);
  const ad_id=/^[a-z\d_-]{1,100}$/i.test(ad)?ad:'';
  const media_id=mediaReferenceKey(media)?media:'';
  if(!ad_id&&!media_id)return null;
  const source=limited(raw.source,40);
  return {...(ad_id?{ad_id}:{}),...(media_id?{media_id}:{}),...(source?{source}:{})};
}
export function matchInstagramAdProduct(products,source) {
  if(!source)return {status:'none'};
  const match=(items,via)=>items.length===1
    ? {status:'matched',product:items[0],via}
    : {status:'ambiguous',via};
  if(source.ad_id){
    const adMatches=products.filter(p=>(p.ad_refs||[]).includes(source.ad_id));
    if(adMatches.length)return match(adMatches,'ad');
  }
  const key=mediaReferenceKey(source.media_id);
  if(key){
    const mediaMatches=products.filter(p=>(p.reel_refs||[]).some(ref=>mediaReferenceKey(ref)===key)
      ||(p.post_refs||[]).some(ref=>mediaReferenceKey(ref.post_id)===key));
    if(mediaMatches.length)return match(mediaMatches,'media');
  }
  return {status:'none'};
}

/** Extract only explicit Instagram Reel/Post links and shared media IDs, never CDN thumbnails. */
export function extractInstagramSharedMedia(message){
 const refs=[],attachments=Array.isArray(message?.attachments)?message.attachments:[];
 let hasSharedMedia=false;
 const add=(raw)=>{
  const value=limited(raw,400);
  if(!value)return;
  for(const match of value.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[a-zA-Z0-9_-]{1,100}\/?(?:\?[^\s]*)?/gi))
   if(mediaReferenceKey(match[0]))refs.push(match[0]);
 };
 add(message?.text);add(message?.share?.link);add(message?.share?.url);
 for(const attachment of attachments){
  const type=limited(attachment?.type,40).toLowerCase(),payload=attachment?.payload||{};
  const isShared=['share','ig_reel','ig_post','reel','post','instagram_share','ig_media'].includes(type);
  const structured=Boolean(payload?.media?.id||payload?.reel?.id||payload?.post_id||payload?.media_id||payload?.reel_id);
  if(!isShared&&!structured)continue;
  hasSharedMedia=true;
  for(const raw of [payload?.url,payload?.link,payload?.permalink,payload?.media?.permalink,payload?.media?.url,payload?.reel?.permalink,payload?.reel?.url])add(raw);
  for(const raw of [payload?.media?.id,payload?.reel?.id,payload?.post_id,payload?.media_id,payload?.reel_id,...(isShared?[payload?.id]:[])])
   if(mediaReferenceKey(raw))refs.push(String(raw).trim());
 }
 if(refs.length)hasSharedMedia=true;
 return {references:[...new Set(refs)].slice(0,8),hasSharedMedia};
}
/** Explicitly shared references must ALL resolve to one SKU, or require clarification. */
export function matchSharedInstagramMedia(products,references){
 if(!references.length)return {status:'none'};
 const hits=references.map(media_id=>matchInstagramAdProduct(products,{media_id}));
 if(hits.some(hit=>hit.status==='ambiguous'))return {status:'ambiguous'};
 const selected=hits.filter(hit=>hit.status==='matched');
 if(selected.length===references.length&&new Set(selected.map(hit=>hit.product.id)).size===1)
  return {status:'matched',product:selected[0].product};
 if(selected.length)return {status:'ambiguous'};
 return {status:'none'};
}
