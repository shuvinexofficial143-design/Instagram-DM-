import { enforceRateLimit, resolveAiIdentity } from './_auth.js';

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://dwgxmmftybxwpurgsxkx.supabase.co'
).replace(/\/+$/, '');

const LIMITS: Record<string, { messages: number; ai: number }> = {
  free: { messages: 1500, ai: 1000 },
  starter: { messages: 7500, ai: 5000 },
  pro: { messages: 25000, ai: 15000 },
  business: { messages: 75000, ai: 40000 },
};

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
    const profileUrl =
      SUPABASE_URL +
      '/rest/v1/autoreply_profiles?user_id=eq.' +
      encodeURIComponent(identity.userId) +
      '&select=data&limit=1';

    const [profileResponse, usageResponse] = await Promise.all([
      fetch(profileUrl, { headers, cache: 'no-store' }),
      fetch(SUPABASE_URL + '/rest/v1/rpc/autoreply_get_usage', {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_user_id: identity.userId }),
      }),
    ]);

    const profiles: any[] = await profileResponse.json().catch(() => []);
    const usagePayload: any = await usageResponse.json().catch(() => null);

    if (!profileResponse.ok) {
      throw new Error('Could not load workspace plan');
    }

    const profile = profiles?.[0]?.data || {};
    const plan = String(profile?.plan || 'free').toLowerCase();
    const base = LIMITS[plan] || LIMITS.free;

    const expiry = Date.parse(String(profile?.carry_forward_expires_at || ''));
    const carryActive = Number.isFinite(expiry) && expiry > Date.now();
    const totalLimit = base.messages + (carryActive ? Number(profile?.carry_forward_messages || 0) : 0);
    const aiLimit = base.ai + (carryActive ? Number(profile?.carry_forward_ai_replies || 0) : 0);

    const usage = Array.isArray(usagePayload) ? usagePayload[0] || {} : usagePayload || {};
    const totalUsed = usageResponse.ok ? Number(usage?.total_messages || 0) : 0;
    const aiUsed = usageResponse.ok ? Number(usage?.ai_replies || 0) : 0;

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      ok: true,
      plan,
      totalUsed,
      aiUsed,
      totalLimit,
      aiLimit,
      reset: 'monthly',
      source: usageResponse.ok ? 'database' : 'profile_only',
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Could not load usage',
    });
  }
}
