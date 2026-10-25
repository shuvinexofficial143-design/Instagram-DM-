import type {InboxPage,InboxCursor} from './inboxPaging';
import type {InboxMessage} from '../types';
import { pageRecoveredInbox } from './inboxRecovery';
import { createClient, type User as SupabaseUser, type Session } from '@supabase/supabase-js';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || 'https://dwgxmmftybxwpurgsxkx.supabase.co').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gEZYQWqesZH1iFysqk5sHA_fTZLQQ08');

const PRODUCTION_SITE_URL = 'https://autoreplys.vercel.app';

function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
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
  // Supabase OAuth may return with the auth code in the URL before the SDK's
  // background exchange has finished. Explicitly exchange it so refresh/login
  // cannot fall back to the sign-in screen after Google consent.
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      const user = toCompatUser(exchanged.session?.user || exchanged.user || null, exchanged.session);
      auth.currentUser = user;
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      return user ? { user } : null;
    }
  }

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
  const base = getAuthRedirectUrl().replace(/\/+$/, '');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${base}/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  const next = toCompatUser(data.user, (await supabase.auth.getSession()).data.session);
  if (next) auth.currentUser = next;
  return next;
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
  if (!userId || !auth.currentUser?.uid) {
    throw new Error('Sign in before accessing a workspace. Ownership is enforced by Supabase RLS.');
  }
}

async function readCollection<T extends { id?: string }>(userId: string, collection: string): Promise<T[]> {
  ensureOwner(userId);
  if(collection==='inbox_messages')return (await fetchInboxPage(userId)).messages as unknown as T[];
  // Contacts and catalogs must be fully paginated; a partial 1,000-row
  // response must never be reported as a complete customer ledger.
  if(['catalogs','catalog_products','contacts'].includes(collection)){
    const rows:any[]=[];
    for(let offset=0;offset<100000;offset+=500){
      const {data,error}=await supabase.from('autoreply_documents')
        .select('id,data,created_at,updated_at').eq('user_id',userId).eq('collection',collection)
        .order('id',{ascending:true}).range(offset,offset+499);
      if(error)throw error;
      rows.push(...(data||[]));
      if((data||[]).length<500)return rows.map((row:any)=>({...row.data,id:row.id,created_at:row.data?.created_at||row.created_at,updated_at:row.data?.updated_at||row.updated_at} as T));
    }
    throw new Error('Workspace records exceed the safe 100,000-row read limit. Counts are unavailable rather than partial.');
  }
  const { data, error } = await supabase
    .from('autoreply_documents').select('id,data,created_at,updated_at').eq('user_id', userId).eq('collection', collection).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({ ...(row.data || {}), id: row.id,created_at:row.data?.created_at||row.created_at,updated_at:row.data?.updated_at||row.updated_at } as T));
}

/** A bounded RLS-protected page; cursor is (message_time,id), not an offset. */
export async function fetchInboxPage(userId:string,sender='',cursor:InboxCursor|null=null,limit=50):Promise<InboxPage>{
 ensureOwner(userId);
 const {data,error}=await supabase.rpc('autoreply_inbox_page',{p_workspace:userId,p_sender:sender,p_before_time:cursor?.time||null,p_before_id:cursor?.id||null,p_limit:limit});
 if(!error && data && Array.isArray(data.messages))return data as InboxPage;
 // Preserve the Inbox when a missing, stale or temporarily failing RPC rejects.
 // RLS still enforces access to the exact active workspace on every row.
 // A fallback must scan ALL matching documents to give truthful unread counts.
 console.warn('[INBOX_RPC_RECOVERY]',error?.code||'invalid_page');
 const rows:Array<{id:string;data:Partial<InboxMessage>|null;created_at?:string|null}>=[];
 for(let offset=0;offset<100000;offset+=500){
   const {data:part,error:readError}=await supabase.from('autoreply_documents')
     .select('id,data,created_at').eq('user_id',userId).eq('collection','inbox_messages')
     .order('id',{ascending:true}).range(offset,offset+499);
   if(readError)throw readError;
   rows.push(...(part||[]));
   if((part||[]).length<500)return pageRecoveredInbox(rows,sender,cursor,limit);
 }
 throw new Error('Inbox exceeds the safe recovery limit. No partial conversation totals were shown.');
}
export function subscribeToInbox(userId:string,onPage:(page:InboxPage)=>void,onChange:(message:InboxMessage|null,id:string)=>void,onError:(error:Error)=>void){
 let active=true,running=false,pending=false;
 const refresh=async()=>{if(running){pending=true;return;}running=true;do{pending=false;try{const page=await fetchInboxPage(userId);if(active)onPage(page);}catch(error){if(active)onError(error as Error);}}while(active&&pending);running=false;};
 void refresh();
 const channel=supabase.channel('inbox-pages:'+userId+':'+Math.random().toString(36).slice(2)).on('postgres_changes',{event:'*',schema:'public',table:'autoreply_documents',filter:'user_id=eq.'+userId},(payload:any)=>{
  const row=payload.eventType==='DELETE'?payload.old:payload.new;
  if(!active||row?.collection!=='inbox_messages')return;
  onChange(payload.eventType==='DELETE'?null:{...row.data,id:row.id,server_updated_at:row.updated_at},row.id);
  void refresh();
 }).subscribe();
 const poll=window.setInterval(()=>{if(!document.hidden)void refresh();},30000);
 const focus=()=>{if(!document.hidden)void refresh();};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
 return ()=>{active=false;window.clearInterval(poll);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);void supabase.removeChannel(channel);};
}

export function subscribeToUserCollection<T extends { id?: string }>(
  userId: string,
  subcollectionName: string,
  onData: (data: T[]) => void,
  onError?: (err: Error) => void
) {
  if (!userId || !auth.currentUser?.uid) return () => {};
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
  // Supabase Realtime is not guaranteed for every document collection.
  // Periodically reconcile true server records so counts keep updating even
  // when database replication misses events, a tab sleeps, or a socket drops.
  const shouldReconcile = ['inbox_messages','automations','contacts','webhook_events','webhook_logs','ai_thread_controls','workspace_notices'].includes(subcollectionName);
  const poll = shouldReconcile ? window.setInterval(() => {
    if(!document.hidden)void refresh();
  }, 30000) : null;
  let lastVisibilityRefresh = 0;
  const onVisibility = () => {
    if(!shouldReconcile||document.hidden||Date.now()-lastVisibilityRefresh<5000)return;
    lastVisibilityRefresh=Date.now();
    void refresh();
  };
  if(shouldReconcile){
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onVisibility);
  }
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
    if(poll!==null)window.clearInterval(poll);
    if(shouldReconcile){
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('focus',onVisibility);
    }
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

/** A single RLS-protected transaction includes messages not loaded in the browser. */
export async function removeWorkspaceConversations(userId: string, contactIds: string[], usernames: string[]) {
  ensureOwner(userId);
  const { data, error } = await supabase.rpc('autoreply_delete_conversations', {
    p_user_id: userId, p_contact_ids: contactIds, p_usernames: usernames,
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.usernames)) throw new Error('Conversations could not be deleted. Please retry.');
  return data as { ok: true; usernames: string[]; messagesDeleted: number; contactsDeleted: number };
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
