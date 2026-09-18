const SUPABASE_URL = String(
  process.env.SUPABASE_URL || 'https://dwgxmmftybxwpurgsxkx.supabase.co'
).replace(/\/$/, '');
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
  return /^guest_[a-f0-9-]{16,}$/i.test(value);
}

function getGuestWorkspaceId(req: any): string {
  const value = getRequestCookie(req, GUEST_COOKIE);
  return isWorkspaceId(value) ? value : '';
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

async function callStore(action: 'load' | 'delete', workspaceId: string) {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/functions/v1/instagram-account-store`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, workspaceId }),
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    console.error(
      '[INSTAGRAM_ACCOUNT_EDGE_STORE_FAILED]',
      action,
      response.status,
      payload?.error || payload
    );
    throw new Error(payload?.error || `Instagram account ${action} failed`);
  }

  return payload;
}

// No Google/app login is required. The secure HttpOnly guest workspace cookie
// acts as the browser's private workspace capability.
export default async function handler(req: any, res: any) {
  try {
    const workspaceId = getGuestWorkspaceId(req);

    if (req.method === 'GET') {
      if (!workspaceId) {
        return res.status(200).json({ success: true, account: null });
      }

      const payload = await callStore('load', workspaceId);
      return res.status(200).json({
        success: true,
        account: payload?.account || null,
      });
    }

    if (req.method === 'POST') {
      if (!workspaceId) {
        return res.status(200).json({ success: true, account: null });
      }

      if (req.body && 'account' in req.body && req.body.account === null) {
        await callStore('delete', workspaceId);
        return res.status(200).json({ success: true, account: null });
      }

      return res.status(405).json({
        success: false,
        error: 'Manual Instagram connection is disabled. Use the official Meta OAuth flow.',
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method Not Allowed');
  } catch (err: any) {
    console.error('[INSTAGRAM_ACCOUNT_FATAL]', err);
    return res.status(500).json({
      success: false,
      account: null,
      error: err?.message || 'Instagram account request failed',
    });
  }
}
