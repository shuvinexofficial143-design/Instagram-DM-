import { createHmac, randomUUID } from 'node:crypto';

const PROD_ORIGIN = 'https://autoreplys.vercel.app';
const GUEST_COOKIE = 'autoreply_guest_workspace';

function cleanEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

function getRedirectUri(req: any): string {
  const configured = cleanEnv('REDIRECT_URI');
  const host = String(req?.headers?.host || '').trim().toLowerCase();
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();

  if (host === 'autoreplys.vercel.app') {
    return `${PROD_ORIGIN}/api/auth/instagram/callback`;
  }

  if (configured && !configured.includes('localhost')) {
    return configured;
  }

  if (host) {
    return `${proto}://${host}/api/auth/instagram/callback`;
  }

  return `${PROD_ORIGIN}/api/auth/instagram/callback`;
}

function getCookie(req: any, name: string): string {
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

function getOrCreateWorkspaceId(req: any, res: any): string {
  const existing = getCookie(req, GUEST_COOKIE);
  if (isWorkspaceId(existing)) return existing;

  const workspaceId = `guest_${randomUUID()}`;
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${GUEST_COOKIE}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`
  );

  return workspaceId;
}

function createState(workspaceId: string, secret: string): string {
  const ts = Date.now();
  const sig = createHmac('sha256', secret)
    .update(`${workspaceId}:${ts}`)
    .digest('hex');

  return JSON.stringify({ workspaceId, ts, sig });
}

export default function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        ok: false,
        code: 'METHOD_NOT_ALLOWED',
        error: 'Method Not Allowed',
      });
    }

    const appId = cleanEnv('INSTAGRAM_APP_ID');
    const appSecret = cleanEnv('INSTAGRAM_APP_SECRET');
    const stateSecret = cleanEnv('AUTH_SESSION_SECRET') || appSecret;

    if (!appId) {
      return res.status(503).json({
        ok: false,
        code: 'INSTAGRAM_APP_ID_MISSING',
        error: 'INSTAGRAM_APP_ID is missing in Vercel Environment Variables.',
      });
    }

    if (!appSecret) {
      return res.status(503).json({
        ok: false,
        code: 'INSTAGRAM_APP_SECRET_MISSING',
        error: 'INSTAGRAM_APP_SECRET is missing in Vercel Environment Variables.',
      });
    }

    if (!stateSecret) {
      return res.status(503).json({
        ok: false,
        code: 'OAUTH_STATE_SECRET_MISSING',
        error: 'AUTH_SESSION_SECRET is missing in Vercel Environment Variables.',
      });
    }

    const workspaceId = getOrCreateWorkspaceId(req, res);
    const redirectUri = getRedirectUri(req);
    const state = createState(workspaceId, stateSecret);

    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
      'instagram_business_content_publish',
    ].join(',');

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      state,
    });

    return res.status(200).json({
      ok: true,
      url: `https://www.instagram.com/oauth/authorize?${params.toString()}`,
      redirectUri,
    });
  } catch (error: any) {
    console.error('[INSTAGRAM_OAUTH_START_FAILED]', error);
    return res.status(500).json({
      ok: false,
      code: 'OAUTH_START_FAILED',
      error: error?.message || String(error) || 'Instagram OAuth could not start.',
    });
  }
}
