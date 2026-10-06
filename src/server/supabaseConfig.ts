/** One configuration for server auth, storage and webhook delivery. */
export function cleanEnvironment(value: unknown): string {
  const text = String(value || '').trim();
  return ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
    ? text.slice(1, -1).trim() : text;
}

/** OAuth providers require an absolute URL, including the scheme. */
export function normalizeAppUrl(value: unknown): string {
  const raw = cleanEnvironment(value);
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('App and OAuth callback URLs must be absolute HTTP(S) URLs.');
  }
  return url.toString().replace(/\/+$/, '');
}

export function normalizeSupabaseUrl(value: unknown): string {
  const raw = cleanEnvironment(value);
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('SUPABASE_URL must be a project URL without credentials or query parameters.');
  }
  if (url.pathname !== '/' && !/^\/(?:rest|auth|functions)\/v1\/?$/.test(url.pathname)) {
    throw new Error('SUPABASE_URL must point to the project root.');
  }
  return url.origin;
}

export const SUPABASE_URL = normalizeSupabaseUrl(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://dwgxmmftybxwpurgsxkx.supabase.co'
);
export const SUPABASE_PUBLISHABLE_KEY = cleanEnvironment(
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_gEZYQWqesZH1iFysqk5sHA_fTZLQQ08'
);

export class UpstreamError extends Error {
  code = 'UPSTREAM_UNAVAILABLE';
  constructor(public service: string) {
    super(`${service} could not be reached. Please try again shortly.`);
  }
}

/** Retry only safe reads, never token exchanges or message/row writes. */
export async function upstreamFetch(url: string, init: RequestInit = {}, service = 'Connection service', timeoutMs = 8000): Promise<Response> {
  const attempts = (init.method || 'GET').toUpperCase() === 'GET' ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        continue;
      }
      return response;
    } catch (error: any) {
      if (attempt + 1 === attempts) {
        // Never log tokens, URLs containing credentials, or raw upstream bodies.
        console.error('[UPSTREAM_CONNECTION_FAILED]', { service, cause: error?.cause?.code || error?.name || 'network_error' });
        throw new UpstreamError(service);
      }
    }
  }
  throw new UpstreamError(service);
}

export async function authenticatedUser(req: any): Promise<{ id: string } | null> {
  const header = String(req.headers?.authorization || '').trim();
  const token = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) return null;
  const response = await upstreamFetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  }, 'Workspace authentication');
  if ([401, 403].includes(response.status)) return null;
  if (!response.ok) throw new UpstreamError('Workspace authentication');
  const user: any = await response.json();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(user?.id || '')) ? user : null;
}

/** Validate the selected Instagram workspace against memberships using the user's RLS session. */
export async function authenticatedWorkspace(req: any): Promise<{id:string;ownerId:string}|null> {
  const user = await authenticatedUser(req);
  if (!user) return null;
  const explicit = String(req.headers?.['x-autoreply-workspace'] || '').trim();
  const raw = String(req.headers?.cookie || '').match(/(?:^|;\s*)autoreply_active_workspace=([^;]+)/)?.[1];
  let selected = explicit; try { if(!selected) selected = raw ? decodeURIComponent(raw) : ''; } catch {}
  if (!selected || selected === user.id) return { id:user.id, ownerId:user.id };
  if (!/^[a-f0-9-]{36}$/i.test(selected)) throw new Error('Invalid selected Instagram account.');
  const url = `${SUPABASE_URL}/rest/v1/autoreply_instagram_memberships?workspace_id=eq.${encodeURIComponent(selected)}&owner_user_id=eq.${encodeURIComponent(user.id)}&select=workspace_id`;
  const response = await upstreamFetch(url, { headers: { apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:String(req.headers.authorization) } }, 'Instagram account ownership');
  if (!response.ok) throw new UpstreamError('Instagram account ownership');
  const rows = await response.json();
  // A stale cookie from another login never grants access to that user's workspace.
  if (explicit && !rows?.[0]?.workspace_id) throw Object.assign(new Error('This Instagram account does not belong to your login.'), {status:403});
  return { id:rows?.[0]?.workspace_id || user.id, ownerId:user.id };
}
