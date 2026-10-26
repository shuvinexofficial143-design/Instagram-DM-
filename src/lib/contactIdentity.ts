import type { Contact, InboxMessage } from '../types';

export function instagramHandle(value: unknown): string {
  const name = String(value || '').trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(name) && !/^\d+$/.test(name) && !name.startsWith('user_') && name !== 'instagram_user' ? name : '';
}

/** Message identity is usable only when its scoped sender ID belongs to this contact. */
export function contactIdentity(contact: Contact, messages: InboxMessage[] = []) {
  const ids = new Set([contact.id, contact.ig_user_id, ...(contact.ig_user_ids || [])].filter(Boolean));
  const history = messages.filter(m => !m.is_test && ids.has(m.from_ig_id))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const username = instagramHandle(contact.ig_username) || history.map(m => instagramHandle(m.from_username)).find(Boolean) || '';
  const name = String(contact.full_name || '').trim();
  const fullName = name && !/^\d+$/.test(name) ? name : '';
  const avatar = (contact.avatar_url && !contact.avatar_url.includes('api.dicebear.com') ? contact.avatar_url : '') || history.find(m => m.from_avatar && !m.from_avatar.includes('api.dicebear.com'))?.from_avatar || '';
  return { username, fullName, avatar, label: username ? '@' + username : fullName || 'Instagram user · ' + String(contact.ig_user_id || contact.id).slice(-4) };
}

/** Re-fetch expired CDN photos as well as missing identity. The caller applies its retry TTL. */
export function needsContactProfileRefresh(contact: Contact & { profile_refreshed_at?: string }, now = Date.now()) {
  const checked = Date.parse(contact.profile_refreshed_at || '');
  return !instagramHandle(contact.ig_username) || !contact.avatar_url || contact.avatar_url.includes('api.dicebear.com') ||
    !Number.isFinite(checked) || now - checked >= 24 * 60 * 60_000;
}
