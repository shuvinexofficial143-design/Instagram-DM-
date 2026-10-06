import type { Automation } from '../types';

export function relativeAutomationTime(value: string | undefined, now = Date.now()): string {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function automationSummary(auto: Automation) {
  const config = auto.trigger_config;
  const actions = Array.isArray(auto.actions) ? auto.actions : [];
  const isAi = auto.trigger_type === 'dm_ai_conversation' || config?.all_or_keywords === 'ai_conversation';
  const channel = auto.trigger_type === 'comment' ? 'Comments' : auto.trigger_type === 'story_reply' ? 'Story replies' : isAi ? 'AI DMs' : 'Direct messages';
  const keywords = config?.all_or_keywords === 'keywords' && Array.isArray(config.keywords) ? config.keywords.filter(Boolean) : [];
  const trigger = keywords.length ? `Matches ${keywords.map(word => `“${word}”`).join(', ')}` :
    auto.trigger_type === 'comment' ? 'Every comment' : auto.trigger_type === 'story_reply' ? 'Every story reply' : 'Every incoming message';
  const selected = Boolean(config?.selected_media_id || config?.specific_post_url || config?.post_scope === 'specific_post' || config?.story_scope === 'specific_story');
  const scope = auto.trigger_type === 'comment' ? selected ? 'Selected post or reel' : 'All posts & reels' :
    auto.trigger_type === 'story_reply' ? selected ? 'Selected story' : 'All stories' : 'Instagram inbox';
  const ai = actions.find(action => action.type === 'ai_chatbot');
  const dm = actions.find(action => action.type === 'send_dm');
  const publicReply = actions.find(action => action.type === 'reply_comment');
  const reply = isAi ? ai?.ai_system_instruction?.trim() || 'AI replies using your saved business instructions.' :
    dm?.message_text?.trim() || publicReply?.comment_reply_text?.trim() || publicReply?.message_text?.trim() || 'No reply message configured';
  const actionLabels = actions.map(action => {
    switch (action.type) {
      case 'ai_chatbot': return 'AI response';
      case 'send_dm': return isAi ? 'Send AI reply' : 'Send DM';
      case 'reply_comment': return 'Reply to comment';
      case 'auto_like_comment': return 'Like comment';
      case 'add_delay': return `Wait ${action.delay_seconds || 0}s`;
      case 'add_tag': return action.tag_name ? `Tag: ${action.tag_name}` : 'Add tag';
      default: return 'Action';
    }
  });
  return { isAi, channel, trigger, scope, reply, actionLabels, buttons: dm?.buttons || [] };
}

export function uniqueAutomationName(base: string, automations: { name: string }[]): string {
  const names = new Set(automations.map(auto => auto.name.trim().toLowerCase()));
  let candidate = base, suffix = 2;
  while (names.has(candidate.toLowerCase())) candidate = `${base} ${suffix++}`;
  return candidate;
}
export function matchesPreviewMessage(text: string, mode: string, keywords: string[]): boolean {
  return mode !== 'keywords' || keywords.some(keyword => keyword.trim() && text.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase()));
}
