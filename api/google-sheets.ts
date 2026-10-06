import crypto from 'node:crypto';
import { normalizeAppUrl, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, authenticatedUser, authenticatedWorkspace, cleanEnvironment, upstreamFetch, UpstreamError } from '../src/server/supabaseConfig.js';

const env = (key: string) => cleanEnvironment(process.env[key]);
const site = () => normalizeAppUrl(env('APP_URL') || 'https://autoreplys.vercel.app');
const redirectUri = () => normalizeAppUrl(env('GOOGLE_SHEETS_REDIRECT_URI') || site() + '/api/google-sheets/callback');
const secret = () => env('GOOGLE_SHEETS_STATE_SECRET') || env('AUTH_SESSION_SECRET') || env('INSTAGRAM_APP_SECRET');
const sign = (value: string) => crypto.createHmac('sha256', secret()).update(value).digest('hex');
const bearer = (req: any) => String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
const headers = (token: string) => ({ apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token });
const cleanFields = (value: any): string[] => Array.from(new Set<string>((Array.isArray(value) ? value : []).map((x: any) => String(x || '').trim()).filter(Boolean))).slice(0, 30);
function cookieToken(req: any): string {
  const match = String(req.headers?.cookie || '').match(/(?:^|;\s*)gs_oauth_session=([^;]+)/);
  try { return match ? decodeURIComponent(match[1]) : ''; } catch { return ''; }
}
function validSignature(raw: string, signature: string): boolean {
  if (!raw || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(raw), 'hex'));
}
async function readConnection(uid: string, token: string) {
  const response = await upstreamFetch(`${SUPABASE_URL}/rest/v1/autoreply_documents?user_id=eq.${encodeURIComponent(uid)}&collection=eq.google_sheets_connections&id=eq.primary&select=data`, { headers: headers(token) }, 'Google Sheets connection storage');
  if (!response.ok) throw new Error('Could not load your Google Sheets connection. Please sign in again and retry.');
  const rows: any[] = await response.json();
  return rows?.[0]?.data || {};
}
async function saveConnection(uid: string, token: string, data: any) {
  const response = await upstreamFetch(`${SUPABASE_URL}/rest/v1/autoreply_documents?on_conflict=user_id,collection,id`, {
    method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: uid, collection: 'google_sheets_connections', id: 'primary', data }),
  }, 'Google Sheets connection storage');
  if (!response.ok) throw new Error('Could not save your Google Sheets connection. Please reconnect and retry.');
}
async function googleJson(url: string, init: RequestInit, service: string) {
  const response = await upstreamFetch(url, init, service, 10000);
  const data: any = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error_description || data?.error?.message || `${service} failed. Please reconnect and retry.`);
  return data;
}
async function accessToken(connection: any) {
  if (connection.access_token && Number(connection.expires_at || 0) > Date.now() + 60000) return String(connection.access_token);
  if (!connection.refresh_token) throw new Error('Google Sheets needs to be reconnected.');
  const data = await googleJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_SHEETS_CLIENT_ID'), client_secret: env('GOOGLE_SHEETS_CLIENT_SECRET'), refresh_token: connection.refresh_token, grant_type: 'refresh_token' }),
  }, 'Google authorization');
  if (!data?.access_token) throw new Error('Google Sheets needs to be reconnected.');
  return String(data.access_token);
}

export default async function handler(req: any, res: any) {
  const action = String(req.query?.action || '');
  let returnTo = req.query?.returnTo === 'integrations' ? 'integrations' : 'ai-sheets';
  const destination = () => returnTo === 'integrations' ? '/integrations?' : '/?resume=ai-sheets&';
  const fail = (message: string) => res.redirect(302, site() + destination() + 'sheets=error&message=' + encodeURIComponent(message));
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (!['connect', 'callback', 'status', 'create-sheet', 'append-lead'].includes(action)) return res.status(404).json({ ok: false, error: 'Unknown Google Sheets action.' });
    const method = ['create-sheet', 'append-lead'].includes(action) ? 'POST' : 'GET';
    if (req.method !== method) { res.setHeader('Allow', method); return res.status(405).json({ ok: false, error: 'Method Not Allowed' }); }
    if (['connect', 'callback'].includes(action) && (!env('GOOGLE_SHEETS_CLIENT_ID') || !env('GOOGLE_SHEETS_CLIENT_SECRET') || !secret())) {
      const message = 'Google Sheets is not configured on the server. Set the Google OAuth client ID, client secret and state secret.';
      return action === 'callback' ? fail(message) : res.status(503).json({ ok: false, code: 'SHEETS_NOT_CONFIGURED', error: message });
    }

    if (action === 'callback') {
      const [returnRaw,returnSignature] = String(req.query?.state || '').split('.');
      if (validSignature(returnRaw,returnSignature)) {try {const signed=JSON.parse(Buffer.from(returnRaw,'base64url').toString());returnTo=signed.returnTo==='integrations'?'integrations':'ai-sheets';}catch{}}
      if (req.query?.error) return fail(req.query.error === 'access_denied' ? 'Google authorization was cancelled. You can connect again.' : 'Google could not authorize the connection.');
      const code = String(req.query?.code || ''), [raw, signature] = String(req.query?.state || '').split('.');
      if (!code || !validSignature(raw, signature)) return fail('Invalid Google authorization response. Please connect again.');
      const state = JSON.parse(Buffer.from(raw, 'base64url').toString());
      returnTo = state.returnTo === 'integrations' ? 'integrations' : 'ai-sheets';
      const age = Date.now() - Number(state.at);
      if (!state.uid || !Number.isFinite(age) || age < 0 || age > 600000) return fail('Google authorization expired. Please connect again.');
      const token = cookieToken(req);
      const user = await authenticatedWorkspace({ headers: { authorization: 'Bearer ' + token, cookie:'autoreply_active_workspace='+encodeURIComponent(state.uid) } });
      if (!user?.id || user.id !== state.uid) return fail('Your login session expired. Sign in again and reconnect Google Sheets.');
      const tokens = await googleJson('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: env('GOOGLE_SHEETS_CLIENT_ID'), client_secret: env('GOOGLE_SHEETS_CLIENT_SECRET'), redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
      }, 'Google authorization');
      if (!tokens?.access_token) return fail('Google did not return an access token. Please reconnect.');
      // Profile scopes are explicitly requested; lack of profile data never loses a valid sheet connection.
      let profile: any = {};
      try { profile = await googleJson('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } }, 'Google profile'); } catch {}
      const previous = await readConnection(user.id, token);
      await saveConnection(user.id, token, { ...previous, connected: true, email: profile.email || previous.email || '', google_user_id: profile.id || previous.google_user_id || '', access_token: tokens.access_token, refresh_token: tokens.refresh_token || previous.refresh_token || '', expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000, scope: tokens.scope || '', updated_at: new Date().toISOString() });
      res.setHeader('Set-Cookie', ['gs_oauth_session=; Path=/api/google-sheets; HttpOnly; Secure; SameSite=Lax; Max-Age=0', `autoreply_active_workspace=${encodeURIComponent(user.id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`]);
      return res.redirect(302, site() + destination() + 'sheets=connected');
    }

    const user = await authenticatedWorkspace(req);
    if (!user) return res.status(401).json({ ok: false, code: 'SESSION_EXPIRED', error: 'Your login session expired. Sign in again before connecting Google Sheets.' });
    const token = bearer(req);
    if (action === 'connect') {
      res.setHeader('Set-Cookie', 'gs_oauth_session=' + encodeURIComponent(token) + '; Path=/api/google-sheets; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
      const raw = Buffer.from(JSON.stringify({ uid: user.id, ownerId:user.ownerId, returnTo, at: Date.now(), n: crypto.randomBytes(16).toString('hex') })).toString('base64url');
      const params = new URLSearchParams({ client_id: env('GOOGLE_SHEETS_CLIENT_ID'), redirect_uri: redirectUri(), response_type: 'code', access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true', scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file', state: raw + '.' + sign(raw) });
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
      return req.query?.format === 'json' ? res.status(200).json({ ok: true, url }) : res.redirect(302, url);
    }
    const connection = await readConnection(user.id, token);
    if (action === 'status') return res.status(200).json({ ok: true, connected: Boolean(connection.connected && (connection.refresh_token || connection.access_token)), email: connection.email || '', spreadsheetUrl: connection.spreadsheet_url || '', fields: cleanFields(connection.fields), updated_at: connection.updated_at || null });
    if (action === 'append-lead' && !connection.spreadsheet_id) return res.status(409).json({ ok: false, error: 'Create a Google Sheet first.' });
    const access = await accessToken(connection);
    const googleHeaders = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
    if (action === 'create-sheet') {
      const fields = cleanFields(req.body?.fields);
      if (!fields.length) return res.status(400).json({ ok: false, error: 'Add at least one data field.' });
      const title = String(req.body?.title || 'AutoReply AI Leads').trim().slice(0, 100) || 'AutoReply AI Leads';
      const sheet = await googleJson('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', headers: googleHeaders, body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: 'Leads' } }] }) }, 'Google Sheet creation');
      if (!sheet?.spreadsheetId) throw new Error('Google did not return a spreadsheet. Please retry.');
      await googleJson('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheet.spreadsheetId) + '/values/Leads!A1?valueInputOption=RAW', { method: 'PUT', headers: googleHeaders, body: JSON.stringify({ range: 'Leads!A1', majorDimension: 'ROWS', values: [[...fields, 'Instagram Username', 'Created At', 'Updated At']] }) }, 'Google Sheet columns');
      const next = { ...connection, spreadsheet_id: sheet.spreadsheetId, spreadsheet_url: sheet.spreadsheetUrl || 'https://docs.google.com/spreadsheets/d/' + sheet.spreadsheetId, sheet_name: 'Leads', fields, updated_at: new Date().toISOString() };
      await saveConnection(user.id, token, next);
      return res.status(200).json({ ok: true, spreadsheetId: sheet.spreadsheetId, spreadsheetUrl: next.spreadsheet_url, sheetName: 'Leads', fields });
    }
    const fields = cleanFields(connection.fields), now = new Date().toISOString();
    const values = [...fields.map(key => String(req.body?.data?.[key] ?? '')), String(req.body?.instagramUsername || ''), now, now];
    const result = await googleJson('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(connection.spreadsheet_id) + '/values/' + encodeURIComponent((connection.sheet_name || 'Leads') + '!A:ZZ') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', headers: googleHeaders, body: JSON.stringify({ values: [values] }) }, 'Google Sheet sync');
    return res.status(200).json({ ok: true, updatedRange: result?.updates?.updatedRange || '' });
  } catch (error: any) {
    const message = error?.message || 'Google Sheets connection failed. Please retry.';
    if (action === 'callback') return fail(message);
    return res.status(error?.status || (error instanceof UpstreamError ? 503 : 500)).json({ ok: false, code: error instanceof UpstreamError ? error.code : 'SHEETS_REQUEST_FAILED', error: message });
  }
}
