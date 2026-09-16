from pathlib import Path
import json, re, shutil

ROOT = Path(__file__).resolve().parents[1]
SUPABASE_URL = 'https://jnrftwolkhkuvpsbvbww.supabase.co'
SUPABASE_KEY = 'sb_publishable_Eae4_ClutOufXa5U2vo6MA_nhnOL8D7'

supabase_ts = r'''import { createClient, type User as SupabaseUser } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jnrftwolkhkuvpsbvbww.supabase.co';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Eae4_ClutOufXa5U2vo6MA_nhnOL8D7';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: Array<{ providerId: string; email: string | null }>;
  metadata: { creationTime?: string; lastSignInTime?: string };
  getIdToken: () => Promise<string>;
}

function adaptUser(user: SupabaseUser | null): User | null {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  return {
    uid: user.id,
    email: user.email || null,
    displayName: metadata.full_name || metadata.name || user.email?.split('@')[0] || null,
    photoURL: metadata.avatar_url || metadata.picture || null,
    emailVerified: Boolean(user.email_confirmed_at),
    isAnonymous: Boolean(user.is_anonymous),
    tenantId: null,
    providerData: (user.identities || []).map((identity) => ({
      providerId: identity.provider || '',
      email: (identity.identity_data as any)?.email || user.email || null,
    })),
    metadata: {
      creationTime: user.created_at,
      lastSignInTime: user.last_sign_in_at || undefined,
    },
    getIdToken: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session?.access_token) throw new Error('No active Supabase session');
      return data.session.access_token;
    },
  };
}

export const auth: { currentUser: User | null } = { currentUser: null };
export const googleProvider = { providerId: 'google' };
export const isSupabaseInitialized = Boolean(supabaseUrl && supabasePublishableKey);

async function beginGoogleOAuth(): Promise<{ user: User | null }> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (data.url && typeof window !== 'undefined') {
    window.location.assign(data.url);
    await new Promise<never>(() => {});
  }
  return { user: null };
}

export async function signInWithPopup(_auth?: unknown, _provider?: unknown) {
  return beginGoogleOAuth();
}

export async function signInWithRedirect(_auth?: unknown, _provider?: unknown) {
  return beginGoogleOAuth();
}

export async function getRedirectResult(_auth?: unknown) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = adaptUser(data.session?.user || null);
  auth.currentUser = user;
  return user ? { user } : null;
}

export function onAuthStateChanged(_auth: unknown, callback: (user: User | null) => void) {
  let active = true;
  supabase.auth.getSession().then(({ data }) => {
    if (!active) return;
    const user = adaptUser(data.session?.user || null);
    auth.currentUser = user;
    callback(user);
  });
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!active) return;
    const user = adaptUser(session?.user || null);
    auth.currentUser = user;
    callback(user);
  });
  return () => {
    active = false;
    listener.subscription.unsubscribe();
  };
}

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const user = adaptUser(data.user);
  auth.currentUser = user;
  return { user: user! };
}

export async function createUserWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
  if (!data.session) {
    const err: any = new Error('Account created. Please verify your email, then sign in.');
    err.code = 'auth/email-confirmation-required';
    throw err;
  }
  const user = adaptUser(data.user);
  auth.currentUser = user;
  return { user: user! };
}

export async function sendPasswordResetEmail(_auth: unknown, email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
  });
  if (error) throw error;
}

export async function signOut(_auth?: unknown) {
  const { error } = await supabase.auth.signOut();
  auth.currentUser = null;
  if (error) throw error;
}

export async function updateProfile(_user: User, profile: { displayName?: string | null; photoURL?: string | null }) {
  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...(profile.displayName !== undefined ? { full_name: profile.displayName } : {}),
      ...(profile.photoURL !== undefined ? { avatar_url: profile.photoURL } : {}),
    },
  });
  if (error) throw error;
  auth.currentUser = adaptUser(data.user);
}

export async function signInAnonymously(_auth?: unknown) {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  const user = adaptUser(data.user);
  auth.currentUser = user;
  return { user: user! };
}

async function assertOwnUser(userId: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== userId) {
    throw new Error('Authenticated user does not match requested workspace');
  }
}

async function fetchCollection<T extends { id?: string }>(userId: string, collectionName: string): Promise<T[]> {
  const { data, error } = await supabase
    .from('autoreply_documents')
    .select('id,data')
    .eq('user_id', userId)
    .eq('collection', collectionName);
  if (error) throw error;
  return (data || []).map((row: any) => ({ id: row.id, ...(row.data || {}) })) as T[];
}

export function subscribeToUserCollection<T extends { id?: string }>(
  userId: string,
  collectionName: string,
  onData: (data: T[]) => void,
  onError?: (err: Error) => void
) {
  let active = true;
  const load = async () => {
    try {
      if (!userId) return;
      await assertOwnUser(userId);
      const rows = await fetchCollection<T>(userId, collectionName);
      if (active) onData(rows);
    } catch (error: any) {
      if (active && onError) onError(error instanceof Error ? error : new Error(String(error)));
    }
  };
  void load();

  const channel = supabase
    .channel(`autoreply:${userId}:${collectionName}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'autoreply_documents',
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        const row = payload.new || payload.old;
        if (row?.collection === collectionName) void load();
      }
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function saveUserDocument<T extends { id: string }>(userId: string, collectionName: string, docData: T) {
  if (!userId || !docData?.id) return;
  await assertOwnUser(userId);
  const { id, ...data } = docData as any;
  const { error } = await supabase.from('autoreply_documents').upsert(
    { user_id: userId, collection: collectionName, id, data },
    { onConflict: 'user_id,collection,id' }
  );
  if (error) throw error;
}

export async function saveMultipleUserDocuments<T extends { id: string }>(userId: string, collectionName: string, docs: T[]) {
  if (!docs?.length) return;
  await assertOwnUser(userId);
  const rows = docs.filter((item) => item?.id).map((item: any) => {
    const { id, ...data } = item;
    return { user_id: userId, collection: collectionName, id, data };
  });
  const { error } = await supabase.from('autoreply_documents').upsert(rows, { onConflict: 'user_id,collection,id' });
  if (error) throw error;
}

export async function removeUserDocument(userId: string, collectionName: string, docId: string) {
  if (!userId || !docId) return;
  await assertOwnUser(userId);
  const { error } = await supabase
    .from('autoreply_documents')
    .delete()
    .eq('user_id', userId)
    .eq('collection', collectionName)
    .eq('id', docId);
  if (error) throw error;
}

export async function getUserDocument<T>(userId: string, collectionName: string, docId: string): Promise<T | null> {
  if (!userId || !docId) return null;
  await assertOwnUser(userId);
  const { data, error } = await supabase
    .from('autoreply_documents')
    .select('id,data')
    .eq('user_id', userId)
    .eq('collection', collectionName)
    .eq('id', docId)
    .maybeSingle();
  if (error) throw error;
  return data ? ({ id: data.id, ...(data.data as any || {}) } as T) : null;
}

export async function syncUserProfileDocument(userId: string, profileData: any) {
  if (!userId) return;
  await assertOwnUser(userId);
  const { error } = await supabase.from('autoreply_profiles').upsert(
    {
      user_id: userId,
      email: profileData.email || null,
      display_name: profileData.displayName || profileData.name || null,
      avatar_url: profileData.photoURL || profileData.avatar_url || null,
      role: profileData.role || 'user',
      created_at: profileData.created_at || new Date().toISOString(),
      last_login_at: profileData.last_login_at || new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

export async function checkAndMigrateExistingData(_userId: string, _userEmail?: string): Promise<boolean> {
  // Intentional: never copy another account's data into a new Supabase user.
  return false;
}
'''

(ROOT / 'src/lib/supabase.ts').write_text(supabase_ts, encoding='utf-8')

# Point every frontend import at the Supabase data/auth layer.
for path in (ROOT / 'src').rglob('*.tsx'):
    text = path.read_text(encoding='utf-8')
    text = text.replace("./lib/firebase", "./lib/supabase")
    text = text.replace("../lib/firebase", "../lib/supabase")
    text = text.replace("../../lib/firebase", "../../lib/supabase")
    text = text.replace('isFirebaseInitialized', 'isSupabaseInitialized')
    text = text.replace('firebase_redirect_pending', 'supabase_redirect_pending')
    if path.name == 'LoginPage.tsx':
        text = text.replace('Firebase Console', 'Supabase / Google OAuth settings')
        text = text.replace('Firebase.', 'Supabase.')
        text = text.replace('in Firebase Console', 'in the Google/Supabase OAuth configuration')
    path.write_text(text, encoding='utf-8')

# Also migrate any TS imports outside TSX.
for path in (ROOT / 'src').rglob('*.ts'):
    if path.name == 'supabase.ts':
        continue
    text = path.read_text(encoding='utf-8')
    text = text.replace("./lib/firebase", "./lib/supabase")
    text = text.replace("../lib/firebase", "../lib/supabase")
    text = text.replace("../../lib/firebase", "../../lib/supabase")
    text = text.replace('isFirebaseInitialized', 'isSupabaseInitialized')
    path.write_text(text, encoding='utf-8')

# Server authentication: verify Supabase JWTs instead of Firebase ID tokens.
bootstrap = f'''import {{ createHmac, randomBytes, timingSafeEqual }} from 'node:crypto';
import express from 'express';
import {{ createClient }} from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '{SUPABASE_URL}';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '{SUPABASE_KEY}';
const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {{
  auth: {{ persistSession: false, autoRefreshToken: false }},
}});

const sessionSecret = process.env.AUTH_SESSION_SECRET || process.env.INSTAGRAM_APP_SECRET || process.env.WEBHOOK_VERIFY_TOKEN || randomBytes(32).toString('hex');
const SESSION_COOKIE = 'autoreply_session';
const SESSION_TTL_SECONDS = 60 * 60;
const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const CLEAR_SESSION_HEADER = 'x-autoreply-clear-session';

function signSession(uid, email = '') {{
  const payload = Buffer.from(JSON.stringify({{ uid, email: typeof email === 'string' ? email.toLowerCase() : '', exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }}), 'utf8').toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${{payload}}.${{signature}}`;
}}

function verifySession(value) {{
  if (!value || !value.includes('.')) return null;
  const [payload, suppliedSignature] = value.split('.', 2);
  if (!payload || !suppliedSignature) return null;
  const expectedSignature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {{
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded?.uid || !decoded?.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return {{ uid: String(decoded.uid), email: typeof decoded.email === 'string' ? decoded.email.toLowerCase() : '' }};
  }} catch {{ return null; }}
}}

function readCookie(req, name) {{
  const raw = req.headers?.cookie || '';
  for (const pair of raw.split(';')) {{
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    if (key !== name) continue;
    try {{ return decodeURIComponent(pair.slice(index + 1).trim()); }} catch {{ return pair.slice(index + 1).trim(); }}
  }}
  return null;
}}

function isSecureRequest(req) {{
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  return Boolean(req.secure || forwardedProto === 'https');
}}

function writeSessionCookie(req, res, uid, email = '') {{
  const cookie = [`${{SESSION_COOKIE}}=${{encodeURIComponent(signSession(uid, email))}}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${{SESSION_TTL_SECONDS}}`, isSecureRequest(req) ? 'Secure' : ''].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}}

function clearSessionCookie(req, res) {{
  const cookie = [`${{SESSION_COOKIE}}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', isSecureRequest(req) ? 'Secure' : ''].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}}

async function resolveAuthenticatedUser(req, res) {{
  const authorization = String(req.headers?.authorization || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (bearer) {{
    try {{
      const {{ data, error }} = await authClient.auth.getUser(bearer);
      if (!error && data.user?.id) {{
        const email = typeof data.user.email === 'string' ? data.user.email.toLowerCase() : '';
        writeSessionCookie(req, res, data.user.id, email);
        return {{ uid: data.user.id, email }};
      }}
      if (error) console.warn('[SECURITY_INVALID_SUPABASE_TOKEN]', error.message);
    }} catch (error) {{ console.warn('[SECURITY_INVALID_SUPABASE_TOKEN]', error?.message || String(error)); }}
  }}
  const cookieSession = verifySession(readCookie(req, SESSION_COOKIE));
  if (cookieSession?.uid) return cookieSession;
  return null;
}}

function forceQueryValue(req, key, value) {{ try {{ if (req.query && typeof req.query === 'object') req.query[key] = value; }} catch {{}} }}
function forceBodyValue(req, key, value) {{ if (!req.body || typeof req.body !== 'object') req.body = {{}}; req.body[key] = value; }}

function classifyProtectedRoute(path) {{
  if (path === '/api/auth/instagram') return 'oauth-start';
  if (path === '/api/auth/instagram/callback') return 'oauth-callback';
  if (path === '/api/user/sync-profile') return 'profile-sync';
  if (path.startsWith('/api/admin/')) return 'admin';
  if (path === '/api/test-webhook' || path.startsWith('/api/instagram') || path.startsWith('/api/contacts/') || path.startsWith('/api/inbox/')) return 'user';
  return null;
}}

function buildSecurityMiddleware(mode) {{
  return async function autoreplySecurityMiddleware(req, res, next) {{
    if (String(req.headers?.[CLEAR_SESSION_HEADER] || '') === '1') {{ clearSessionCookie(req, res); return res.status(204).end(); }}
    const authenticated = await resolveAuthenticatedUser(req, res);
    if (!authenticated?.uid) return res.status(401).json({{ success: false, error: 'Authentication required' }});
    const {{ uid, email }} = authenticated;
    if (mode === 'oauth-callback') {{
      const incomingState = req.query?.state;
      let timestamp = 0;
      if (incomingState) {{ try {{ const decodedState = JSON.parse(decodeURIComponent(String(incomingState))); timestamp = Number(decodedState?.ts || 0); }} catch {{}} }}
      if (!timestamp || Math.abs(Date.now() - timestamp) > OAUTH_STATE_MAX_AGE_MS) return res.status(400).send('Invalid or expired Instagram OAuth state. Please reconnect from the dashboard.');
      forceQueryValue(req, 'state', encodeURIComponent(JSON.stringify({{ userId: uid, ts: timestamp }})));
      return next();
    }}
    forceQueryValue(req, 'userId', uid);
    forceBodyValue(req, 'userId', uid);
    if (mode === 'profile-sync') {{ forceBodyValue(req, 'uid', uid); forceBodyValue(req, 'id', uid); if (email) forceBodyValue(req, 'email', email); }}
    if (mode === 'admin') {{ forceQueryValue(req, 'email', email || '__no_verified_email__'); forceBodyValue(req, 'email', email || '__no_verified_email__'); }}
    return next();
  }};
}}

for (const methodName of ['get', 'post', 'put', 'patch', 'delete']) {{
  const original = express.application[methodName];
  if (typeof original !== 'function') continue;
  express.application[methodName] = function patchedRouteRegistration(path, ...handlers) {{
    if (handlers.length === 0 || typeof path !== 'string') return original.call(this, path, ...handlers);
    const mode = classifyProtectedRoute(path);
    if (!mode) return original.call(this, path, ...handlers);
    return original.call(this, path, buildSecurityMiddleware(mode), ...handlers);
  }};
}}

console.log('[SERVER_SECURITY_BOOTSTRAP] Supabase-authenticated user isolation enabled.');
'''
(ROOT / 'server-security-bootstrap.mjs').write_text(bootstrap, encoding='utf-8')

# Replace Firebase server imports with Supabase and inert legacy DB shims. Active persistence below uses Supabase.
server_path = ROOT / 'server.ts'
server = server_path.read_text(encoding='utf-8')
old_imports = """import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  Firestore,
} from 'firebase/firestore';
import { Agent, setGlobalDispatcher } from 'undici';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';"""
new_imports = """import { Agent, setGlobalDispatcher } from 'undici';
import { createClient } from '@supabase/supabase-js';"""
if old_imports not in server:
    raise RuntimeError('server Firebase import block not found')
server = server.replace(old_imports, new_imports, 1)

old_db = """// Firestore operations are handled securely on the client-side with authenticated user sessions (auth.currentUser).
// In Node server environment without user auth credentials, client-SDK Firestore writes are disabled to prevent unauthenticated PERMISSION_DENIED stream errors.
const db: Firestore | null = null;

let adminDb: ReturnType<typeof getAdminFirestore> | null = null;
try {
  // server-security-bootstrap.mjs initializes the Firebase Admin default app before server.ts.
  // Admin Firestore bypasses client rules and keeps OAuth tokens out of browser-readable paths.
  adminDb = getAdminFirestore();
} catch (err) {
  console.warn('[ADMIN_FIRESTORE_INIT_WARN] Server-only token persistence unavailable; using in-memory fallback.', err);
}"""
new_db = f"""// Legacy Firestore branches are intentionally disabled after the Supabase migration.
// These shims keep old diagnostic branches type-safe while all live user data uses Supabase.
const db: any = null;
const collection = (..._args: any[]): any => ({{}});
const doc = (..._args: any[]): any => ({{}});
const setDoc = async (..._args: any[]): Promise<void> => {{}};
const getDoc = async (..._args: any[]): Promise<any> => ({{ exists: () => false, data: () => null }});
const getDocs = async (..._args: any[]): Promise<any> => ({{ empty: true, size: 0, docs: [], forEach: (_fn: any) => {{}} }});
const updateDoc = async (..._args: any[]): Promise<void> => {{}};
const deleteDoc = async (..._args: any[]): Promise<void> => {{}};
const query = (...args: any[]): any => args[0];
const where = (..._args: any[]): any => ({{}});

const SERVER_SUPABASE_URL = process.env.SUPABASE_URL || '{SUPABASE_URL}';
const SERVER_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const serverSupabase = SERVER_SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SERVER_SUPABASE_URL, SERVER_SUPABASE_SERVICE_ROLE_KEY, {{ auth: {{ persistSession: false, autoRefreshToken: false }} }})
  : null;
if (!serverSupabase) {{
  console.warn('[SUPABASE_SERVICE_ROLE_MISSING] Instagram OAuth tokens will survive only in memory until SUPABASE_SERVICE_ROLE_KEY is configured.');
}}"""
if old_db not in server:
    raise RuntimeError('server db init block not found')
server = server.replace(old_db, new_db, 1)

old_persist = re.compile(r"  async function persistServerInstagramAccount\(userId: string, account: InstagramAccount\) \{.*?\n  \}\n\n  // Helper: Sanitize", re.S)
new_persist = r'''  async function persistServerInstagramAccount(userId: string, account: InstagramAccount) {
    const cleanAccount: InstagramAccount = {
      ...account,
      access_token: sanitizeAccessToken(account.access_token || ''),
    };
    userInstagramAccountsMemory.set(userId, cleanAccount);
    connectedInstagramAccountMemory = cleanAccount;

    if (!serverSupabase) return;
    try {
      const { error } = await serverSupabase
        .from('autoreply_instagram_tokens')
        .upsert({ user_id: userId, account: cleanAccount }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch (err) {
      console.warn('[SERVER_IG_ACCOUNT_PERSIST_WARN]', err);
    }
  }

  async function loadServerInstagramAccount(userId: string): Promise<InstagramAccount | null> {
    const cached = userInstagramAccountsMemory.get(userId);
    if (cached?.access_token) return cached;
    if (!serverSupabase) return cached || null;

    try {
      const { data, error } = await serverSupabase
        .from('autoreply_instagram_tokens')
        .select('account')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      const account = data?.account as InstagramAccount | undefined;
      if (!account?.username || !account?.access_token) return null;
      account.access_token = sanitizeAccessToken(account.access_token);
      userInstagramAccountsMemory.set(userId, account);
      connectedInstagramAccountMemory = account;
      return account;
    } catch (err) {
      console.warn('[SERVER_IG_ACCOUNT_LOAD_WARN]', err);
      return null;
    }
  }

  async function deleteServerInstagramAccount(userId: string) {
    userInstagramAccountsMemory.delete(userId);
    if (!serverSupabase) return;
    try {
      const { error } = await serverSupabase.from('autoreply_instagram_tokens').delete().eq('user_id', userId);
      if (error) throw error;
    } catch (err) {
      console.warn('[SERVER_IG_ACCOUNT_DELETE_WARN]', err);
    }
  }

  // Helper: Sanitize'''
server, n = old_persist.subn(new_persist, server, count=1)
if n != 1:
    raise RuntimeError(f'Instagram token persistence block replacement failed: {n}')
server = server.replace('Firestore', 'legacy database')
server_path.write_text(server, encoding='utf-8')

# Dependencies: Supabase in, Firebase out.
pkg_path = ROOT / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
deps = pkg.setdefault('dependencies', {})
deps['@supabase/supabase-js'] = '^2.57.4'
deps.pop('firebase', None)
deps.pop('firebase-admin', None)
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

# Environment documentation.
env_path = ROOT / '.env.example'
env = env_path.read_text(encoding='utf-8')
block = f'''\n# Supabase — primary auth + multi-tenant database\nVITE_SUPABASE_URL="{SUPABASE_URL}"\nVITE_SUPABASE_PUBLISHABLE_KEY="{SUPABASE_KEY}"\nSUPABASE_URL="{SUPABASE_URL}"\nSUPABASE_PUBLISHABLE_KEY="{SUPABASE_KEY}"\n# Server-only. Get from Supabase project API settings; NEVER prefix with VITE_.\nSUPABASE_SERVICE_ROLE_KEY=""\n'''
if 'VITE_SUPABASE_URL=' not in env:
    env += block
env_path.write_text(env, encoding='utf-8')

# Remove Firebase-specific project/config files now that runtime no longer uses them.
for rel in ['src/lib/firebase.ts', 'firebase-applet-config.json', 'firebase-blueprint.json', 'firebase.json', 'firestore.rules']:
    p = ROOT / rel
    if p.exists():
        p.unlink()
functions_dir = ROOT / 'functions'
if functions_dir.exists():
    shutil.rmtree(functions_dir)

print('Firebase -> Supabase migration patch applied.')
