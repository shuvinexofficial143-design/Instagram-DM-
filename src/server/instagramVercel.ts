import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export type StoredInstagramAccount = {
  id: string;
  ig_user_id: string;
  username: string;
  profile_pic_url?: string;
  followers_count?: number;
  access_token: string;
  token_expires_at?: string;
  connected_at: string;
  status: 'connected';
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mgibujqljahrfwlaafjy.supabase.co';
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GUEST_COOKIE = 'autoreply_guest_workspace';
const PROD_ORIGIN = 'https://autoreplys.vercel.app';

export const metaAppId = String(process.env.INSTAGRAM_APP_ID || '').trim();
export const metaAppSecret = String(process.env.INSTAGRAM_APP_SECRET || '').trim();
const OAUTH_STATE_SECRET = String(
  process.env.AUTH_SESSION_SECRET || process.env.INSTAGRAM_APP_SECRET || ''
).trim();

function getSupabaseAdmin() {
  if (!SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getInstagramRedirectUri(req: any): string {
  const configured = String(process.env.REDIRECT_URI || '').trim();
  const host = String(req?.headers?.host || '').trim().toLowerCase();

  if (host === 'autoreplys.vercel.app') {
    return `${PROD_ORIGIN}/api/auth/instagram/callback`;
  }

  if (configured && !configured.includes('localhost')) {
    return configured;
  }

  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  if (host) return `${proto}://${host}/api/auth/instagram/callback`;

  return `${PROD_ORIGIN}/api/auth/instagram/callback`;
}

export function getRequestCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

export function isGuestWorkspaceId(value: string): boolean {
  return /^guest_[a-f0-9-]{16,}$/i.test(value);
}

export function getGuestWorkspaceId(req: any): string {
  const value = getRequestCookie(req, GUEST_COOKIE);
  return isGuestWorkspaceId(value) ? value : '';
}

export function getOrCreateGuestWorkspaceId(req: any, res: any): string {
  const existing = getGuestWorkspaceId(req);
  if (existing) return existing;

  const workspaceId = `guest_${randomUUID()}`;
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${GUEST_COOKIE}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`
  );
  return workspaceId;
}

function stateSignature(workspaceId: string, ts: number): string {
  if (!OAUTH_STATE_SECRET) return '';
  return createHmac('sha256', OAUTH_STATE_SECRET)
    .update(`${workspaceId}:${ts}`)
    .digest('hex');
}

export function createOAuthState(workspaceId: string): string {
  const ts = Date.now();
  return JSON.stringify({
    workspaceId,
    ts,
    sig: stateSignature(workspaceId, ts),
  });
}

export function verifyOAuthState(rawState: unknown): string {
  if (!rawState || !OAUTH_STATE_SECRET) return '';

  let parsed: any = null;
  const raw = String(rawState);
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON.parse(decodeURIComponent(raw));
    } catch {
      return '';
    }
  }

  const workspaceId = String(parsed?.workspaceId || '');
  const ts = Number(parsed?.ts || 0);
  const sig = String(parsed?.sig || '');
  if (!isGuestWorkspaceId(workspaceId) || !Number.isFinite(ts) || !sig) return '';
  if (Math.abs(Date.now() - ts) > 15 * 60 * 1000) return '';

  const expected = stateSignature(workspaceId, ts);
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return '';
  } catch {
    return '';
  }

  return workspaceId;
}

export function sanitizeAccessToken(value: unknown): string {
  if (!value) return '';
  let token = String(value).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  try {
    let prev = '';
    while (token.includes('%') && token !== prev) {
      prev = token;
      token = decodeURIComponent(token);
    }
  } catch {}

  return token.trim();
}

export function toClientSafeAccount(account: StoredInstagramAccount | null) {
  if (!account) return null;
  const { access_token: _token, ...safe } = account;
  return safe;
}

export async function persistInstagramAccount(
  workspaceId: string,
  account: StoredInstagramAccount
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel');
  }

  const { error: tokenError } = await admin
    .from('autoreply_instagram_tokens')
    .upsert({ user_id: workspaceId, account }, { onConflict: 'user_id' });
  if (tokenError) throw tokenError;

  const { error: docError } = await admin
    .from('autoreply_documents')
    .upsert(
      {
        user_id: workspaceId,
        collection: 'instagram_account',
        id: 'primary',
        data: toClientSafeAccount(account),
      },
      { onConflict: 'user_id,collection,id' }
    );
  if (docError) throw docError;
}

export async function loadInstagramAccount(
  workspaceId: string
): Promise<StoredInstagramAccount | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from('autoreply_instagram_tokens')
    .select('account')
    .eq('user_id', workspaceId)
    .maybeSingle();

  if (error) throw error;
  const account = data?.account as StoredInstagramAccount | undefined;
  if (!account?.username || !account?.access_token) return null;
  account.access_token = sanitizeAccessToken(account.access_token);
  return account;
}

export async function deleteInstagramAccount(workspaceId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const [{ error: tokenError }, { error: docError }] = await Promise.all([
    admin.from('autoreply_instagram_tokens').delete().eq('user_id', workspaceId),
    admin
      .from('autoreply_documents')
      .delete()
      .eq('user_id', workspaceId)
      .eq('collection', 'instagram_account')
      .eq('id', 'primary'),
  ]);

  if (tokenError) throw tokenError;
  if (docError) throw docError;
}

export async function subscribeInstagramApp(
  igUserId: string,
  accessToken: string
): Promise<void> {
  const token = sanitizeAccessToken(accessToken);
  if (!token || !igUserId) return;

  const fields = 'messages,messaging_postbacks,message_deliveries,message_reads,comments,mentions';
  const urls = [
    `https://graph.instagram.com/v21.0/${encodeURIComponent(igUserId)}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
    `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) return;
    } catch {}
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
