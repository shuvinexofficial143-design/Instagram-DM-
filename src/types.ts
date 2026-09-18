/**
 * AutoReply.io Platform Type Definitions
 */

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  plan: 'free' | 'pro' | 'agency' | 'trial';
  trial_expires_at: string; // ISO String
  created_at: string;
}

export interface InstagramAccount {
  id: string;
  ig_user_id: string;
  username: string;
  profile_pic_url: string;
  followers_count: number;
  access_token?: string;
  token_expires_at: string;
  connected_at: string;
  status: 'connected' | 'expired' | 'action_required';
}

export type TriggerType = 'dm' | 'comment' | 'story_reply' | 'dm_ai_conversation';

export interface TriggerConfig {
  all_or_keywords: 'all' | 'keywords' | 'ai_conversation';
  keywords: string[];
  smart_matching?: boolean;
  story_scope?: 'any_story' | 'specific_story';
  post_scope?: 'any_post' | 'specific_post';
  specific_post_url?: string;

  // Content targeting. New comment/story automations are bound to one
  // selected Instagram post, reel, or currently active story.
  media_scope?: 'all_media' | 'specific_media';
  selected_media_id?: string;
  selected_media_type?: 'POST' | 'REEL' | 'STORY' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string;
  selected_media_permalink?: string;
  selected_media_thumbnail_url?: string;
  selected_media_caption?: string;
}

export type ActionType = 'send_dm' | 'auto_like_comment' | 'reply_comment' | 'add_delay' | 'add_tag' | 'ai_chatbot';

export interface ActionButton {
  label: string;
  url: string;
}

export interface ActionItem {
  id: string;
  type: ActionType;
  message_text?: string;
  delay_seconds?: number;
  buttons?: ActionButton[];
  comment_reply_text?: string;
  tag_name?: string;
  ai_system_instruction?: string;
  ai_model?: 'gemini-1.5-flash' | 'gemini-2.5-flash' | 'gemini-3.6-flash' | 'gemini-3.1-flash-lite' | string;
}

export interface Automation {
  id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  actions: ActionItem[];
  status: 'active' | 'paused';
  stats: {
    runs: number;
    dms_sent: number;
    unique_users: number;
    open_rate: number; // percentage, e.g. 95.8
  };
  created_at: string;
  updated_at: string;
}

export interface ContactInteraction {
  comments: number;
  dms: number;
  stories: number;
}

export interface Contact {
  id: string;
  ig_username: string;
  ig_user_id: string;
  avatar_url?: string;
  first_interaction_at: string;
  last_interaction_at: string;
  interactions: ContactInteraction;
  tags?: string[];
  status?: 'lead' | 'converted' | 'contacted';
  is_test?: boolean;
}

export interface InboxMessage {
  id: string;
  from_ig_id: string;
  from_username: string;
  from_avatar?: string;
  message_text: string;
  direction: 'in' | 'out';
  is_automated?: boolean;
  automation_id?: string;
  timestamp: string;
  is_test?: boolean;
}

export interface MetaConfig {
  app_id: string;
  app_secret: string;
  webhook_verify_token: string;
  redirect_uri: string;
  is_verified?: boolean;
}

export interface WebhookLogEvent {
  id: string;
  timestamp: string;
  trigger_type: TriggerType | 'app_subscription';
  from_username: string;
  incoming_text: string;
  status: 'triggered' | 'ignored' | 'error' | 'success';
  is_test?: boolean;
  matched_automation_name?: string;
  response_sent?: string;
  webhook_received_at?: string;
  webhook_received_at_ms?: number;
  meta_event_timestamp?: number | string | null;
  meta_transit_delay_ms?: number | null;
  reply_api_call_start?: string;
  reply_api_call_start_ms?: number;
  reply_api_call_end?: string;
  reply_api_call_end_ms?: number;
  ig_api_duration_ms?: number;
  total_processing_duration_ms?: number;
  instance_uptime_seconds?: number;
  instance_is_warm?: boolean;
  timing_breakdown?: {
    meta_transit_delay_ms?: number | null;
    cache_lookup_duration_ms?: number;
    rule_matching_duration_ms?: number;
    reply_prep_duration_ms?: number;
    ai_gen_duration_ms?: number;
    ig_api_duration_ms?: number;
    total_pipeline_duration_ms?: number;
  };
  api_response?: any;
}

export interface SystemStats {
  open_rate: number;
  comment_replies: number;
  dms_sent: number;
  unique_contacts: number;
}

export interface GeminiApiKeyItem {
  id: string;
  key: string;
  label: string;
  status: 'active' | 'cooldown';
  cooldownUntil?: string | null;
  requestCount: number;
  errorCount: number;
  lastUsedAt?: string;
}

export interface PromptAnalysisResult {
  role_identity: {
    role: string;
    persona: string;
    target_audience: string;
  };
  behavior_tone: {
    tone: string;
    style_guidelines: string[];
    emoji_usage: string;
    reply_length_guideline: string;
  };
  primary_objectives: string[];
  guardrails_constraints: string[];
  knowledge_context: {
    business_name_or_type?: string;
    products_or_services: string[];
    faqs_or_policies: string[];
  };
  quality_score: number; // 0 - 100
  analysis_summary: string;
  suggestions: string[];
  enhanced_structured_prompt: string;
}

export interface AdminUserOverviewItem {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  first_login_at: string;
  last_login_at: string;
  last_active_at: string;
  role: 'admin' | 'user';
  instagram: {
    username?: string | null;
    connected_at?: string | null;
    status: 'active' | 'disconnected' | 'not_connected';
    followers_count?: number;
    profile_pic_url?: string | null;
  };
  stats: {
    total_dms_sent: number;
    total_automations: number;
    total_contacts: number;
    last_activity_time: string;
  };
}

export interface AdminOverviewStats {
  totalRegisteredUsers: number;
  totalConnectedInstagram: number;
  totalDmsSent: number;
  totalActiveAutomations: number;
}

export interface AdminOverviewResponse {
  success: boolean;
  isAdmin: boolean;
  requesterEmail: string;
  overviewStats?: AdminOverviewStats;
  users: AdminUserOverviewItem[];
  totalUsers: number;
  totalAutomatedDms: number;
  totalAutomations: number;
  configuredAdmins: string[];
  error?: string;
}

