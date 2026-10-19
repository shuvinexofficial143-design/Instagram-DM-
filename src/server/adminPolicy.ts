import { createHash } from 'node:crypto';
import { cleanEnvironment, SUPABASE_URL, upstreamFetch } from './supabaseConfig.js';

/** ADMIN_EMAILS stays in server environment variables; only hashes reach private storage. */
export function configuredAdminEmails(): string[] {
  return [...new Set(cleanEnvironment(process.env.ADMIN_EMAILS).split(',')
    .map(value => cleanEnvironment(value).toLowerCase()).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}
export function isConfiguredAdmin(user: {email?: string; email_confirmed_at?: string; is_anonymous?: boolean} | null): boolean {
  return Boolean(user?.email_confirmed_at && !user.is_anonymous && configuredAdminEmails().includes(String(user.email || '').trim().toLowerCase()));
}

let synchronized = '';
let synchronizedAt = 0;
let pending: { key: string; promise: Promise<void> } | undefined;
export async function synchronizeAdminPolicy(): Promise<void> {
  // A preview deployment must never replace the production project's policy.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return;
  const hashes = configuredAdminEmails().map(email => createHash('sha256').update(email).digest('hex')).sort();
  const key = hashes.join(',');
  if (synchronized === key && synchronizedAt > Date.now() - 60_000) return;
  if (pending?.key === key) return pending.promise;
  const serviceKey = cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
  if (!serviceKey) throw new Error('Administrator allowance service is not configured.');
  const promise = (async () => {
    const response = await upstreamFetch(`${SUPABASE_URL}/rest/v1/rpc/autoreply_sync_admin_allowlist`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email_hashes: hashes }),
    }, 'Administrator allowance');
    if (!response.ok) throw new Error('Administrator allowances could not be verified.');
    synchronized = key; synchronizedAt = Date.now();
  })();
  pending = { key, promise };
  try { await promise; } finally { if (pending?.promise === promise) pending = undefined; }
}
