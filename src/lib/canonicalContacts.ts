import type {Contact} from '../types';
import {instagramHandle} from './contactIdentity';

/** Deduplicate only explicit scoped IDs/aliases inside the selected workspace.
 * Two customers sharing a handle, name or photo are never identity evidence. */
export function canonicalContacts(contacts: Contact[]): Contact[] {
  const parents=new Map<string,string>();
  const root=(key:string):string=>{const parent=parents.get(key);if(!parent){parents.set(key,key);return key;}if(parent===key)return key;const found=root(parent);parents.set(key,found);return found;};
  const keys=(c:Contact)=>[c.id,c.ig_user_id,...(c.ig_user_ids||[])].map(v=>String(v||'').trim()).filter(Boolean);
  for(const c of contacts){const ids=keys(c);for(const id of ids)parents.set(root(id),root(ids[0]));}
  const groups=new Map<string,Contact[]>();
  for(const c of contacts){const key=root(keys(c)[0]||'');if(!key)continue;groups.set(key,[...(groups.get(key)||[]),c]);}
  return [...groups.values()].map(group=>{
    if(group.length===1)return group[0];
    const oldest=[...group].sort((a,b)=>(Date.parse(a.first_interaction_at)||Infinity)-(Date.parse(b.first_interaction_at)||Infinity)||a.id.localeCompare(b.id));
    const latest=[...group].sort((a,b)=>(Date.parse(b.last_interaction_at)||0)-(Date.parse(a.last_interaction_at)||0));
    const profiles=[...group].sort((a,b)=>(Date.parse(b.profile_refreshed_at||'')||0)-(Date.parse(a.profile_refreshed_at||'')||0));
    const primary=oldest[0];
    return {...primary,ig_user_id:latest[0].ig_user_id||primary.ig_user_id,
      ig_user_ids:[...new Set(group.flatMap(keys))],
      ig_username:profiles.map(c=>instagramHandle(c.ig_username)).find(Boolean)||primary.ig_username,
      avatar_url:profiles.find(c=>c.avatar_url&&!c.avatar_url.includes('api.dicebear.com'))?.avatar_url||'',
      full_name:profiles.find(c=>c.full_name)?.full_name||primary.full_name,
      profile_refreshed_at:profiles[0].profile_refreshed_at,
      last_interaction_at:latest[0].last_interaction_at,
      tags:[...new Set(group.flatMap(c=>c.tags||[]))],
      interactions:{comments:Math.max(...group.map(c=>Number(c.interactions?.comments)||0)),dms:Math.max(...group.map(c=>Number(c.interactions?.dms)||0)),stories:Math.max(...group.map(c=>Number(c.interactions?.stories)||0))},
    };
  });
}
