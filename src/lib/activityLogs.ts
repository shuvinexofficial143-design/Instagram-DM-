import type { WebhookLogEvent } from '../types';
export function normalizeActivityLog(row: any): WebhookLogEvent {
  const rawStatus = String(row.status || '');
  return { ...row, id: row.id, timestamp: row.timestamp || row.updated_at || row.created_at || '',
    status: rawStatus === 'sent' ? 'success' : rawStatus === 'failed' ? 'error' : ['success','error','triggered','ignored'].includes(rawStatus) ? rawStatus : 'ignored',
    trigger_type: row.trigger_type || 'dm', from_username: row.from_username || row.sender_id || '',
    incoming_text: row.incoming_text || '', matched_automation_name: row.matched_automation_name || row.automation_name,
    response_sent: row.response_sent || row.reply_text || '',
    total_processing_duration_ms: row.total_processing_duration_ms ?? row.total_ms ?? row.totalMs,
    reason: row.reason || '', error_message: row.error_message || row.send_error || row.error || row.ai_error || (Array.isArray(row.errors) ? row.errors.join('; ') : '') };
}
