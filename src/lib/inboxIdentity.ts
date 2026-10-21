import type { Contact, InboxMessage } from '../types';

export const identityKey = (value: unknown) => String(value || '').trim().replace(/^@/, '').toLowerCase();
const handle = (value: unknown) => {
  const key = identityKey(value);
  return /^[a-z0-9._]{1,30}$/.test(key) && !/^\d+$/.test(key) ? key : '';
};
export function contactKeys(contact: Contact): string[] {
  return [...new Set([contact.id, contact.ig_user_id, ...(contact.ig_user_ids || []), contact.ig_username].map(identityKey).filter(Boolean))];
}

/** Only explicit contact aliases join distinct sender IDs. Text/time similarity is never identity evidence. */
export function buildInboxThreads(messages: InboxMessage[], contacts: Contact[], ownUsername = '') {
  const parents = new Map<string, string>();
  const root = (key: string): string => {
    const parent = parents.get(key);
    if (!parent) { parents.set(key, key); return key; }
    if (parent === key) return key;
    const found = root(parent); parents.set(key, found); return found;
  };
  const own = identityKey(ownUsername);
  const realContacts = contacts.filter(c => !c.is_test && (!own || identityKey(c.ig_username) !== own));
  for (const contact of realContacts) {
    const ids = [contact.id, contact.ig_user_id, ...(contact.ig_user_ids || [])].map(identityKey).filter(Boolean);
    for (const id of ids) parents.set(root(id), root(ids[0]));
  }
  const byHandle = new Map<string, Set<string>>();
  for (const contact of realContacts) {
    const id = root(identityKey(contact.id || contact.ig_user_id));
    for (const name of contactKeys(contact)) byHandle.set(name, new Set([...(byHandle.get(name) || []), id]));
  }
  type Thread = { key: string; actionKey: string; label: string; username: string; aliases: string[]; contact?: Contact; messages: InboxMessage[] };
  const threads = new Map<string, Thread>();
  const ensure = (key: string) => {
    if (!threads.has(key)) threads.set(key, { key, actionKey: key, label: '', username: '', aliases: [key], messages: [] });
    return threads.get(key)!;
  };
  for (const contact of realContacts) {
    const thread = ensure(root(identityKey(contact.id || contact.ig_user_id)));
    thread.aliases.push(...contactKeys(contact));
    if (!thread.contact || handle(contact.ig_username)) thread.contact = contact;
  }
  for (const message of [...messages].sort((a,b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
    const name = identityKey(message.from_username), id = identityKey(message.from_ig_id);
    if (message.is_test || (own && name === own) || name.startsWith('user_') || name.includes('test_user')) continue;
    const matches = byHandle.get(name);
    // Legacy drafts have synthetic IDs; bind them only to an unambiguous known handle.
    const key = id && !id.startsWith('ig_usr_') ? root(id) : matches?.size === 1 ? [...matches][0] : name;
    if (!key) continue;
    const thread = ensure(key);
    thread.messages.push(message); thread.aliases.push(name, id);
    if (handle(name)) thread.username = handle(name);
  }
  return [...threads.values()].map(thread => {
    thread.username = handle(thread.contact?.ig_username) || thread.username;
    thread.actionKey = thread.contact?.ig_user_id || thread.messages.at(-1)?.from_ig_id || thread.username || thread.key;
    thread.aliases = [...new Set([...thread.aliases, thread.actionKey].filter(Boolean))];
    thread.label = thread.username ? '@' + thread.username : thread.contact?.full_name || 'Instagram user · ' + thread.actionKey.slice(-4);
    return thread;
  });
}
