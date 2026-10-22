import type {InboxMessage} from '../types';
export type InboxCursor={time:string;id:string};
export type InboxPage={messages:InboxMessage[];next_cursor:InboxCursor|null;has_more:boolean;unread_counts?:Record<string,number>};
export function mergeInboxMessages(current:InboxMessage[],incoming:InboxMessage[]):InboxMessage[]{
 const byId=new Map(current.map(message=>[message.id,message]));
 for(const message of incoming){const old=byId.get(message.id);if(!old||Date.parse(message.server_updated_at||message.timestamp)>=Date.parse(old.server_updated_at||old.timestamp))byId.set(message.id,message);}
 return [...byId.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)||b.id.localeCompare(a.id));
}
/** Export is explicitly requested; regular page loads always remain bounded. */
export async function loadFullInboxHistory(loadPage:(cursor:InboxCursor|null)=>Promise<InboxPage>,scopeIsCurrent:()=>boolean){
 let cursor:InboxCursor|null=null;let messages:InboxMessage[]=[];const cursors=new Set<string>();
 do{
  if(!scopeIsCurrent())throw Error('Account changed during export. Please start again for the selected account.');
  const page=await loadPage(cursor);
  if(!scopeIsCurrent())throw Error('Account changed during export. Please start again for the selected account.');
  messages=mergeInboxMessages(messages,page.messages);if(!page.has_more)break;
  if(!page.next_cursor)throw Error('Export cursor is unavailable.');
  cursor=page.next_cursor;const key=JSON.stringify(cursor);if(cursors.has(key))throw Error('Export cursor repeated. Please retry.');cursors.add(key);
 }while(cursor);
 return messages;
}
