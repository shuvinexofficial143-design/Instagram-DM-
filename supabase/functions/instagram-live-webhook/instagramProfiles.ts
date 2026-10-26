/** The Conversations API can disclose a verified handle even when the separate
 * User Profile API withholds the photo until the person grants messaging consent.
 * Match only an exact scoped ID in a conversation containing this business. */
export async function fetchConversationUsernames(accessToken: string, businessId: string, requestedIds: string[]) {
  const names = new Map<string, string>();
  if (!/^\d+$/.test(businessId) || !requestedIds.length) return names;
  const wanted = new Set(requestedIds.filter(id => /^\d+$/.test(id) && id !== businessId));
  const seen = new Set<string>();
  let after = '';
  const deadline = Date.now() + 12000;
  for (let page = 0; page < 10 && Date.now() < deadline; page++) {
    const params = new URLSearchParams({platform:'instagram',fields:'id,participants',limit:'100',...(after?{after}:{})});
    try {
      const response = await fetch(`https://graph.instagram.com/v25.0/${encodeURIComponent(businessId)}/conversations?${params}`, {
        headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(Math.min(5000, Math.max(1, deadline-Date.now()))),
      });
      const payload: any = await response.json().catch(() => null);
      if (!response.ok) { console.warn('[IG_CONVERSATION_PROFILE_WARN]',response.status,payload?.error?.code||'unavailable'); break; }
      for (const conversation of Array.isArray(payload?.data) ? payload.data : []) {
        const people = Array.isArray(conversation?.participants?.data) ? conversation.participants.data : [];
        if (!people.some((person:any) => String(person.id) === businessId)) continue;
        for (const person of people) {
          const id=String(person.id||''), username=String(person.username||'').trim().replace(/^@/,'').toLowerCase();
          if(wanted.has(id) && !names.has(id) && /^[a-z0-9._]{1,30}$/.test(username) && !/^\d+$/.test(username)) names.set(id,username);
        }
      }
      if ([...wanted].every(id=>names.has(id))) break;
      // Never follow a provider-supplied URL with credentials or a foreign host.
      const cursor=String(payload?.paging?.cursors?.after||'');
      if(!payload?.paging?.next || !cursor || seen.has(cursor)) break;
      seen.add(cursor); after=cursor;
    } catch(error) { console.warn('[IG_CONVERSATION_PROFILE_FETCH_WARN]',error instanceof Error?error.name:'network'); break; }
  }
  return names;
}

const MAX_PHOTO_BYTES = 64 * 1024;
function trustedPhotoUrl(value: string): URL | null {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
      (host.endsWith('.cdninstagram.com') || host.endsWith('.fbcdn.net') || host === 'lookaside.fbsbx.com') ? url : null;
  } catch { return null; }
}

/** Cache only a real, bounded Meta CDN image returned for a verified participant.
 * Embedding this thumbnail in the private contact document avoids browser/CDN
 * failures and expired hotlinks. Credentials are never sent to a photo host. */
export async function cacheInstagramProfilePhoto(source: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(source) && source.length <= 90000) return source;
  const original = trustedPhotoUrl(String(source || ''));
  if (!original) return '';
  let url = original;
  try {
    for (let hop = 0; hop < 3; hop++) {
      const response = await fetcher(url.toString(), {redirect:'manual',signal:AbortSignal.timeout(3000)});
      if ([301,302,303,307,308].includes(response.status)) {
        const next = trustedPhotoUrl(new URL(response.headers.get('location') || '',url).toString());
        await response.body?.cancel();
        if (!next) return original.toString();
        url=next;continue;
      }
      const mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!response.ok || !['image/jpeg','image/png','image/webp'].includes(mime) || Number(response.headers.get('content-length') || 0)>MAX_PHOTO_BYTES || !response.body) {
        await response.body?.cancel();return original.toString();
      }
      const reader=response.body.getReader(), chunks:Uint8Array[]=[];let size=0;
      while (true) {
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;if(size>MAX_PHOTO_BYTES){await reader.cancel();return original.toString();}chunks.push(value);
      }
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const png=[137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value);
      const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
      if (!(mime==='image/jpeg'&&jpeg || mime==='image/png'&&png || mime==='image/webp'&&webp)) return original.toString();
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));
      return `data:${mime};base64,${btoa(binary)}`;
    }
  } catch { /* Keep the verified original URL when the cache request fails. */ }
  return original.toString();
}

