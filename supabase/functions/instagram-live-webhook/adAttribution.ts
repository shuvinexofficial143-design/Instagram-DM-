/** Source attribution for signed Meta Instagram messaging events.
 * These fields are optional: a Reel view or later profile DM is NOT an ad click.
 * Never infer an ad ID from a caption, customer text or unsanitized URL.
 */
export type InstagramAdSource = {
  ad_id?: string;
  media_id?: string;
  source?: string;
  received_at?: string;
};
export type AdMappedProduct = {
  id: string;
  ad_refs?: string[];
  reel_refs?: string[];
  post_refs?: Array<{post_id:string;position:number}>;
};
const limited = (value:unknown, max=200) => typeof value === 'string' || typeof value === 'number'
  ? String(value).trim().slice(0,max) : '';
export function mediaReferenceKey(value:unknown):string {
  const raw=limited(value).replace(/\/$/,'');
  const match=raw.match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
  if(match)return match[1].toLowerCase();
  return /^[a-z\d_-]{1,100}$/i.test(raw)?raw.toLowerCase():'';
}
export function normalizeInstagramAdSource(raw:any):InstagramAdSource|null {
  if(!raw||typeof raw!=='object')return null;
  const ad=limited(raw.ad_id ?? raw.ads_context_data?.ad_id,100);
  const media=limited(raw.ads_context_data?.post_id ?? raw.media?.id ?? raw.post_id ?? raw.media_id,200);
  const ad_id=/^[a-z\d_-]{1,100}$/i.test(ad)?ad:'';
  const media_id=mediaReferenceKey(media)?media:'';
  if(!ad_id&&!media_id)return null;
  const source=limited(raw.source,40);
  return {...(ad_id?{ad_id}:{}),...(media_id?{media_id}:{}),...(source?{source}:{})};
}
export function matchInstagramAdProduct<T extends AdMappedProduct>(products:T[],source:InstagramAdSource|null|undefined):
  {status:'matched'|'ambiguous'|'none'; product?:T; via?:'ad'|'media'} {
  if(!source)return {status:'none'};
  const match=(items:T[],via:'ad'|'media')=>items.length===1
    ? {status:'matched' as const,product:items[0],via}
    : {status:'ambiguous' as const,via};
  if(source.ad_id){
    const adMatches=products.filter(p=>(p.ad_refs||[]).includes(source.ad_id!));
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
