import type { InboxMessage } from '../types';
import type { InboxPage, InboxCursor } from './inboxPaging';

/** Accurate, workspace-scoped fallback if the optimized inbox RPC is unavailable.
 * Call only with a COMPLETE RLS-authorized document collection: never display
 * truncated rows as an authoritative inbox or fabricate unread totals.
 */
export function pageRecoveredInbox(
  rows: Array<{ id: string; data: Partial<InboxMessage> | null; created_at?: string | null }>,
  sender = '',
  cursor: InboxCursor | null = null,
  limit = 50
): InboxPage {
  const all: InboxMessage[] = rows.map(row => ({
    ...(row.data || {}),
    id: row.id,
    from_ig_id: String(row.data?.from_ig_id || ''),
    from_username: String(row.data?.from_username || row.data?.from_ig_id || ''),
    from_avatar: String(row.data?.from_avatar || ''),
    message_text: String(row.data?.message_text || ''),
    timestamp: String(row.data?.timestamp || row.created_at || ''),
    direction: row.data?.direction === 'out' ? 'out' as const : 'in' as const,
  }));
  const unread_counts: Record<string, number> = {};
  for (const message of all) {
    if (message.direction !== 'in' || message.is_read) continue;
    const key = (message.from_ig_id || message.from_username).trim().toLowerCase();
    if (key) unread_counts[key] = (unread_counts[key] || 0) + 1;
  }
  const target = String(sender || '').trim().replace(/^@/, '').toLowerCase();
  const scoped = target ? all.filter(message =>
    message.from_ig_id.toLowerCase() === target ||
    message.from_username.replace(/^@/, '').toLowerCase() === target
  ) : all;
  const newerFirst = [...scoped].sort((a,b) =>
    (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0) ||
    b.id.localeCompare(a.id)
  );
  const eligible = cursor ? newerFirst.filter(message => {
    const time = Date.parse(message.timestamp) || 0;
    const boundary = Date.parse(cursor.time) || 0;
    return time < boundary || (time === boundary && message.id < cursor.id);
  }) : newerFirst;
  const count = Math.max(1, Math.min(100, Math.floor(limit) || 50));
  const messages = eligible.slice(0,count);
  const has_more = eligible.length > count;
  const last = messages.at(-1);
  return {
    messages,
    has_more,
    next_cursor: has_more && last ? { time: last.timestamp, id: last.id } : null,
    unread_counts,
  };
}
