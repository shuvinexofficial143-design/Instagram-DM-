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

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const workspaceId = getCookie(req, GUEST_COOKIE);
  if (!isWorkspaceId(workspaceId)) {
    return res.status(200).json({
      ok: true,
      automations: [],
      contacts: [],
      inboxMessages: [],
      logs: [],
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/functions/v1/instagram-account-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_workspace_data',
          workspaceId,
        }),
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return res.status(response.status >= 400 ? response.status : 500).json({
        ok: false,
        error: payload?.error || 'Workspace data could not be loaded.',
      });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      ok: true,
      automations: Array.isArray(payload?.automations) ? payload.automations : [],
      contacts: Array.isArray(payload?.contacts) ? payload.contacts : [],
      inboxMessages: Array.isArray(payload?.inboxMessages) ? payload.inboxMessages : [],
      logs: Array.isArray(payload?.logs) ? payload.logs : [],
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error:
        err?.name === 'AbortError'
          ? 'Workspace data request timed out.'
          : err?.message || 'Workspace data request failed.',
    });
  }
}
