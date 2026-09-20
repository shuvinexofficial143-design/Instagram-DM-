const SUPABASE_URL = 'https://dwgxmmftybxwpurgsxkx.supabase.co';
const GUEST_COOKIE = 'autoreply_guest_workspace';

function getRequestCookie(req: any, name: string): string {
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

function isWorkspaceId(value: string): boolean {
  return /^guest_[a-f0-9-]{16,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAuthenticatedUserId(req: any): Promise<string> {
  const authHeader = String(req?.headers?.authorization || '').trim();
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return '';

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: 'sb_publishable_gEZYQWqesZH1iFysqk5sHA_fTZLQQ08',
    },
  });
  if (!response.ok) return '';
  const user: any = await response.json().catch(() => null);
  return isWorkspaceId(String(user?.id || '')) ? String(user.id) : '';
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 18000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const authenticatedUid = await getAuthenticatedUserId(req);
    const workspaceId = authenticatedUid || getRequestCookie(req, GUEST_COOKIE);
    if (!isWorkspaceId(workspaceId)) {
      return res.status(401).json({
        ok: false,
        error: 'Connect Instagram first, then reopen the automation builder.',
      });
    }

    const requestedKind = String(req.query?.kind || 'comment');
    const kind = requestedKind === 'story' ? 'story' : 'comment';

    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/functions/v1/instagram-account-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_media',
          workspaceId,
          kind,
        }),
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      console.error(
        '[INSTAGRAM_MEDIA_LIST_FAILED]',
        response.status,
        payload?.error || payload
      );

      return res.status(response.status >= 400 ? response.status : 500).json({
        ok: false,
        error:
          payload?.error ||
          (kind === 'story'
            ? 'Could not load active Instagram stories.'
            : 'Could not load Instagram posts and reels.'),
      });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      ok: true,
      kind,
      username: payload?.username || '',
      items: Array.isArray(payload?.items) ? payload.items : [],
    });
  } catch (err: any) {
    console.error('[INSTAGRAM_MEDIA_API_FATAL]', err);
    return res.status(500).json({
      ok: false,
      error: err?.name === 'AbortError'
        ? 'Instagram media request timed out. Please try again.'
        : err?.message || 'Instagram media request failed.',
    });
  }
}
