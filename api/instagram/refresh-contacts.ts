const SUPABASE_URL = 'https://dwgxmmftybxwpurgsxkx.supabase.co';
const GUEST_COOKIE = 'autoreply_guest_workspace';

function getCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;

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
  return /^guest_[a-f0-9-]{16,}$/i.test(value);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const workspaceId = getCookie(req, GUEST_COOKIE);
  if (!isWorkspaceId(workspaceId)) {
    return res.status(401).json({ ok: false, error: 'Workspace not found.' });
  }

  try {
    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/functions/v1/instagram-account-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh_contact_profiles',
          workspaceId,
        }),
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return res.status(response.status >= 400 ? response.status : 500).json({
        ok: false,
        error: payload?.error || 'Instagram contact profiles could not be refreshed.',
      });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      ok: true,
      refreshed: Number(payload?.refreshed || 0),
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error:
        err?.name === 'AbortError'
          ? 'Instagram profile refresh timed out.'
          : err?.message || 'Instagram profile refresh failed.',
    });
  }
}
