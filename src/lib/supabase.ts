import { createClient, type User as SupabaseUser, type Session } from '@supabase/supabase-js';

const viteEnv = ((import.meta as any).env || {}) as Record<string, string | undefined>;
const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL || 'https://mgibujqljahrfwlaafjy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bFT19NWnOrUiIssSZU2Aew_lRXxOYBA';

const PRODUCTION_SITE_URL = 'https://autoreplys.vercel.app';

function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;

    // Production must never inherit a stale localhost URL from deployment env.
    if (hostname === 'autoreplys.vercel.app') return PRODUCTION_SITE_URL;

    // Keep Vercel preview deployments on their own HTTPS origin when explicitly used.
    if (hostname.endsWith('.vercel.app')) return origin.replace(/\/+$/, '');
  }

  // OAuth for this deployed app always returns to the live site.
  return PRODUCTION_SITE_URL;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'autoreply_supabase_auth',
  },
});

export type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: Array<{ providerId: string; email: string | null }>;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
  getIdToken: () => Promise<string>;
  __supabaseUser: SupabaseUser;
};

function toCompatUser(user: SupabaseUser | null, session?: Session | null): User | null {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
    : user.app_metadata?.provider
      ? [user.app_metadata.provider]
      : [];

  return {
    uid: user.id,
    email: user.email || null,
    displayName: meta.full_name || meta.name || user.email?.split('@')[0] || null,
    photoURL: meta.avatar_url || meta.picture || null,
    emailVerified: Boolean(user.email_confirmed_at),
    isAnonymous: Boolean(user.is_anonymous),
    tenantId: null,
    providerData: providers.map((provider: string) => ({
      providerId: provider,
      email: user.email || null,
    })),
    metadata: {
      creationTime: user.created_at,
      lastSignInTime: user.last_sign_in_at || undefined,
    },
    getIdToken: async () => {
      if (session?.access_token) return session.access_token;
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session?.access_token) throw new Error('No active Supabase session');
      return data.session.access_token;
    },
    __supabaseUser: user,
  };
}

export const auth: { currentUser: User | null } = { currentUser: null };
export const googleProvider = { providerId: 'google' } as const;
export const db = supabase;
export const isSupabaseInitialized = true;
export const browserLocalPersistence = 'local';

export async function setPersistence() {
  return true;
}

export async function signInWithPopup(_auth: typeof auth, _provider: typeof googleProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectUrl(),
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (data.url) window.location.assign(data.url);
  return { user: auth.currentUser };
}

export async function signInWithRedirect(_auth: typeof auth, _provider: typeof googleProvider) {
  return signInWithPopup(_auth, _provider);
}

export async function getRedirectResult(_auth: typeof auth) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = toCompatUser(data.session?.user || null, data.session);
  auth.currentUser = user;
  return user ? { user } : null;
}

export async function signInWithEmailAndPassword(_auth: typeof auth, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const user = toCompatUser(data.user, data.session);
  auth.currentUser = user;
  return { user: user! };
}

export async function createUserWithEmailAndPassword(_auth: typeof auth, email: string, password: string) {
  const cleanName = email.split('@')[0] || 'Account';
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: { full_name: cleanName, name: cleanName },
    },
  });
  if (error) throw error;

  if (!data.session) {
    auth.currentUser = null;
    const confirmationError: any = new Error(
      'Account created. Please confirm your email, then sign in.'
    );
    confirmationError.code = 'auth/email-confirmation-required';
    throw confirmationError;
  }

  const user = toCompatUser(data.user, data.session);
  auth.currentUser = user;
  if (!user) throw new Error('Account was created, but no authenticated user was returned.');
  return { user };
}

export async function sendPasswordResetEmail(_auth: typeof auth, email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectUrl(),
  });
  if (error) throw error;
}

export async function signOut(_auth?: typeof auth) {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  auth.currentUser = null;
}

export function onAuthStateChanged(_auth: typeof auth, callback: (user: User | null) => void) {
  let alive = true;

  void supabase.auth.getSession().then(({ data }) => {
    if (!alive) return;
    const user = toCompatUser(data.session?.user || null, data.session);
    auth.currentUser = user;
    callback(user);
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!alive) return;
    const user = toCompatUser(session?.user || null, session);
    auth.currentUser = user;
    callback(user);
  });

  return () => {
    alive = false;
    data.subscription.unsubscribe();
  };
}

export async function updateProfile(user: User, profile: { displayName?: string; photoURL?: string }) {
  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...(profile.displayName !== undefined ? { full_name: profile.displayName } : {}),
      ...(profile.photoURL !== undefined ? { avatar_url: profile.photoURL } : {}),
    },
  });
  if (error) throw error;
  const next = toCompatUser(data.user, (await supabase.auth.getSession()).data.session);
  if (next) auth.currentUser = next;
}

export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  const user = toCompatUser(data.user, data.session);
  auth.currentUser = user;
  return { user: user! };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface DataStoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: { userId?: string | null; email?: string | null };
}

export function handleDataStoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: DataStoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { userId: auth.currentUser?.uid, email: auth.currentUser?.email },
    operationType,
    path,
  };
  console.error('Supabase data error:', errInfo);
  throw new Error(JSON.stringify(errInfo));
}

function ensureOwner(userId: string) {
  if (!userId || auth.currentUser?.uid !== userId) {
    throw new Error('Authenticated user does not own this workspace');
  }
}

async function readCollection<T extends { id?: string }>(userId: string, collection: string): Promise<T[]> {
  ensureOwner(userId);
  const { data, error } = await supabase
    .from('autoreply_documents')
    .select('id,data')
    .eq('user_id', userId)
    .eq('collection', collection)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({ id: row.id, ...(row.data || {}) } as T));
}

export function subscribeToUserCollection<T extends { id?: string }>(
  userId: string,
  subcollectionName: string,
  onData: (data: T[]) => void,
  onError?: (err: Error) => void
) {
  if (!userId || auth.currentUser?.uid !== userId) return () => {};
  let active = true;

  const refresh = async () => {
    try {
      const rows = await readCollection<T>(userId, subcollectionName);
      if (active) onData(rows);
    } catch (error) {
      if (active && onError) onError(error as Error);
    }
  };

  void refresh();
  const channel = supabase
    .channel(`autoreply:${userId}:${subcollectionName}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'autoreply_documents',
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        const collection = payload?.new?.collection || payload?.old?.collection;
        if (collection === subcollectionName) void refresh();
      }
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function saveUserDocument<T extends { id: string }>(
  userId: string,
  subcollectionName: string,
  docData: T
) {
  if (!docData?.id) return;
  ensureOwner(userId);
  const { id, ...data } = docData as any;
  const { error } = await supabase.from('autoreply_documents').upsert(
    {
      user_id: userId,
      collection: subcollectionName,
      id,
      data,
    },
    { onConflict: 'user_id,collection,id' }
  );
  if (error) throw error;
}

export async function syncUserProfileDocument(userId: string, profileData: any) {
  ensureOwner(userId);
  const { error } = await supabase.from('autoreply_profiles').upsert(
    {
      user_id: userId,
      email: profileData.email || auth.currentUser?.email || null,
      display_name: profileData.displayName || profileData.name || auth.currentUser?.displayName || null,
      avatar_url: profileData.photoURL || profileData.avatar_url || auth.currentUser?.photoURL || null,
      role: profileData.role || 'user',
      last_login_at: profileData.last_login_at || new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

export async function saveMultipleUserDocuments<T extends { id: string }>(
  userId: string,
  subcollectionName: string,
  docs: T[]
) {
  for (const item of docs || []) await saveUserDocument(userId, subcollectionName, item);
}

export async function removeUserDocument(userId: string, subcollectionName: string, docId: string) {
  ensureOwner(userId);
  const { error } = await supabase
    .from('autoreply_documents')
    .delete()
    .eq('user_id', userId)
    .eq('collection', subcollectionName)
    .eq('id', docId);
  if (error) throw error;
}

export async function getUserDocument<T>(
  userId: string,
  subcollectionName: string,
  docId: string
): Promise<T | null> {
  ensureOwner(userId);
  const { data, error } = await supabase
    .from('autoreply_documents')
    .select('id,data')
    .eq('user_id', userId)
    .eq('collection', subcollectionName)
    .eq('id', docId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, ...((data as any).data || {}) } as T;
}

export async function checkAndMigrateExistingData(_userId: string, _userEmail?: string): Promise<boolean> {
  return false;
}
