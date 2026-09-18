const SUPABASE_URL = String(
  process.env.SUPABASE_URL || 'https://mgibujqljahrfwlaafjy.supabase.co'
).replace(/\/$/, '');
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GUEST_COOKIE = 'autoreply_guest_workspace';

type StoredInstagramAccount = {
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

function supabaseHeaders(extra: Record<string, string> = {}) {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel');
  }

  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function toClientSafeAccount(account: StoredInstagramAccount | null) {
  if (!account) return null;
  const safe = { ...account } as any;
  delete safe.access_token;
  return safe;
}

async function loadInstagramAccount(
  workspaceId: string
): Promise<StoredInstagramAccount | null> {
  const params = new URLSearchParams({
    user_id: `eq.${workspaceId}`,
    select: 'account',
    limit: '1',
  });

  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/autoreply_instagram_tokens?${params.toString()}`,
    {
      headers: supabaseHeaders(),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    console.error('[INSTAGRAM_ACCOUNT_REST_LOAD_FAILED]', response.status, body);
    throw new Error('Could not load Instagram account');
  }

  const rows: any[] = await response.json();
  const account = rows?.[0]?.account as StoredInstagramAccount | undefined;
  if (!account?.username || !account?.access_token) return null;
  return account;
}

async function deleteInstagramAccount(workspaceId: string): Promise<void> {
  const tokenParams = new URLSearchParams({
    user_id: `eq.${workspaceId}`,
  });
  const documentParams = new URLSearchParams({
    user_id: `eq.${workspaceId}`,
    collection: 'eq.instagram_account',
    id: 'eq.primary',
  });

  const [tokenRes, docRes] = await Promise.all([
    fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/autoreply_instagram_tokens?${tokenParams.toString()}`,
      {
        method: 'DELETE',
        headers: supabaseHeaders(),
      }
    ),
    fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/autoreply_documents?${documentParams.toString()}`,
      {
        method: 'DELETE',
        headers: supabaseHeaders(),
      }
    ),
  ]);

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error('[INSTAGRAM_ACCOUNT_REST_DELETE_TOKEN_FAILED]', tokenRes.status, body);
    throw new Error('Could not delete Instagram token');
  }

  if (!docRes.ok) {
    const body = await docRes.text();
    console.error('[INSTAGRAM_ACCOUNT_REST_DELETE_DOC_FAILED]', docRes.status, body);
    throw new Error('Could not delete Instagram account document');
  }
}

// No Google/app login is required. The secure HttpOnly guest workspace cookie
// isolates the connected Instagram account for this browser.
export default async function handler(req: any, res: any) {
  try {
    const workspaceId = getGuestWorkspaceId(req);

    if (req.method === 'GET') {
      if (!workspaceId) {
        return res.status(200).json({ success: true, account: null });
      }

      const account = await loadInstagramAccount(workspaceId);
      return res.status(200).json({
        success: true,
        account: toClientSafeAccount(account),
      });
    }

    if (req.method === 'POST') {
      if (!workspaceId) {
        return res.status(200).json({ success: true, account: null });
      }

      if (req.body && 'account' in req.body && req.body.account === null) {
        await deleteInstagramAccount(workspaceId);
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
