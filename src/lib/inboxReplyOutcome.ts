import type { InboxMessage, WebhookLogEvent } from '../types';
const key = (value: string) => String(value || '').trim().replace(/^@/, '').toLowerCase();

export function latestReplyFailureFor(messages: InboxMessage[], aliases: string[], events: WebhookLogEvent[]) {
  const inbound = messages.filter(m => m.direction === 'in').sort((a,b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  if (!inbound || messages.some(m => m.direction === 'out' && m.delivery_status !== 'failed' && m.delivery_status !== 'sending' && Date.parse(m.timestamp) >= Date.parse(inbound.timestamp))) return undefined;
  const failures = events.filter(e => (e.status === 'error' || e.status === 'ignored') && aliases.map(key).includes(key(e.from_username)) &&
    Date.parse(e.timestamp) >= Date.parse(inbound.timestamp) &&
    (e.id === inbound.id || e.id === 'event:' + inbound.id || (!e.id.startsWith('event:') && e.incoming_text === inbound.message_text)));
  return failures.sort((a,b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
}

export function replyFailureDescription(event?: WebhookLogEvent): string {
  if (!event) return '';
  const reason = event.reason || '';
  if (/human_handoff|thread_ai_paused|ai_paused/.test(reason)) return 'Human Takeover is active. Select Resume AI to allow future replies.';
  if (/conversation_(control|context)_changed|outbound.*changed|newer_outbound/.test(reason)) return 'Conversation changed while AI was preparing the reply. The stale reply was stopped.';
  if (reason === 'instagram_disconnected') return 'The Instagram account is disconnected. Reconnect it in Settings.';
  if (reason === 'automation_paused_or_deleted') return 'The automation was paused or deleted before the reply could be sent.';
  if (/no matching active automation|no_matching_automation/i.test(reason)) return 'No active automation matched this message. Check the AI Conversation rule.';
  if (/limit_reached/.test(reason)) return 'Reply allowance was reached. Check billing or continue manually.';
  if (reason === 'quota_check_failed') return 'Reply allowance could not be verified. Check backend Activity.';
  if (reason === 'inbox_save_failed') return 'The incoming message could not be saved. Check database permissions in backend Activity.';
  if (event.status !== 'error') return '';
  const detail = String(event.error_message || reason || 'No error detail was recorded.')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:access_token|api_key|apikey|token|secret)=)[^\s&]+/gi, '$1[redacted]')
    .slice(0, 280);
  return 'Reply failed: ' + detail;
}
