import {adminOperationMethods,runAdminOperation,AdminOperationError} from './adminOperations.js';
import { createHmac } from 'node:crypto';
import { authenticatedUser, cleanEnvironment, SUPABASE_URL, upstreamFetch } from './supabaseConfig.js';
import { isConfiguredAdmin, synchronizeAdminPolicy } from './adminPolicy.js';
export { configuredAdminEmails, isConfiguredAdmin } from './adminPolicy.js';

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
    if (action === 'admin-access') {
      await synchronizeAdminPolicy();
      return res.status(200).json({ok:true,isAdmin});
    }
    if (!isAdmin) return res.status(403).json({ok:false,error:'Administrator access required.'});
    await synchronizeAdminPolicy();
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
