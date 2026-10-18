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
// Never use the signed-in browser JWT to read OAuth secrets.
function privateCredentialsHeaders(){
  const key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!key)throw Object.assign(new Error('Google Sheets credentials are temporarily unavailable.'),{status:503});
  return {apikey:key,Authorization:'Bearer '+key};
}
async function readConnection(uid: string, _token: string) {
  const response = await upstreamFetch(
    SUPABASE_URL+'/rest/v1/autoreply_google_connections_secure?workspace_id=eq.'+encodeURIComponent(uid)+'&select=data',
    {headers:privateCredentialsHeaders()},'Private Google Sheets credential storage');
  if(!response.ok)throw new Error('Google Sheets credentials are temporarily unavailable.');
  const rows:any[]=await response.json();
  return rows?.[0]?.data || {};
}
async function saveConnection(uid: string, _token: string, data: any) {
  const response=await upstreamFetch(
    SUPABASE_URL+'/rest/v1/autoreply_google_connections_secure?on_conflict=workspace_id',
    {method:'POST',headers:{...privateCredentialsHeaders(),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
    body:JSON.stringify({workspace_id:uid,data,updated_at:new Date().toISOString()})},
    'Private Google Sheets credential storage');
  if(!response.ok)throw new Error('Google Sheets credentials could not be saved. Reconnect and retry.');
}
export function sheetRange(name:string, cells:string) {
  return "'" + name.replace(/'/g,"''") + "'!" + cells;
}
async function googleJson(url: string, init: RequestInit, service: string) {
  const response = await upstreamFetch(url, init, service, 10000);
  const data: any = await response.json().catch(() => null);
  if (!response.ok) {
    const oauthError = typeof data?.error === 'string' ? data.error : '';
    const reconnect = oauthError === 'invalid_grant' || response.status === 401;
    const message = reconnect ? 'Google authorization expired or was revoked. Reconnect Google Sheets to continue.'
      : data?.error_description || data?.error?.message || `${service} failed (HTTP ${response.status}). Please try again.`;
    throw Object.assign(new Error(message), {status:reconnect?409:response.status===429?429:response.status>=500?503:response.status,
      code:reconnect?'GOOGLE_RECONNECT_REQUIRED':'GOOGLE_REQUEST_FAILED',googleStatus:response.status});
  }
  return data;
}
async function accessToken(connection: any, uid = '') {
  if (connection.access_token && Number(connection.expires_at || 0) > Date.now() + 60000) return String(connection.access_token);
  if (!connection.refresh_token) throw Object.assign(new Error('Reconnect Google Sheets to continue.'),{status:409,code:'GOOGLE_RECONNECT_REQUIRED'});
  const data = await googleJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_SHEETS_CLIENT_ID'), client_secret: env('GOOGLE_SHEETS_CLIENT_SECRET'), refresh_token: connection.refresh_token, grant_type: 'refresh_token' }),
  }, 'Google authorization');
  if (!data?.access_token) throw Object.assign(new Error('Reconnect Google Sheets to continue.'),{status:409,code:'GOOGLE_RECONNECT_REQUIRED'});
  if(uid) await saveConnection(uid,'',{...connection,access_token:data.access_token,
    expires_at:Date.now()+Number(data.expires_in || 3600)*1000,updated_at:new Date().toISOString()});
  return String(data.access_token);
}

async function sheetDocument(uid:string,token:string,id:string) {
 const r=await upstreamFetch(`${SUPABASE_URL}/rest/v1/autoreply_documents?user_id=eq.${encodeURIComponent(uid)}&collection=eq.google_sheets_automations&id=eq.${encodeURIComponent(id)}&select=data`,{headers:headers(token)},'Automation sheet storage');
 if(!r.ok)throw new Error('Could not read this automation sheet.');return (await r.json())?.[0]?.data || {};
}
async function saveSheetDocument(uid:string,token:string,id:string,data:any) {
 const r=await upstreamFetch(`${SUPABASE_URL}/rest/v1/autoreply_documents?on_conflict=user_id,collection,id`,{method:'POST',headers:{...headers(token),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:uid,collection:'google_sheets_automations',id,data})},'Automation sheet storage');
 if(!r.ok)throw new Error('Could not save this automation sheet.');
}
export async function ensureAutomationSheet(uid:string,token:string,automationId:string,title:string,requestedFields:any) {
 if(!/^auto_[a-zA-Z0-9_-]{4,}$/.test(automationId))throw Object.assign(new Error('A valid automation identity is required to create its sheet.'),{status:400});
 const connection=await readConnection(uid,token);
 if(!connection.connected)return null;
 let cfg=await sheetDocument(uid,token,automationId);
 if(cfg.state==='ready' && cfg.spreadsheet_id)return cfg;
 const fields=cfg.fields?.length ? cleanFields(cfg.fields) : cleanFields(requestedFields);
 if(!fields.length)throw Object.assign(new Error('Add at least one data field.'),{status:400});
 const access=await accessToken(connection,uid), googleHeaders={Authorization:'Bearer '+access,'Content-Type':'application/json'};
 if(!cfg.spreadsheet_id){
  if(cfg.state==='creating')throw Object.assign(new Error('Sheet creation is already in progress or awaiting confirmation. Refresh this automation before retrying.'),{status:409});
  const reservation={state:'creating',fields,title,created_at:new Date().toISOString()};
  const claim=await upstreamFetch(`${SUPABASE_URL}/rest/v1/autoreply_documents`,{method:'POST',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify({user_id:uid,collection:'google_sheets_automations',id:automationId,data:reservation})},'Sheet creation reservation');
  if(!claim.ok){if(claim.status===409){const existing=await sheetDocument(uid,token,automationId);if(existing.state==='ready')return existing;throw Object.assign(new Error('Sheet creation is already in progress. Refresh before retrying.'),{status:409});}throw new Error('Could not reserve this automation sheet.');}
  // Never blindly repeat a create after an ambiguous network response.
  let sheet:any;
  try {
    sheet=await googleJson('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',headers:googleHeaders,body:JSON.stringify({properties:{title:title.slice(0,100)},sheets:[{properties:{title:'Leads',gridProperties:{columnCount:Math.max(26,fields.length+9)}}},{properties:{title:'Conversation history'}}]})},'Google Sheet creation');
  } catch(error:any) {
    // An explicit Google 4xx refused creation. Release only this new reservation;
    // ambiguous network/5xx outcomes remain reserved to prevent duplicate sheets.
    if(error.googleStatus>=400 && error.googleStatus<500 && error.googleStatus!==408) {
      await upstreamFetch(`${SUPABASE_URL}/rest/v1/autoreply_documents?user_id=eq.${encodeURIComponent(uid)}&collection=eq.google_sheets_automations&id=eq.${encodeURIComponent(automationId)}&data->>state=eq.creating`,
        {method:'DELETE',headers:headers(token)},'Rejected Sheet reservation cleanup');
    }
    throw error;
  }
  if(!sheet?.spreadsheetId)throw new Error('Google did not confirm the new spreadsheet.');
  cfg={...reservation,spreadsheet_id:sheet.spreadsheetId,spreadsheet_url:sheet.spreadsheetUrl || 'https://docs.google.com/spreadsheets/d/'+sheet.spreadsheetId,sheet_name:'Leads'};
  await saveSheetDocument(uid,token,automationId,cfg);
 }
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(cfg.spreadsheet_id);
 const metadata=await googleJson(base+'?fields=sheets.properties',{headers:googleHeaders},'Google Sheet tabs');
 const requests:any[]=[];
 for(const title of ['Leads','Conversation history']) {
  const tab=(metadata?.sheets||[]).find((tab:any)=>tab.properties?.title===title);
  const columns=title==='Leads'?Math.max(26,fields.length+9):26;
  if(!tab) requests.push({addSheet:{properties:{title,gridProperties:{columnCount:columns}}}});
  else if(Number(tab.properties?.gridProperties?.columnCount||26)<columns && tab.properties?.sheetId!=null)
    requests.push({updateSheetProperties:{properties:{sheetId:tab.properties.sheetId,gridProperties:{columnCount:columns}},fields:'gridProperties.columnCount'}});
 }
 if(requests.length) await googleJson(base+':batchUpdate',{method:'POST',headers:googleHeaders,body:JSON.stringify({requests})},'Google Sheet tabs');
 await googleJson(base+'/values/'+encodeURIComponent(sheetRange('Leads','A1'))+'?valueInputOption=RAW',{method:'PUT',headers:googleHeaders,body:JSON.stringify({values:[[...fields,'Instagram Username','Created At','Updated At','Instagram ID','Customer status','Priority','Reason','Summary','Next step']]})},'Google Sheet columns');
 await googleJson(base+'/values/'+encodeURIComponent(sheetRange('Conversation history','A1'))+'?valueInputOption=RAW',{method:'PUT',headers:googleHeaders,body:JSON.stringify({values:[['Event ID','Timestamp','Instagram ID','Instagram Username','Customer message','Reply']]})},'Conversation history columns');
 cfg={...cfg,fields,state:'ready',history_sheet:'Conversation history',updated_at:new Date().toISOString()};await saveSheetDocument(uid,token,automationId,cfg);return cfg;
}

export default async function handler(req: any, res: any) {
  const action = String(req.query?.action || '');
  let returnTo = req.query?.returnTo === 'integrations' ? 'integrations' : 'ai-sheets';
  const destination = () => returnTo === 'integrations' ? '/integrations?' : '/?resume=ai-sheets&';
  const fail = (message: string) => res.redirect(302, site() + destination() + 'sheets=error&message=' + encodeURIComponent(message));
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if(action==='runtime-token') {
      const supplied=String(req.headers?.['x-autoreply-oauth-secret'] || '');const expected=env('INSTAGRAM_APP_SECRET');
      if(req.method!=='POST' || !expected || supplied.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({ok:false,error:'Server authorization required.'});
      if(!req.body?.refreshToken && !req.body?.workspaceId)return res.status(400).json({ok:false,error:'Reconnect Google Sheets to refresh its authorization.'});
      const workspaceId=String(req.body?.workspaceId||'');
      const connection=workspaceId ? await readConnection(workspaceId,'') : {refresh_token:String(req.body.refreshToken)};
      const access=await accessToken(connection,workspaceId);
      return res.status(200).json({ok:true,accessToken:access});
    }
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
    const automationId=String(req.query?.automationId || req.body?.automationId || '');
    const bound=automationId ? await sheetDocument(user.id,token,automationId) : connection;
    if (action === 'status') {
      let connected=Boolean(connection.connected && (connection.refresh_token || connection.access_token));
      if(connected) {
        try { await accessToken(connection,user.id); }
        catch(error:any) {
          if(error.code!=='GOOGLE_RECONNECT_REQUIRED')throw error;
          return res.status(200).json({ok:true,connected:false,needsReconnect:true,error:error.message,code:error.code,email:connection.email||'',spreadsheetUrl:bound.spreadsheet_url||'',sheetReady:false,fields:cleanFields(bound.fields)});
        }
      }
      return res.status(200).json({ok:true,connected,email:connection.email||'',spreadsheetUrl:bound.spreadsheet_url||'',sheetReady:bound.state==='ready'&&Boolean(bound.spreadsheet_id),fields:cleanFields(bound.fields),updated_at:connection.updated_at||null});
    }
    if (action === 'append-lead' && !bound.spreadsheet_id) return res.status(409).json({ ok: false, error: 'Create a Google Sheet first.' });
    if (action === 'create-sheet') {
      const cfg=await ensureAutomationSheet(user.id,token,automationId,String(req.body?.title || 'AutoReply AI Leads').trim(),req.body?.fields);
      if(!cfg)return res.status(409).json({ok:false,error:'Connect your Google account first.'});
      return res.status(200).json({ok:true,spreadsheetId:cfg.spreadsheet_id,spreadsheetUrl:cfg.spreadsheet_url,sheetName:cfg.sheet_name,fields:cfg.fields});
    }

    const access = await accessToken(connection,user.id);
    const googleHeaders = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
    const fields = cleanFields(bound.fields), now = new Date().toISOString();
    const values = [...fields.map(key => String(req.body?.data?.[key] ?? '')), String(req.body?.instagramUsername || ''), now, now];
    const result = await googleJson('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(bound.spreadsheet_id) + '/values/' + encodeURIComponent(sheetRange(bound.sheet_name || 'Leads','A:ZZ')) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', headers: googleHeaders, body: JSON.stringify({ values: [values] }) }, 'Google Sheet sync');
    return res.status(200).json({ ok: true, updatedRange: result?.updates?.updatedRange || '' });
  } catch (error: any) {
    const message = error?.message || 'Google Sheets connection failed. Please retry.';
    if (action === 'callback') return fail(message);
    return res.status(error?.status || (error instanceof UpstreamError ? 503 : 500)).json({ ok: false, code: error?.code || (error instanceof UpstreamError ? error.code : 'SHEETS_REQUEST_FAILED'), error: message });
  }
}
