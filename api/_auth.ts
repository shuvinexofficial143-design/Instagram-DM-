import { SUPABASE_URL, authenticatedUser } from '../src/server/supabaseConfig';

const ACCOUNT_STORE_URL = SUPABASE_URL + '/functions/v1/instagram-account-store';

type Identity = { key: string; userId?: string; workspaceId?: string };

const buckets = new Map<string, { count: number; resetAt: number }>();

export function readCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }
  return '';
}

export function enforceRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (existing.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

async function verifyBearer(req: any): Promise<Identity | null> {
  const auth = String(req?.headers?.authorization || '');
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const user = await authenticatedUser(req);
  if (!user?.id) return null;
  return { key: 'user:' + user.id, userId: String(user.id) };
}

async function verifyGuestWorkspace(req: any): Promise<Identity | null> {
  const workspaceId = readCookie(req, 'autoreply_guest_workspace');
  if (!/^guest_[a-f0-9-]{16,}$/i.test(workspaceId)) return null;
  const response = await fetch(ACCOUNT_STORE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'load', workspaceId }),
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.account) return null;
  return { key: 'workspace:' + workspaceId, workspaceId };
}

export async function resolveAiIdentity(req: any, allowGuest = false): Promise<Identity | null> {
  try {
    const user = await verifyBearer(req);
    if (user) return user;
  } catch {}
  if (!allowGuest) return null;
  try {
    return await verifyGuestWorkspace(req);
  } catch {
    return null;
  }
}
