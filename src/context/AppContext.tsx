import React, { createContext, useContext, useState, useEffect, useMemo, useRef, startTransition } from 'react';
import { reconcileAutomationRecords } from '../lib/automationState';
import { connectedInstagramAccount } from '../lib/instagramConnection';
import { normalizeActivityLog } from '../lib/activityLogs';
import {
  UserProfile,
  InstagramAccount,
  Automation,
  Contact,
  InboxMessage,
  WebhookLogEvent,
  TriggerType,
} from '../types';
import {
  auth,
  signOut,
  onAuthStateChanged,
  getRedirectResult,
  signInAnonymously,
  User,
  subscribeToUserCollection,
  saveUserDocument,
  removeUserDocument,
  syncUserProfileDocument,
  checkAndMigrateExistingData,
  isSupabaseInitialized,
} from '../lib/supabase';

export type ActiveTab = 'home' | 'customer-data' | 'analytics' | 'automations' | 'activity' | 'knowledge' | 'catalog' | 'lead-forms' | 'contacts' | 'crm' | 'inbox' | 'integrations' | 'billing' | 'checkout' | 'contact' | 'refunds' | 'settings' | 'about' | 'help' | 'faq' | 'billing-help' | 'privacy' | 'terms' | 'admin';

const TAB_PATHS: Record<ActiveTab, string> = {
  home: '/',
  'customer-data': '/customer-data',
  analytics: '/analytics',
  automations: '/automations',
  activity: '/activity',
  knowledge: '/knowledge',
  catalog: '/catalog',
  'lead-forms': '/lead-forms',
  contacts: '/contacts',
  crm: '/crm',
  inbox: '/inbox',
  integrations: '/integrations',
  billing: '/billing',
  checkout: '/billing/checkout',
  contact: '/contact',
  refunds: '/refunds',
  settings: '/settings',
  about: '/about',
  help: '/help',
  faq: '/help/faq',
  'billing-help': '/help/billing',
  privacy: '/privacy',
  terms: '/terms',
  admin: '/admin',
};

const tabFromPath = (pathname: string): ActiveTab => {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  const entry = (Object.entries(TAB_PATHS) as Array<[ActiveTab, string]>).find(([, path]) => path === clean);
  return entry?.[0] || 'home';
};

interface AppContextType {
  user: UserProfile;
  firebaseUser: User | null;
  setFirebaseUser: (u: User | null) => void;
  authLoading: boolean;
  workspaceHydrating: boolean;
  workspaceDataLoading: boolean;
  workspaceDataError: boolean;
  isGuestMode: boolean;
  setIsGuestMode: (val: boolean) => void;
  logout: () => Promise<void>;
  
  instagramAccount: InstagramAccount | null;
  instagramAccounts: {workspaceId:string;account:InstagramAccount}[];
  workspaceId: string;
  accountSwitching: boolean;
  accountError: string;
  refreshInstagramAccounts: (followCookie?:boolean) => Promise<void>;
  switchInstagramAccount: (id:string) => Promise<void>;
  startInstagramConnection: (mode?:'add'|'reconnect') => void;
  instagramConnectMode: 'add'|'reconnect';
  automations: Automation[];
  contacts: Contact[];
  inboxMessages: InboxMessage[];
  webhookLogs: WebhookLogEvent[];
  pausedAiUsers: string[];
  isAdmin: boolean;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  
  isConnectModalOpen: boolean;
  setIsConnectModalOpen: (open: boolean) => void;
  isRenewModalOpen: boolean;
  setIsRenewModalOpen: (open: boolean) => void;

  // Automation Builder State
  isBuilderOpen: boolean;
  setIsBuilderOpen: (open: boolean) => void;
  editingAutomation: Automation | null;
  setEditingAutomation: (auto: Automation | null) => void;

  // AI Conversion Toggle (Human Takeover)
  isAiPausedForUser: (username: string) => boolean;
  toggleAiForUser: (username: string) => Promise<void>;
  setAiPausedForUser: (username: string, paused: boolean) => Promise<void>;

  // Actions
  createAutomation: (newAuto: Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'stats'> & {id?:string}) => void;
  updateAutomation: (id: string, updates: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
  toggleAutomationStatus: (id: string) => Promise<void>;
  isAutomationSaving: (id: string) => boolean;
  
  // Simulator & Webhook Engine
  simulateWebhookEvent: (triggerType: TriggerType, username: string, incomingText: string) => Promise<WebhookLogEvent>;
  triggerWebhookSimulation: (params: { trigger_type: TriggerType; username: string; text: string }) => Promise<WebhookLogEvent>;
  
  // Inbox Actions
  sendManualReply: (fromUsername: string, text: string) => void;
  markInboxThreadRead: (username: string) => Promise<void>;
  markInboxThreadUnread: (username: string) => Promise<void>;
  
  // Deletion Actions (Permanent DB Removal)
  deleteContact: (contactId: string, username?: string) => Promise<void>;
  deleteContactsBulk: (contactIds: string[], usernames?: string[]) => Promise<void>;
  deleteInboxThread: (username: string) => Promise<void>;
  deleteInboxThreadsBulk: (usernames: string[]) => Promise<void>;

  // Channel & Config Actions
  reauthorizeChannel: () => void;
  disconnectChannel: () => Promise<void>;
  connectChannel: (account: Partial<InstagramAccount> | string) => Promise<void>;
  renewPlan: (plan?: 'free' | 'starter' | 'pro' | 'business') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const MOCK_HANDLES = ['sarah_creator', 'marcus.builds', 'elena_art', 'david_growth_hacks', 'chloe_agency', 'alexrivera.design'];

const isTestOrMockContact = (item: Contact): boolean => {
  if (!item) return true;
  if (item.is_test === true) return true;
  const uname = (item.ig_username || item.ig_user_id || '').toLowerCase();
  if (!uname) return true;
  if (MOCK_HANDLES.includes(uname)) return true;
  if (
    uname.includes('940977') ||
    uname.startsWith('user_940977') ||
    uname === 'webhook_test_user' ||
    uname.includes('test_user')
  ) {
    return true;
  }
  return false;
};

const filterOutMockContacts = (items: Contact[]): Contact[] => {
  return (items || []).filter((item) => !isTestOrMockContact(item));
};

const isTestOrMockMessage = (item: InboxMessage): boolean => {
  if (!item) return true;
  if (item.is_test === true) return true;
  const uname = (item.from_username || item.from_ig_id || '').toLowerCase();
  if (!uname) return true;
  if (MOCK_HANDLES.includes(uname)) return true;
  if (
    uname.includes('940977') ||
    uname.startsWith('user_940977') ||
    uname === 'webhook_test_user' ||
    uname.includes('test_user')
  ) {
    return true;
  }
  return false;
};

const filterOutMockMessages = (items: InboxMessage[]): InboxMessage[] => {
  return (items || []).filter((item) => !isTestOrMockMessage(item));
};

const sanitizeAutomationRecord = (auto: any): Automation => ({
  ...auto,
  id: auto?.id || `auto_${Date.now()}`,
  name: auto?.name || 'Untitled Automation',
  trigger_type: auto?.trigger_type || 'dm',
  trigger_config: {
    ...(auto?.trigger_config || {}),
    all_or_keywords: auto?.trigger_config?.all_or_keywords || 'keywords',
    keywords: Array.isArray(auto?.trigger_config?.keywords) ? auto.trigger_config.keywords : [],
    smart_matching: auto?.trigger_config?.smart_matching ?? true,
    story_scope: auto?.trigger_config?.story_scope || 'any_story',
    post_scope: auto?.trigger_config?.post_scope || 'any_post',
    specific_post_url: auto?.trigger_config?.specific_post_url || '',
  },
  actions: Array.isArray(auto?.actions) ? auto.actions : [],
  status: auto?.status === 'active' ? 'active' : 'paused',
  stats: {
    runs: Number(auto?.stats?.runs) || 0,
    dms_sent: Number(auto?.stats?.dms_sent) || 0,
    unique_users: Number(auto?.stats?.unique_users) || 0,
    open_rate: -1, // No verified Meta open rate: never claim 98% or 100%.
  },
  created_at: auto?.created_at || '',
  updated_at: auto?.updated_at || '',
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  // Do not display Not Connected or zero metrics while account / inbox data
  // has not completed its first authoritative load.
  const [workspaceHydrating,setWorkspaceHydrating]=useState(true);
  const [workspaceDataLoading,setWorkspaceDataLoading]=useState(true);
  const [workspaceDataError,setWorkspaceDataError]=useState(false);
  const [isGuestMode, setIsGuestModeState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('autoreply_guest_mode') === 'true';
    } catch {
      return false;
    }
  });

  const setIsGuestMode = (val: boolean) => {
    setIsGuestModeState(val);
    try {
      if (val) {
        localStorage.setItem('autoreply_guest_mode', 'true');
      } else {
        localStorage.removeItem('autoreply_guest_mode');
      }
    } catch {}
  };

  const [user, setUser] = useState<UserProfile>({
    id: '',
    name: 'Account',
    email: '',
    avatar_url: '',
    plan: 'free',
    trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });

  const [workspaceId, setWorkspaceId] = useState('');
  const [instagramAccounts, setInstagramAccounts] = useState<{workspaceId:string;account:InstagramAccount}[]>([]);
  const [accountSwitching,setAccountSwitching] = useState(false);
  const [accountError,setAccountError] = useState('');
  const [instagramConnectMode,setInstagramConnectMode] = useState<'add'|'reconnect'>('reconnect');
  const accountRequestVersion = useRef(0);
  const accountMutation = useRef(false);
  const [instagramAccount, setInstagramAccountState] = useState<InstagramAccount | null>(null);

  const setInstagramAccount = (acc: InstagramAccount | null) => {
    const clientSafeAccount = connectedInstagramAccount(acc);

    setInstagramAccountState(clientSafeAccount);
    try {
      const activeUid = workspaceId || firebaseUser?.uid || auth?.currentUser?.uid;
      if (activeUid) {
        if (clientSafeAccount && clientSafeAccount.username) {
          localStorage.setItem(
            `autoreply_connected_instagram_account_${activeUid}`,
            JSON.stringify(clientSafeAccount)
          );
        } else {
          localStorage.removeItem(`autoreply_connected_instagram_account_${activeUid}`);
        }
      }
      localStorage.removeItem('autoreply_connected_instagram_account');
    } catch {}
  };
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [customerInsights,setCustomerInsights]=useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [webhookLogs, setLogs] = useState<WebhookLogEvent[]>([]);
  const [pausedAiUsers, setPausedAiUsers] = useState<string[]>([]);
  const pendingAutomationStatuses=useRef(new Map<string,Automation['status']>());
  const threadPauseVersions=useRef(new Map<string,number>());
  const threadControlRecords=useRef(new Map<string,any>());
  const workspaceScope=useRef('');
  workspaceScope.current=workspaceId || firebaseUser?.uid || '';
  const isAutomationSaving=(id:string)=>pendingAutomationStatuses.current.has(id);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [activeTab, setActiveTabState] = useState<ActiveTab>(() =>
    typeof window === 'undefined' ? 'home' : tabFromPath(window.location.pathname)
  );
  const setActiveTab = (tab: ActiveTab) => {
    startTransition(() => {
      setActiveTabState(tab);
    });
    if (typeof window !== 'undefined') {
      const nextPath = TAB_PATHS[tab];
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ tab }, '', nextPath);
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      startTransition(() => setActiveTabState(tabFromPath(window.location.pathname)));
    };
    window.addEventListener('popstate', onPopState);
    onPopState();
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState<boolean>(false);

  const [isBuilderOpen, setIsBuilderOpen] = useState<boolean>(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);

  // 1. Listen for Supabase Auth State Changes & Silent Background Init
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;
    let previousAuthenticatedUid: string | null = null;

    // Handle any incoming redirect result (e.g. from Google Sign-In redirect on mobile/desktop)
    getRedirectResult(auth)
      .then(async (result) => {
        if (!isMounted) return;
        if (result && result.user) {
          console.log('[SUPABASE_REDIRECT_SUCCESS] Successfully authenticated via redirect:', result.user.email);
          previousAuthenticatedUid=result.user.uid;
          setWorkspaceHydrating(true);
          setFirebaseUser(result.user);
          setIsGuestMode(false);
          const userProfile: UserProfile = {
            id: result.user.uid,
            name: result.user.displayName || result.user.email?.split('@')[0] || 'Creator Admin',
            email: result.user.email || '',
            avatar_url: result.user.photoURL || '',
            plan: 'free',
            trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: result.user.metadata.creationTime || new Date().toISOString(),
          };
          setUser(userProfile);
          setAuthLoading(false);
        }
      })
      .catch((rErr: any) => {
        if (!isMounted) return;
        console.warn('[SUPABASE_REDIRECT_CHECK_WARN]', rErr?.code, rErr?.message);
        if (rErr?.code === 'auth/unauthorized-domain') {
          console.error(
            `[UNAUTHORIZED_DOMAIN] Domain "${window.location.hostname}" is not allowed by Supabase Auth redirect settings.`
          );
        }
      })
      .finally(() => {
        try {
          sessionStorage.removeItem('supabase_redirect_pending');
        } catch {}
      });

    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      if (!isMounted) return;
      if(currUser?.uid && currUser.uid!==previousAuthenticatedUid) setWorkspaceHydrating(true);
      previousAuthenticatedUid=currUser?.uid||null;
      setFirebaseUser(currUser);
      if (currUser) {
        setIsGuestMode(false);
        const userProfile: UserProfile = {
          id: currUser.uid,
          name: currUser.displayName || currUser.email?.split('@')[0] || 'Creator Admin',
          email: currUser.email || '',
          avatar_url: currUser.photoURL || '',
          plan: 'free',
          trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: currUser.metadata.creationTime || new Date().toISOString(),
        };
        setUser(userProfile);

        // Run safe migration check asynchronously in background WITHOUT blocking UI
        checkAndMigrateExistingData(currUser.uid, currUser.email || '').catch((mErr) => {
          console.warn('[MIGRATION_CHECK_ERR]', mErr);
        });
      } else {
        setFirebaseUser(null);
        setInstagramAccountState(null);
        setUser({
          id: '',
          name: 'Account',
          email: '',
          avatar_url: '',
          plan: 'free',
          trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        });
      }
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // A verified login triggers a single welcome email (server-side idempotent).
  // The authenticated activity heartbeat also suppresses inactivity tips
  // whenever the customer is actually using the website. No client email sent.
  useEffect(() => {
    if (!firebaseUser?.uid || !firebaseUser.email || !firebaseUser.emailVerified || firebaseUser.isAnonymous) return;
    let cancelled = false;
    let lastSent = 0;
    const signalActivity = async () => {
      if (cancelled || document.hidden || Date.now() - lastSent < 5 * 60_000) return;
      const token = await auth.currentUser?.getIdToken().catch(() => '');
      if (!token || cancelled) return;
      lastSent = Date.now();
      await fetch('/api/workspace-data?action=mail-activity', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(9000),
      }).catch(() => {});
    };
    void signalActivity();
    const timer = window.setInterval(() => { void signalActivity(); }, 10 * 60_000);
    const onVisible = () => { if (!document.hidden) void signalActivity(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, [firebaseUser?.uid]);

  // Check URL parameter on mount (?tab=admin or /admin)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam === 'admin' || window.location.pathname === '/admin') {
        setActiveTab('admin');
      }
    } catch {}
  }, []);

  // Only the authenticated server can grant admin access; failures deny access.
  useEffect(() => {
    let cancelled = false;
    setIsAdmin(false);
    if (!firebaseUser?.uid) return;
    const current = firebaseUser;
    void (async () => {
      try {
        const token = await current.getIdToken();
        const res = await fetch('/api/workspace-data?action=admin-access', {
          headers:{Authorization:`Bearer ${token}`}, cache:'no-store',
        });
        const data = await res.json();
        if (!cancelled) setIsAdmin(res.ok && data.isAdmin === true);
      } catch { if (!cancelled) setIsAdmin(false); }
    })();
    void syncUserProfileDocument(current.uid, {
      email:current.email, displayName:current.displayName || current.email?.split('@')[0],
      photoURL:current.photoURL || '', last_login_at:current.metadata?.lastSignInTime,
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [firebaseUser?.uid, firebaseUser?.email]);

  // 2. Multi-Tenant Firestore Synchronization (Strictly scoped by active authenticated user UID)
  useEffect(() => {
    if (!isSupabaseInitialized) {
      return;
    }

    const uid = workspaceId || firebaseUser?.uid;
    if (firebaseUser?.uid && !workspaceId) {setWorkspaceDataLoading(true);setAutomations([]);setContacts([]);setInboxMessages([]);setLogs([]);return;}
    if (!uid) {
      setWorkspaceDataLoading(false);
      // Guest workspaces use the same secure HttpOnly cookie as Instagram OAuth.
      // Poll the server-side workspace feed so live webhook DMs appear in Inbox
      // and Contacts even without an app login.
      let cancelled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let profileRefreshRequested = false;


      const loadGuestWorkspace = async () => {
        try {
          const res = await fetch('/api/workspace-data', {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const payload = await res.json().catch(() => null);

          if (!res.ok || !payload?.ok) {
            throw new Error(payload?.error || 'Could not load workspace data');
          }

          if (cancelled) return;

          setAutomations(
            (Array.isArray(payload?.automations) ? payload.automations : []).map(
              sanitizeAutomationRecord
            )
          );

          const guestContacts: Contact[] = (
            Array.isArray(payload?.contacts) ? payload.contacts : []
          ).map((contact: any) => ({
            ...contact,
            id: contact.id || contact.ig_user_id || `contact_${Date.now()}`,
            ig_username:
              contact.ig_username || contact.ig_user_id || 'instagram_user',
            ig_user_id: contact.ig_user_id || '',
            avatar_url:
              contact.avatar_url &&
              !String(contact.avatar_url).includes('api.dicebear.com')
                ? contact.avatar_url
                : '',
            first_interaction_at:
              contact.first_interaction_at || new Date().toISOString(),
            last_interaction_at:
              contact.last_interaction_at || new Date().toISOString(),
            interactions: {
              comments: Number(contact.interactions?.comments) || 0,
              dms: Number(contact.interactions?.dms) || 0,
              stories: Number(contact.interactions?.stories) || 0,
            },
            tags: Array.isArray(contact.tags) ? contact.tags : [],
            status: contact.status || 'lead',
          }));
          setContacts(filterOutMockContacts(guestContacts));

          const needsRealProfileRefresh = guestContacts.some((contact) => {
            const username = String(contact.ig_username || '').trim();
            return /^\d{8,}$/.test(username) || !contact.avatar_url;
          });

          if (needsRealProfileRefresh && !profileRefreshRequested) {
            profileRefreshRequested = true;
            fetch('/api/instagram/refresh-contacts', {
              method: 'POST',
              credentials: 'same-origin',
            })
              .then(async (refreshRes) => {
                const refreshPayload = await refreshRes.json().catch(() => null);
                if (!refreshRes.ok || !refreshPayload?.ok) {
                  throw new Error(
                    refreshPayload?.error || 'Could not refresh Instagram contact profiles'
                  );
                }
                // The regular 4s workspace poll will pick up the real username/photo.
              })
              .catch((err) => {
                console.warn('[IG_CONTACT_PROFILE_REFRESH_WARN]', err?.message || err);
                // Allow one later retry in this page session.
                setTimeout(() => {
                  profileRefreshRequested = false;
                }, 15000);
              });
          }

          const guestMessages: InboxMessage[] = (
            Array.isArray(payload?.inboxMessages) ? payload.inboxMessages : []
          ).map((message: any) => ({
            ...message,
            id: message.id || `msg_${Date.now()}`,
            from_ig_id: message.from_ig_id || '',
            from_username:
              message.from_username ||
              message.from_ig_id ||
              'instagram_user',
            from_avatar:
              message.from_avatar &&
              !String(message.from_avatar).includes('api.dicebear.com')
                ? message.from_avatar
                : '',
            message_text: message.message_text || '',
            direction: message.direction === 'out' ? 'out' : 'in',
            timestamp: message.timestamp || new Date().toISOString(),
            is_read: message.direction === 'out' ? true : Boolean(message.is_read),
            read_at: message.read_at || undefined,
          }));

          setWorkspaceDataLoading(false);
          setInboxMessages(
            filterOutMockMessages(guestMessages).sort(
              (a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )
          );

        } catch (err: any) {
          console.warn('[GUEST_WORKSPACE_LOAD_WARN]', err?.message || err);
        }
      };

      void loadGuestWorkspace();
      pollTimer = setInterval(() => {
        void loadGuestWorkspace();
      }, 4000);

      return () => {
        cancelled = true;
        if (pollTimer) clearInterval(pollTimer);
      };
    }

    // Immediately reset collection state for this session
    let live=true,gotAutomations=false,gotInbox=false;
    setWorkspaceDataLoading(true);
    setWorkspaceDataError(false);
    const markLoaded=(kind:'automations'|'inbox',failed=false)=>{
      if(!live)return;
      if(kind==='automations')gotAutomations=true;else gotInbox=true;
      if(failed)setWorkspaceDataError(true);
      if(gotAutomations&&gotInbox)setWorkspaceDataLoading(false);
    };
    setAutomations([]);
    setContacts([]);
    setInboxMessages([]);setLogs([]);setPausedAiUsers([]);
    pendingAutomationStatuses.current.clear();threadPauseVersions.current.clear();threadControlRecords.current.clear();
    const loadAutomationsFromServer = async () => {
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => '');
        const response = await fetch('/api/automations', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}`, 'X-Autoreply-Workspace':uid } : {},
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'Automations could not be loaded.');
        }
        const sanitized: Automation[] = (
          Array.isArray(payload.automations) ? payload.automations : []
        ).map(sanitizeAutomationRecord);
        if(live)setAutomations(current=>reconcileAutomationRecords(current,sanitized,pendingAutomationStatuses.current));
        markLoaded('automations');
      } catch (err: any) {
        console.warn('[AUTOMATION_API_LOAD_WARN]', err?.message || err);
        markLoaded('automations',true);
      }
    };

    const unsubscribeAutomations = subscribeToUserCollection<Automation>(
      uid,
      'automations',
      (data) => {
        if (data) {
          const sanitized: Automation[] = data.map(sanitizeAutomationRecord);
          setAutomations(current=>reconcileAutomationRecords(current,sanitized,pendingAutomationStatuses.current));
        } else {
          setAutomations(current=>reconcileAutomationRecords(current,[],pendingAutomationStatuses.current));
        }
        markLoaded('automations');
      },
      (err) => {
        console.warn('[AUTOMATION_REALTIME_LOAD_WARN]', err?.message || err);
        void loadAutomationsFromServer();
      }
    );

    // Load once through the server route too. Realtime remains the fast path,
    // while this protects the page from transient PostgREST/read timeouts.
    void loadAutomationsFromServer();

    let signedInProfileRefreshRequested = false;
    setCustomerInsights([]);
    const unsubscribeInsights=subscribeToUserCollection<any>(uid,'customer_insights',setCustomerInsights);
    const unsubscribeThreadControls=subscribeToUserCollection<any>(uid,'ai_thread_controls',(rows)=>{
      if(!live)return;
      for(const row of rows||[]){const old=threadControlRecords.current.get(row.id);if(!old || (Date.parse(old.updated_at||'')||0)<=(Date.parse(row.updated_at||'')||0))threadControlRecords.current.set(row.id,row);}
      setPausedAiUsers([...threadControlRecords.current.values()].filter(row=>row.paused===true).flatMap(row=>[String(row.sender_id||row.id||'').toLowerCase(),String(row.username||'').replace(/^@/,'').toLowerCase()]).filter(Boolean));
    });
    const unsubscribeContacts = subscribeToUserCollection<Contact>(uid, 'contacts', (data) => {
      if (data) {
        const sanitized: Contact[] = data.map((c) => ({
          ...c,
          id: c.id || `contact_${Date.now()}`,
          ig_username: c.ig_username || c.ig_user_id || 'instagram_user',
          ig_user_id: c.ig_user_id || '',
          avatar_url: c.avatar_url && !c.avatar_url.includes('api.dicebear.com') ? c.avatar_url : '',
          first_interaction_at: c.first_interaction_at || new Date().toISOString(),
          last_interaction_at: c.last_interaction_at || new Date().toISOString(),
          interactions: {
            comments: Number(c.interactions?.comments) || 0,
            dms: Number(c.interactions?.dms) || 0,
            stories: Number(c.interactions?.stories) || 0,
          },
          tags: Array.isArray(c.tags) ? c.tags : [],
          status: c.status || 'lead',
        }));
        setContacts(filterOutMockContacts(sanitized));
        if (sanitized.length && !signedInProfileRefreshRequested) {
          signedInProfileRefreshRequested = true;
          void (async () => {
            const token = await auth.currentUser?.getIdToken();
            if (!token) return;
            const result = await fetch('/api/instagram/refresh-contacts', { method: 'POST',
              credentials: 'same-origin', headers: { Authorization: `Bearer ${token}`, 'X-Autoreply-Workspace':uid } });
            if (!result.ok) console.warn('[IG_CONTACT_PROFILE_REFRESH_WARN]', result.status);
          })().catch((error) => console.warn('[IG_CONTACT_PROFILE_REFRESH_WARN]', error?.message));
        }
      } else {
        setContacts([]);
      }
    });

    const unsubscribeInbox = subscribeToUserCollection<InboxMessage>(uid, 'inbox_messages', (data) => {
      if (data) {
        const sanitized: InboxMessage[] = data.map((m) => ({
          ...m,
          id: m.id || `msg_${Date.now()}`,
          from_ig_id: m.from_ig_id || '',
          from_username: m.from_username || m.from_ig_id || 'instagram_user',
          from_avatar: m.from_avatar && !m.from_avatar.includes('api.dicebear.com') ? m.from_avatar : '',
          message_text: m.message_text || '',
          direction: m.direction || 'in',
          timestamp: m.timestamp || new Date().toISOString(),
          is_read: (m.direction || 'in') === 'out' ? true : Boolean(m.is_read),
          read_at: m.read_at || undefined,
        }));
        const filtered = filterOutMockMessages(sanitized);
        setInboxMessages(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        setInboxMessages([]);
      }
      setWorkspaceDataError(false);
      markLoaded('inbox');
    },(err)=>{console.warn('[INBOX_LOAD_ERROR]',err?.message||err);markLoaded('inbox',true);});

    let legacyLogs: WebhookLogEvent[] = [], liveLogs: WebhookLogEvent[] = [];
    const refreshLogs = () => setLogs([...liveLogs, ...legacyLogs].sort((a,b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)));
    const unsubscribeLogs = subscribeToUserCollection<WebhookLogEvent>(uid, 'webhook_logs', (data) => { legacyLogs = (data || []).map(normalizeActivityLog); refreshLogs(); });
    const unsubscribeEvents = subscribeToUserCollection<WebhookLogEvent>(uid, 'webhook_events', (data) => { liveLogs = (data || []).map(row=>normalizeActivityLog({...row,id:'event:'+row.id})); refreshLogs(); });

    // Documents can contain a preserved profile. Re-check the server's token
    // status instead of treating any profile row as a connected account.
    const unsubscribeAccount = subscribeToUserCollection<InstagramAccount>(uid, 'instagram_account', () => {
      if (live) void refreshInstagramAccounts();
    });

    return () => {
      live=false;
      unsubscribeAutomations();
      unsubscribeContacts();
      unsubscribeInsights();
      unsubscribeThreadControls();
      unsubscribeInbox();
      unsubscribeLogs();
      unsubscribeEvents();
      unsubscribeAccount();
    };
  }, [firebaseUser?.uid, workspaceId, isSupabaseInitialized]);

  // AI Human Takeover state
  const isAiPausedForUser = (username: string): boolean => {
    const clean=String(username||'').replace(/^@/,'').toLowerCase();
    const contact=contacts.find(c=>c.ig_username?.toLowerCase()===clean || c.ig_user_id===clean);
    const sender=contact?.ig_user_id || inboxMessages.find(m=>m.from_username?.toLowerCase()===clean)?.from_ig_id;
    return pausedAiUsers.includes(clean) || Boolean(sender && pausedAiUsers.includes(sender.toLowerCase()));
  };

  const setAiPausedForUser = async (username: string, paused: boolean) => {
    const clean=String(username||'').replace(/^@/,'').toLowerCase();
    const uid=workspaceId || firebaseUser?.uid || '';
    const contact=contacts.find(c=>c.ig_username?.toLowerCase()===clean || c.ig_user_id===clean);
    const senderId=contact?.ig_user_id || inboxMessages.find(m=>m.from_username?.toLowerCase()===clean || m.from_ig_id===clean)?.from_ig_id || (/^\d+$/.test(clean)?clean:'');
    if(!uid || !senderId)throw new Error('This conversation is still loading. Please try again.');
    const key=uid+':'+senderId,version=(threadPauseVersions.current.get(key)||0)+1;
    threadPauseVersions.current.set(key,version);
    const control={id:senderId,sender_id:senderId,username:clean,paused,updated_at:new Date().toISOString()};
    await saveUserDocument(uid,'ai_thread_controls',control);
    if(workspaceScope.current!==uid || threadPauseVersions.current.get(key)!==version)return;
    threadControlRecords.current.set(senderId,control);
    setPausedAiUsers(previous=>{const rest=previous.filter(value=>value!==clean&&value!==senderId.toLowerCase());return paused?[...rest,clean,senderId.toLowerCase()]:rest;});
  };
  const toggleAiForUser = (username: string) => setAiPausedForUser(username,!isAiPausedForUser(username));

  const refreshInstagramAccounts = async (followCookie=false) => {
    if (!firebaseUser?.uid || accountMutation.current) return;
    const version = ++accountRequestVersion.current;
    try {
      // A transient network failure must not turn a connected workspace into an
      // apparent disconnect. Retry only network/5xx/429 failures, never auth or
      // other permanent 4xx errors.
      let response: Response | undefined;
      let payload: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const token = await auth.currentUser?.getIdToken();
          response = await fetch('/api/instagram/account', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {Authorization: `Bearer ${token}`, ...(!followCookie && workspaceId ? {'X-Autoreply-Workspace': workspaceId} : {})},
            signal: AbortSignal.timeout(12000),
          });
          payload = await response.json();
          if (response.ok || (response.status !== 429 && response.status < 500)) break;
        } catch (error) {
          if (attempt === 2) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      }
      if (!response) throw new Error('Instagram workspace is temporarily unreachable. Please try again.');
      if (auth.currentUser?.uid !== firebaseUser?.uid || version !== accountRequestVersion.current) return;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Could not load Instagram accounts.');
      setInstagramAccounts(payload.accounts || []);
      const target = payload.activeWorkspaceId || firebaseUser.uid;
      if (target !== (workspaceId || firebaseUser.uid)) {setAutomations([]);setContacts([]);setInboxMessages([]);setLogs([]);setPausedAiUsers([]);setInstagramAccountState(null);setEditingAutomation(null);setIsBuilderOpen(false);}
      const selected=(payload.accounts||[]).find((a:any)=>a.workspaceId===target)?.account;
      if(selected?.username) setInstagramAccount(connectedInstagramAccount(selected));
      else setInstagramAccount(null);
      setWorkspaceId(target); setIsConnectModalOpen(false); setInstagramConnectMode('reconnect');
      setAccountError('');
      setWorkspaceHydrating(false);
    } catch(error:any) {
      if (version !== accountRequestVersion.current || auth.currentUser?.uid !== firebaseUser?.uid) return;
      setAccountError(error?.message || 'Could not load Instagram accounts.');
      setWorkspaceHydrating(false);
    }
  };
  const switchInstagramAccount = async (id:string) => {
    if (accountMutation.current || accountSwitching || id === (workspaceId || firebaseUser?.uid)) return;
    accountMutation.current = true; ++accountRequestVersion.current;
    setAccountSwitching(true); setAccountError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/instagram/account', {method:'POST',credentials:'same-origin',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({workspaceId:id})});
      const payload = await response.json();
      if (auth.currentUser?.uid !== firebaseUser?.uid) return;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Could not switch Instagram account.');
      setAutomations([]);setContacts([]);setInboxMessages([]);setLogs([]);setPausedAiUsers([]);setInstagramAccountState(null);setEditingAutomation(null);setIsBuilderOpen(false);
      setWorkspaceId(payload.activeWorkspaceId);setInstagramAccounts(payload.accounts || []);
    } catch(error:any) {setAccountError(error?.message || 'Could not switch Instagram account.');}
    finally {accountMutation.current=false;setAccountSwitching(false);}
  };
  const startInstagramConnection = (mode:'add'|'reconnect'='reconnect') => {setInstagramConnectMode(mode);setIsConnectModalOpen(true);};
  useEffect(()=>{
    ++accountRequestVersion.current;
    setWorkspaceId('');setInstagramAccounts([]);
    if (!firebaseUser?.uid) {setWorkspaceHydrating(false);return;}
    setWorkspaceHydrating(true);
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('status') === 'ig_connected';
    void refreshInstagramAccounts(connected);
    if (connected) { params.delete('status'); const query=params.toString(); window.history.replaceState({},document.title,window.location.pathname+(query?'?'+query:'')+window.location.hash); }
    const onConnected = (event:MessageEvent)=>{if(event.origin===window.location.origin && (event.data==='ig_connected'||event.data?.type==='ig_connected'))void refreshInstagramAccounts(true);};
    window.addEventListener('message',onConnected);
    return ()=>{++accountRequestVersion.current;window.removeEventListener('message',onConnected);};
  },[firebaseUser?.uid]);

  useEffect(()=>{if (!isConnectModalOpen) setInstagramConnectMode('reconnect');},[isConnectModalOpen]);
  useEffect(()=>{
    if (!firebaseUser?.uid || workspaceId || !accountError) return;
    const timer=window.setInterval(()=>void refreshInstagramAccounts(),15000);
    return ()=>window.clearInterval(timer);
  },[firebaseUser?.uid,workspaceId,accountError]);

  // Logout Handler
  const logout = async () => {
    setIsGuestMode(false);
    const prevUid = firebaseUser?.uid || auth?.currentUser?.uid;
    if (prevUid) {
      try {
        localStorage.removeItem(`autoreply_connected_instagram_account_${prevUid}`);
      } catch {}
    }
    try {
      localStorage.removeItem('autoreply_connected_instagram_account');
    } catch {}
    if (auth) {
      await signOut(auth).catch(() => {});
    }
    setFirebaseUser(null);
    setInstagramAccount(null);
    setAutomations([]);
    setContacts([]);
    setInboxMessages([]);
    setLogs([]);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, '/');
    }
    setActiveTabState('home');
  };

  // Automation CRUD goes through one server route for both authenticated and
  // guest workspaces. This avoids transient browser -> PostgREST failures and
  // guarantees the same validation/cache-sync path used by the live webhook engine.
  const automationAuthHeaders = async () => {
    const token = await auth.currentUser?.getIdToken().catch(() => '');
    return token ? { Authorization: `Bearer ${token}`, 'X-Autoreply-Workspace':workspaceId || firebaseUser?.uid || '' } : {};
  };

  const automationRequest = async (
    input: { method: 'POST' | 'DELETE'; automation?: Automation; id?: string },
    attempt = 0
  ): Promise<any> => {
    const authHeaders = await automationAuthHeaders();
    const url =
      input.method === 'DELETE'
        ? `/api/automations?id=${encodeURIComponent(input.id || '')}`
        : '/api/automations';

    try {
      const response = await fetch(url, {
        method: input.method,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        credentials: 'same-origin',
        body:
          input.method === 'POST'
            ? JSON.stringify({ automation: input.automation })
            : undefined,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        const error = new Error(payload?.error || 'Automation request failed.');
        (error as any).status = response.status;
        throw error;
      }
      return payload;
    } catch (err: any) {
      const retryable =
        attempt < 1 &&
        (!err?.status || err.status >= 500 || err?.name === 'TypeError');
      if (retryable) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        return automationRequest(input, attempt + 1);
      }
      throw err;
    }
  };

  const persistAutomationRecord = (automation: Automation) => {
    automationRequest({ method: 'POST', automation })
      .then((payload) => {
        if (
          Array.isArray(payload?.pausedAutomationIds) &&
          payload.pausedAutomationIds.length
        ) {
          const paused = new Set<string>(payload.pausedAutomationIds);
          setAutomations((prev) =>
            prev.map((item) =>
              paused.has(item.id)
                ? {
                    ...item,
                    status: 'paused',
                    updated_at: new Date().toISOString(),
                  }
                : item
            )
          );
        }
      })
      .catch((err) => {
        console.error('[AUTOMATION_SAVE_FAILED]', err?.message || err);
        // Optimistic UI state is not proof of persistence. Tell the user
        // explicitly rather than silently losing the prompt after a reload.
        window.alert('Automation could not be saved to the server. Your changes may disappear after refresh. Please retry. ' + (err?.message || ''));
      });
  };

  const hasDuplicateAutomationName = (name: string, exceptId?: string) =>
    automations.some(
      (auto) =>
        auto.id !== exceptId &&
        auto.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()
    );

  const createAutomation = (
    newAuto: Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'stats'> & {id?:string}
  ) => {
    const now = new Date().toISOString();
    const cleanName = newAuto.name.trim();

    if (hasDuplicateAutomationName(cleanName)) {
      console.warn('[AUTOMATION_NAME_DUPLICATE]', cleanName);
      return;
    }

    const created: Automation = {
      ...newAuto,
      name: cleanName,
      id: newAuto.id || `auto_${crypto.randomUUID()}`,
      created_at: now,
      updated_at: now,
      stats: {
        runs: 0,
        dms_sent: 0,
        unique_users: 0,
        open_rate: -1,
      },
    };

    const shouldBeOnlyLiveDmAi =
      created.trigger_type === 'dm_ai_conversation' && created.status === 'active';

    const pausedOthers = shouldBeOnlyLiveDmAi
      ? automations
          .filter(
            (auto) =>
              auto.id !== created.id &&
              auto.trigger_type === 'dm_ai_conversation' &&
              auto.status === 'active'
          )
          .map((auto) => ({
            ...auto,
            status: 'paused' as const,
            updated_at: now,
          }))
      : [];

    const pausedIds = new Set(pausedOthers.map((auto) => auto.id));

    setAutomations((prev) => [
      created,
      ...prev.map((auto) =>
        pausedIds.has(auto.id)
          ? { ...auto, status: 'paused' as const, updated_at: now }
          : auto
      ),
    ]);

    for (const paused of pausedOthers) persistAutomationRecord(paused);
    persistAutomationRecord(created);
  };

  const updateAutomation = (id: string, updates: Partial<Automation>) => {
    const current = automations.find((auto) => auto.id === id);
    if (!current) return;

    const nextName = String(updates.name ?? current.name).trim();
    if (hasDuplicateAutomationName(nextName, id)) {
      console.warn('[AUTOMATION_NAME_DUPLICATE]', nextName);
      return;
    }

    const now = new Date().toISOString();
    const updated: Automation = {
      ...current,
      ...updates,
      name: nextName,
      updated_at: now,
    };

    const shouldBeOnlyLiveDmAi =
      updated.trigger_type === 'dm_ai_conversation' && updated.status === 'active';

    const pausedOthers = shouldBeOnlyLiveDmAi
      ? automations
          .filter(
            (auto) =>
              auto.id !== id &&
              auto.trigger_type === 'dm_ai_conversation' &&
              auto.status === 'active'
          )
          .map((auto) => ({
            ...auto,
            status: 'paused' as const,
            updated_at: now,
          }))
      : [];

    const pausedIds = new Set(pausedOthers.map((auto) => auto.id));

    setAutomations((prev) =>
      prev.map((auto) => {
        if (auto.id === id) return updated;
        if (pausedIds.has(auto.id)) {
          return { ...auto, status: 'paused', updated_at: now };
        }
        return auto;
      })
    );

    for (const paused of pausedOthers) persistAutomationRecord(paused);
    persistAutomationRecord(updated);
  };

  const deleteAutomation = (id: string) => {
    const deleted = automations.find((auto) => auto.id === id);
    setAutomations((prev) => prev.filter((auto) => auto.id !== id));

    automationRequest({ method: 'DELETE', id }).catch((err) => {
      console.warn('[AUTOMATION_DELETE_WARN]', err?.message || err);
      if (deleted) {
        setAutomations((prev) =>
          prev.some((item) => item.id === deleted.id)
            ? prev
            : [deleted, ...prev]
        );
      }
    });
  };

  const toggleAutomationStatus = async (id: string) => {
    const current=automations.find(item=>item.id===id);
    if(!current || pendingAutomationStatuses.current.has(id))return;
    const uid=workspaceId || firebaseUser?.uid || '';
    const status=current.status==='active'?'paused':'active';
    pendingAutomationStatuses.current.set(id,status);
    setAutomations(previous=>previous.map(item=>item.id===id?{...item,status}:item));
    try{
      const response=await fetch('/api/automations',{method:'PATCH',credentials:'same-origin',
        headers:{'Content-Type':'application/json',...(await automationAuthHeaders())},
        body:JSON.stringify({automationId:id,status}),signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(!response.ok || !result.ok || !result.automation)throw new Error(result.error||'Could not save automation status.');
      if(workspaceScope.current!==uid)return;
      pendingAutomationStatuses.current.delete(id);
      const paused=new Set<string>(result.pausedAutomationIds||[]);
      setAutomations(previous=>reconcileAutomationRecords(previous,previous.map(item=>item.id===id?sanitizeAutomationRecord(result.automation):paused.has(item.id)?{...item,status:'paused',updated_at:result.automation.updated_at}:item)));
    }catch(error:any){
      if(workspaceScope.current!==uid)return;
      pendingAutomationStatuses.current.delete(id);
      setAutomations(previous=>previous.map(item=>item.id===id?{...item,status:current.status}:item));
      window.alert('Automation status could not be saved. Please retry. '+(error?.message||''));
    }
  };

  // Simulator & Webhook Engine implementation
  const simulateWebhookEvent = async (triggerType: TriggerType, username: string, incomingText: string): Promise<WebhookLogEvent> => {
    const uid = workspaceId || firebaseUser?.uid;
    const cleanUser = username.replace(/^@/, '').toLowerCase();
    const upperText = incomingText.toUpperCase();
    const nowIso = new Date().toISOString();

    if (isAiPausedForUser(cleanUser)) {
      const newInMsg: InboxMessage = {
        id: `msg_in_${Date.now()}`,
        from_ig_id: `ig_usr_${cleanUser}`,
        from_username: cleanUser,
        from_avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUser}`,
        message_text: incomingText,
        direction: 'in',
        timestamp: nowIso,
      };
      setInboxMessages((prev) => [newInMsg, ...prev]);
      if (firebaseUser?.uid) saveUserDocument(workspaceId || firebaseUser.uid, 'inbox_messages', newInMsg);

      const logEntry: WebhookLogEvent = {
        id: `log_${Date.now()}`,
        timestamp: nowIso,
        trigger_type: triggerType,
        from_username: cleanUser,
        incoming_text: incomingText,
        status: 'ignored',
        response_sent: `AI Auto-Response stopped (Human Interference / Takeover Active for @${cleanUser}).`,
      };
      setLogs((prev) => [logEntry, ...prev]);
      if (firebaseUser?.uid) saveUserDocument(workspaceId || firebaseUser.uid, 'webhook_logs', logEntry);
      return logEntry;
    }

    const matched = automations.find((auto) => {
      if (auto.status !== 'active') return false;
      if (auto.trigger_type !== triggerType) return false;

      const { all_or_keywords, keywords } = auto.trigger_config;
      if (all_or_keywords === 'all') return true;

      return keywords.some((kw) => upperText.includes(kw.toUpperCase()));
    });

    if (!matched) {
      const logEntry: WebhookLogEvent = {
        id: `log_${Date.now()}`,
        timestamp: nowIso,
        trigger_type: triggerType,
        from_username: cleanUser,
        incoming_text: incomingText,
        status: 'ignored',
        response_sent: 'No active automation keywords matched.',
      };
      setLogs((prev) => [logEntry, ...prev]);
      if (firebaseUser?.uid) saveUserDocument(workspaceId || firebaseUser.uid, 'webhook_logs', logEntry);
      return logEntry;
    }

    let responseSummary = '';
    const aiAction = matched.actions.find((a) => a.type === 'ai_chatbot');
    const dmAction = matched.actions.find((a) => a.type === 'send_dm');
    const commentReplyAction = matched.actions.find((a) => a.type === 'reply_comment');

    if (aiAction) {
      // Limit context history for fast DM replies while keeping the conversation coherent.
      const previousHistory = (inboxMessages || [])
        .filter((m) => m?.from_username?.toLowerCase() === cleanUser)
        .sort((a, b) => new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime())
        .slice(-6);

      try {
        const openAiRes = await fetch('/api/openai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            text: incomingText,
            history: previousHistory.map((m) => ({
              role: m.direction === 'in' ? 'user' : 'assistant',
              content: m.message_text || '',
            })),
            systemInstruction:
              aiAction.ai_system_instruction ||
              'You are a helpful and polite Instagram assistant. Reply directly and briefly.',
            maxReplyLength: 'Short',
            language: 'Auto Detect',
            personality: 'Friendly',
            assistantName: 'AI Assistant',
          }),
        });

        const payload = await openAiRes.json().catch(() => null);
        if (!openAiRes.ok || !payload?.ok) {
          throw new Error(payload?.error || 'GPT-4o mini request failed.');
        }

        responseSummary = String(payload.reply || '').trim();

        if (!responseSummary) {
          responseSummary = 'Thanks for your message! How can I help you today?';
        }
      } catch (err: any) {
        console.warn('[AI_REPLY_GENERATION_WARN]', err?.message || err);
        responseSummary = 'Thanks for your message! Our team will reach back out to you shortly.';
      }
    } else if (dmAction && dmAction.message_text) {
      responseSummary = dmAction.message_text;
    } else if (commentReplyAction && commentReplyAction.comment_reply_text) {
      responseSummary = commentReplyAction.comment_reply_text;
    } else {
      responseSummary = 'Automation trigger acknowledged.';
    }

    const inMsg: InboxMessage = {
      id: `msg_in_${Date.now()}`,
      from_ig_id: `ig_usr_${cleanUser}`,
      from_username: cleanUser,
      from_avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUser}`,
      message_text: incomingText,
      direction: 'in',
      timestamp: nowIso,
      is_test: true,
    };

    const outMsg: InboxMessage = {
      id: `msg_out_${Date.now() + 1}`,
      from_ig_id: `ig_usr_${cleanUser}`,
      from_username: cleanUser,
      from_avatar: instagramAccount?.profile_pic_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=autoreply',
      message_text: responseSummary,
      direction: 'out',
      is_automated: true,
      automation_id: matched.id,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      is_test: true,
    };

    const userUid = uid || workspaceId || firebaseUser?.uid;
    if (userUid) {
      saveUserDocument(userUid, 'inbox_messages', inMsg);
      saveUserDocument(userUid, 'inbox_messages', outMsg);
    }

    // Also trigger backend test-webhook endpoint asynchronously
    fetch('/api/test-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger_type: triggerType,
        username: cleanUser,
        text: incomingText,
        userId: userUid || 'guest',
        is_test: true,
      }),
    }).catch((err) => console.warn('[TEST_WEBHOOK_CALL_WARN]', err));

    // Upsert Contact with is_test: true
    const existingContact = contacts.find((c) => c.ig_username.toLowerCase() === cleanUser);
    const updatedContact: Contact = {
      id: existingContact ? existingContact.id : `cnt_${Date.now()}`,
      ig_username: cleanUser,
      ig_user_id: existingContact ? existingContact.ig_user_id : `ig_${Date.now()}`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUser}`,
      first_interaction_at: existingContact ? existingContact.first_interaction_at : nowIso,
      last_interaction_at: nowIso,
      interactions: {
        comments: (existingContact?.interactions.comments || 0) + (triggerType === 'comment' ? 1 : 0),
        dms: (existingContact?.interactions.dms || 0) + (triggerType === 'dm' ? 1 : 0),
        stories: (existingContact?.interactions.stories || 0) + (triggerType === 'story_reply' ? 1 : 0),
      },
      status: 'converted',
      is_test: true,
    };

    if (userUid) {
      saveUserDocument(userUid, 'contacts', updatedContact);
    }

    // Preview messages never rewrite a live automation or its delivery counters.

    const finalLog: WebhookLogEvent = {
      id: `log_${Date.now()}`,
      timestamp: nowIso,
      trigger_type: triggerType,
      from_username: cleanUser,
      incoming_text: incomingText,
      status: 'triggered',
      is_test: true,
      matched_automation_name: matched.name,
      response_sent: responseSummary,
    };

    setLogs((prev) => [finalLog, ...prev]);
    if (userUid) {
      saveUserDocument(userUid, 'webhook_logs', finalLog);
    }

    return finalLog;
  };

  const triggerWebhookSimulation = async (params: {
    trigger_type: TriggerType;
    username: string;
    text: string;
  }): Promise<WebhookLogEvent> => {
    return simulateWebhookEvent(params.trigger_type, params.username, params.text);
  };

  const sendManualReply = async (fromUsername: string, text: string) => {
    if (!text.trim()) return;
    const uid = workspaceId || firebaseUser?.uid;
    if (!uid) return;
    const cleanUser = fromUsername.replace(/^@/, '').toLowerCase();
    const nowIso = new Date().toISOString();

    const newOutMsg: InboxMessage = {
      id: `msg_out_${Date.now()}`,
      from_ig_id: `ig_usr_${cleanUser}`,
      from_username: cleanUser,
      from_avatar: instagramAccount?.profile_pic_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=autoreply',
      message_text: text.trim(),
      direction: 'out',
      is_automated: false,
      timestamp: nowIso,
      is_read: true,
      delivery_status: 'sending',
    };

    setInboxMessages((prev) => [newOutMsg, ...prev]);

    // Pause AI only after Meta confirms the manual message was sent.
    // A failed dispatch must not silently disable automatic replies.

    // Dispatch live Instagram Graph API call to send message to recipient
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/instagram/send-dm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Autoreply-Workspace': uid,
        },
        body: JSON.stringify({
          recipientUsername: cleanUser,
          messageText: text.trim(),
          userId: uid,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Instagram send failed (HTTP ${response.status})`);
      }
      const payload = await response.json().catch(() => null);
      if (payload?.ok !== true || payload?.sent !== true || !payload?.message_id || !payload?.message) {
        throw new Error(payload?.error || 'Instagram did not confirm delivery');
      }
      await setAiPausedForUser(cleanUser, true).catch(()=>{});
      const sent: InboxMessage = payload.message;
      setInboxMessages((prev) => [sent, ...prev.filter((m) => m.id !== newOutMsg.id && m.id !== sent.id)]);
    } catch (err) {
      console.warn('[SEND_MANUAL_DM_DISPATCH_WARN]', err);
      window.alert(err instanceof Error ? err.message : 'Instagram message could not be sent.');
      const failed = { ...newOutMsg, delivery_status: 'failed' as const };
      setInboxMessages((prev) => prev.map((m) => (m.id === failed.id ? failed : m)));
      saveUserDocument(uid, 'inbox_messages', failed);
    }
  };

  const setThreadReadState = async (username: string, read: boolean) => {
    const clean = String(username || '').replace(/^@/, '').toLowerCase();
    if (!clean) return;
    const now = new Date().toISOString();
    const uid = workspaceId || firebaseUser?.uid;
    const affected = inboxMessages.filter(
      (m) =>
        m.direction === 'in' &&
        (m.from_username || m.from_ig_id || '').replace(/^@/, '').toLowerCase() === clean &&
        Boolean(m.is_read) !== read
    );
    setInboxMessages((prev) =>
      prev.map((m) => {
        const same =
          m.direction === 'in' &&
          (m.from_username || m.from_ig_id || '').replace(/^@/, '').toLowerCase() === clean;
        return same ? { ...m, is_read: read, read_at: read ? now : undefined } : m;
      })
    );
    if (!uid) return;
    await Promise.all(
      affected.map((m) =>
        saveUserDocument(uid, 'inbox_messages', {
          ...m,
          is_read: read,
          read_at: read ? now : undefined,
        })
      )
    );
  };

  const markInboxThreadRead = (username: string) => setThreadReadState(username, true);
  const markInboxThreadUnread = (username: string) => setThreadReadState(username, false);

  // Contacts & Inbox Deletion (Scoped strictly by user UID)
  const deleteContact = async (contactId: string, username?: string) => {
    if (!contactId && !username) return;
    const uid = workspaceId || firebaseUser?.uid;
    if (!uid) return;

    await removeUserDocument(uid, 'contacts', contactId);

    const targetUsername = username || contacts.find((c) => c.id === contactId)?.ig_username;
    if (targetUsername) {
      const cleanTarget = targetUsername.toLowerCase();
      const msgsToDelete = inboxMessages.filter(
        (m) => m.from_username?.toLowerCase() === cleanTarget
      );
      for (const msg of msgsToDelete) {
        await removeUserDocument(uid, 'inbox_messages', msg.id);
      }
      setInboxMessages((prev) =>
        prev.filter((m) => m.from_username?.toLowerCase() !== cleanTarget)
      );
    }

    setContacts((prev) => prev.filter((c) => c.id !== contactId));

    try {
      await fetch('/api/contacts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, username: targetUsername, userId: uid }),
      });
    } catch (e) {
      console.warn('[DELETE_CONTACT_API_WARN]', e);
    }
  };

  const deleteContactsBulk = async (contactIds: string[], usernames: string[] = []) => {
    if (!contactIds || contactIds.length === 0) return;
    const uid = workspaceId || firebaseUser?.uid;
    if (!uid) return;

    for (const cid of contactIds) {
      await removeUserDocument(uid, 'contacts', cid);
    }

    const targetUsernames = new Set<string>(usernames.map((u) => u.toLowerCase()));
    contacts.forEach((c) => {
      if (contactIds.includes(c.id)) {
        targetUsernames.add(c.ig_username.toLowerCase());
      }
    });

    const msgsToDelete = inboxMessages.filter(
      (m) => m.from_username && targetUsernames.has(m.from_username.toLowerCase())
    );
    for (const msg of msgsToDelete) {
      await removeUserDocument(uid, 'inbox_messages', msg.id);
    }

    setContacts((prev) => prev.filter((c) => !contactIds.includes(c.id)));
    setInboxMessages((prev) =>
      prev.filter((m) => !m.from_username || !targetUsernames.has(m.from_username.toLowerCase()))
    );

    try {
      await fetch('/api/contacts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds, usernames: Array.from(targetUsernames), userId: uid }),
      });
    } catch (e) {
      console.warn('[DELETE_CONTACTS_BULK_API_WARN]', e);
    }
  };

  const deleteInboxThread = async (username: string) => {
    if (!username) return;
    const uid = workspaceId || firebaseUser?.uid;
    if (!uid) return;
    const cleanUname = username.toLowerCase();

    const msgsToDelete = inboxMessages.filter(
      (m) => m.from_username?.toLowerCase() === cleanUname
    );
    for (const msg of msgsToDelete) {
      await removeUserDocument(uid, 'inbox_messages', msg.id);
    }

    setInboxMessages((prev) =>
      prev.filter((m) => m.from_username?.toLowerCase() !== cleanUname)
    );

    try {
      await fetch('/api/inbox/delete-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, userId: uid }),
      });
    } catch (e) {
      console.warn('[DELETE_INBOX_THREAD_API_WARN]', e);
    }
  };

  const deleteInboxThreadsBulk = async (usernames: string[]) => {
    if (!usernames || usernames.length === 0) return;
    const uid = workspaceId || firebaseUser?.uid;
    if (!uid) return;
    const targets = new Set(usernames.map((u) => u.toLowerCase()));

    const msgsToDelete = inboxMessages.filter(
      (m) => m.from_username && targets.has(m.from_username.toLowerCase())
    );
    for (const msg of msgsToDelete) {
      await removeUserDocument(uid, 'inbox_messages', msg.id);
    }

    setInboxMessages((prev) =>
      prev.filter((m) => !m.from_username || !targets.has(m.from_username.toLowerCase()))
    );

    try {
      await fetch('/api/inbox/bulk-delete-threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames, userId: uid }),
      });
    } catch (e) {
      console.warn('[DELETE_INBOX_BULK_API_WARN]', e);
    }
  };

  const reauthorizeChannel = () => {
    startInstagramConnection('reconnect');
  };

  const disconnectChannel = async () => {
    if (accountMutation.current) throw new Error('Please wait for the current account change to finish.');
    const uid = workspaceId || firebaseUser?.uid || '';
    const ownerId = firebaseUser?.uid;
    accountMutation.current = true;
    ++accountRequestVersion.current;
    try {
      // Delete credentials on the server before showing a successful disconnect.
      const response = await fetch('/api/instagram/account', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json', ...(await automationAuthHeaders())},
        body:JSON.stringify({account:null}), signal:AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || !(result.ok || result.success)) throw new Error(result.error || 'Could not disconnect Instagram. Please try again.');
      if (auth.currentUser?.uid !== ownerId) return;
      setInstagramAccount(null);
      setInstagramAccounts(accounts=>accounts.map(item=>item.workspaceId===uid?{...item,account:{...item.account,status:'disconnected'}}:item));
      setAccountError('');
    } finally { accountMutation.current = false; }
  };

  const connectChannel = async (_accountInput: Partial<InstagramAccount> | string) => {
    throw new Error('Direct Instagram connection is disabled. Use the official Meta OAuth flow.');
  };

  const renewPlan = (nextPlan: 'free' | 'starter' | 'pro' | 'business' = 'pro') => {
    setIsRenewModalOpen(false);
    if (nextPlan === 'free') { setActiveTab('billing'); return; }
    window.location.assign('/billing/checkout?plan=' + encodeURIComponent(nextPlan));
  };

  // Display only the server-issued entitlement. Never grant paid access from local state.
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { billingRequest } = await import('../lib/billing');
        const result = await billingRequest('subscription');
        if (!cancelled) setUser(prev => ({ ...prev, plan: result.subscription.plan, trial_expires_at: result.subscription.expiresAt || prev.trial_expires_at }));
      } catch { /* Do not fabricate an entitlement while payment storage is unavailable. */ }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [firebaseUser?.uid]);

  const enrichedContacts=useMemo(()=>{const insights=new Map(customerInsights.map(item=>[item.id,item]));return contacts.map(contact=>({...contact,customer_insight:insights.get(contact.id)}));},[contacts,customerInsights]);

  return (
    <AppContext.Provider
      value={{
        user,
        firebaseUser,
        setFirebaseUser,
        authLoading,
        workspaceHydrating,workspaceDataLoading,workspaceDataError,
        isGuestMode,
        setIsGuestMode,
        logout,
        instagramAccount,
        instagramAccounts, workspaceId:workspaceId || firebaseUser?.uid || '', accountSwitching, accountError,
        refreshInstagramAccounts, switchInstagramAccount, startInstagramConnection, instagramConnectMode,
        automations,
        contacts: enrichedContacts,
        inboxMessages,
        webhookLogs,
        pausedAiUsers,
        isAdmin,
        activeTab,
        setActiveTab,
        isBuilderOpen,
        setIsBuilderOpen,
        editingAutomation,
        setEditingAutomation,
        isConnectModalOpen,
        setIsConnectModalOpen,
        isRenewModalOpen,
        setIsRenewModalOpen,
        isAiPausedForUser,
        toggleAiForUser,
        setAiPausedForUser,
        createAutomation,
        updateAutomation,
        deleteAutomation,
        toggleAutomationStatus, isAutomationSaving,
        simulateWebhookEvent,
        triggerWebhookSimulation,
        sendManualReply,
        markInboxThreadRead,
        markInboxThreadUnread,
        deleteContact,
        deleteContactsBulk,
        deleteInboxThread,
        deleteInboxThreadsBulk,
        reauthorizeChannel,
        disconnectChannel,
        connectChannel,
        renewPlan,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
