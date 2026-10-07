import { enforceRateLimit, resolveAiIdentity } from '../../api/_auth.js';

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://dwgxmmftybxwpurgsxkx.supabase.co'
).replace(/\/+$/, '');


export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const identity = await resolveAiIdentity(req, false);
  if (!identity?.userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const rate = enforceRateLimit('usage:' + identity.userId, 60, 60_000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({ ok: false, error: 'Too many requests' });
  }

  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceRole) {
    return res.status(503).json({ ok: false, error: 'Usage service is not configured' });
  }

  const headers = {
    apikey: serviceRole,
    Authorization: 'Bearer ' + serviceRole,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/autoreply_billing_entitlement', {
      method: 'POST', headers, body: JSON.stringify({ p_workspace_id: identity.userId }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Could not verify workspace usage');
    const entitlement = await response.json();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ ok: true, ...entitlement, reset: 'monthly' });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Could not load usage',
    });
  }
}
