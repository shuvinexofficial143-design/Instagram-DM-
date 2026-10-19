import {adminOperationMethods,runAdminOperation,AdminOperationError} from './adminOperations.js';
import { createHmac } from 'node:crypto';
import { authenticatedUser, cleanEnvironment, SUPABASE_URL, upstreamFetch } from './supabaseConfig.js';

/** Server-only policy. An empty allowlist grants nobody access. */
export function configuredAdminEmails(): string[] {
  return [...new Set(cleanEnvironment(process.env.ADMIN_EMAILS).split(',')
    .map(value => cleanEnvironment(value).toLowerCase()).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}
export function isConfiguredAdmin(user: {email?: string; email_confirmed_at?: string; is_anonymous?: boolean} | null): boolean {
  return Boolean(user?.email_confirmed_at && !user.is_anonymous && configuredAdminEmails().includes(String(user.email || '').trim().toLowerCase()));
}

export function adminRelayHeaders(action: string, token: string): Record<string,string> {
  const secret = cleanEnvironment(process.env.INSTAGRAM_APP_SECRET);
  if (!secret) throw new Error('Administrator service is temporarily unavailable.');
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret).update(`${action}\n${token}\n${timestamp}`).digest('hex');
  return {'X-Autoreply-Admin-Time': timestamp, 'X-Autoreply-Admin-Signature': signature};
}

/** Reuses one existing Vercel function; the allowlist is never sent to clients. */
export default async function adminHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const action = String(req.query?.action || '');
    const method = adminOperationMethods[action] || (action === 'admin-update-plan' ? 'POST' : 'GET');
    if (!['admin-access','admin-overview','admin-update-plan'].includes(action) && !adminOperationMethods[action]) return res.status(400).json({ok:false,error:'Unknown administrator action.'});
    if (req.method !== method) { res.setHeader('Allow', method); return res.status(405).json({ok:false,error:'Method Not Allowed'}); }
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ok:false,isAdmin:false,error:'Sign in to continue.'});
    const isAdmin = isConfiguredAdmin(user);
    if (action === 'admin-access') return res.status(200).json({ok:true,isAdmin});
    if (!isAdmin) return res.status(403).json({ok:false,error:'Administrator access required.'});
    if (adminOperationMethods[action]) return res.status(200).json(await runAdminOperation(req,user));
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const edgeAction = action === 'admin-overview' ? 'admin_overview' : 'admin_update_plan';
    const response = await upstreamFetch(`${SUPABASE_URL}/functions/v1/instagram-account-store`, {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...adminRelayHeaders(edgeAction, token)},
      body:JSON.stringify({action:edgeAction, ...(edgeAction === 'admin_update_plan' ? {plan:req.body?.plan} : {})}),
    }, 'Administrator service', 20000);
    const payload = await response.json();
    return res.status(response.status).json(payload);
  } catch (error) {
    if(error instanceof AdminOperationError)return res.status(error.status).json({ok:false,error:error.message});
    return res.status(503).json({ok:false,error:'Administrator service is temporarily unavailable. Please try again.'});
  }
}
