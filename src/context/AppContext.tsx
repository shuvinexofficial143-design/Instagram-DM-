import React, { createContext, useContext, useState, useEffect } from 'react';
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

interface AppContextType {
  user: UserProfile;
  firebaseUser: User | null;
  setFirebaseUser: (u: User | null) => void;
  authLoading: boolean;
  isGuestMode: boolean;
  setIsGuestMode: (val: boolean) => void;
  logout: () => Promise<void>;
  
  instagramAccount: InstagramAccount | null;
  automations: Automation[];
  contacts: Contact[];
  inboxMessages: InboxMessage[];
  pausedAiUsers: string[];
  isAdmin: boolean;
  activeTab: 'home' | 'automations' | 'contacts' | 'inbox' | 'billing' | 'settings' | 'about' | 'admin';
  setActiveTab: (tab: 'home' | 'automations' | 'contacts' | 'inbox' | 'billing' | 'settings' | 'about' | 'admin') => void;
  
  // Modals & Builder States
  isBuilderOpen: boolean;
  setIsBuilderOpen: (open: boolean) => void;
  editingAutomation: Automation | null;
  setEditingAutomation: (auto: Automation | null) => void;
  isConnectModalOpen: boolean;
  setIsConnectModalOpen: (open: boolean) => void;
  isRenewModalOpen: boolean;
  setIsRenewModalOpen: (open: boolean) => void;

  // AI Conversion Toggle (Human Takeover)
  isAiPausedForUser: (username: string) => boolean;
  toggleAiForUser: (username: string) => void;
  setAiPausedForUser: (username: string, paused: boolean) => void;

  // Actions
  createAutomation: (newAuto: Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'stats'>) => void;
  updateAutomation: (id: string, updates: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
  toggleAutomationStatus: (id: string) => void;
  
  // Simulator & Webhook Engine
  simulateWebhookEvent: (triggerType: TriggerType, username: string, incomingText: string) => Promise<WebhookLogEvent>;
  triggerWebhookSimulation: (params: { trigger_type: TriggerType; username: string; text: string }) => Promise<WebhookLogEvent>;
  
  // Inbox Actions
  sendManualReply: (fromUsername: string, text: string) => void;
  
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
    uname.startsWith('user_') ||
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
    uname.startsWith('user_') ||
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
  status: auto?.status || 'active',
  stats: {
    runs: Number(auto?.stats?.runs) || 0,
    dms_sent: Number(auto?.stats?.dms_sent) || 0,
    unique_users: Number(auto?.stats?.unique_users) || 0,
    open_rate: typeof auto?.stats?.open_rate === 'number' ? auto.stats.open_rate : 98,
  },
  created_at: auto?.created_at || new Date().toISOString(),
  updated_at: auto?.updated_at || new Date().toISOString(),
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
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

  const [instagramAccount, setInstagramAccountState] = useState<InstagramAccount | null>(() => {
    try {
      const activeUid = auth?.currentUser?.uid;
      if (activeUid) {
        const saved = localStorage.getItem(`autoreply_connected_instagram_account_${activeUid}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.username) {
            const { access_token: _legacyToken, ...safeParsed } = parsed;
            return safeParsed as InstagramAccount;
          }
        }
      }
    } catch {}
    return null;
  });

  const setInstagramAccount = (acc: InstagramAccount | null) => {
    const clientSafeAccount = (() => {
      if (!acc) return null;
      const { access_token: _serverOnlyToken, ...safe } = acc;
      return safe as InstagramAccount;
    })();

    setInstagramAccountState(clientSafeAccount);
    try {
      const activeUid = firebaseUser?.uid || auth?.currentUser?.uid;
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [, setLogs] = useState<WebhookLogEvent[]>([]);
  const [pausedAiUsers, setPausedAiUsers] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'home' | 'automations' | 'contacts' | 'inbox' | 'billing' | 'settings' | 'about' | 'admin'>('home');
  const [isBuilderOpen, setIsBuilderOpen] = useState<boolean>(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState<boolean>(false);

  // 1. Listen for Supabase Auth State Changes & Silent Background Init
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;

    // Handle any incoming redirect result (e.g. from Google Sign-In redirect on mobile/desktop)
    getRedirectResult(auth)
      .then(async (result) => {
        if (!isMounted) return;
        if (result && result.user) {
          console.log('[SUPABASE_REDIRECT_SUCCESS] Successfully authenticated via redirect:', result.user.email);
          setFirebaseUser(result.user);
          setIsGuestMode(false);
          const userProfile: UserProfile = {
            id: result.user.uid,
            name: result.user.displayName || result.user.email?.split('@')[0] || 'Creator Admin',
            email: result.user.email || 'admin@autoreply.io',
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
      setFirebaseUser(currUser);
      if (currUser) {
        setIsGuestMode(false);
        const userProfile: UserProfile = {
          id: currUser.uid,
          name: currUser.displayName || currUser.email?.split('@')[0] || 'Creator Admin',
          email: currUser.email || 'admin@autoreply.io',
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

  // Check Admin privileges & sync the user profile to Supabase.
  useEffect(() => {
    const currentEmail = firebaseUser?.email || user?.email || '';
    if (!currentEmail) {
      setIsAdmin(false);
      return;
    }

    const checkAdminStatus = async () => {
      try {
        const res = await fetch(`/api/admin/check-access?email=${encodeURIComponent(currentEmail)}`);
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(Boolean(data.isAdmin));
        } else {
          setIsAdmin(currentEmail.toLowerCase() === 'devsinghparmar9589@gmail.com');
        }
      } catch {
        setIsAdmin(currentEmail.toLowerCase() === 'devsinghparmar9589@gmail.com');
      }
    };

    checkAdminStatus();

    // Sync the authenticated profile to Supabase.
    if (firebaseUser?.uid && currentEmail) {
      const isOwnerAdmin = currentEmail.toLowerCase() === 'devsinghparmar9589@gmail.com';
      const profileData = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        email: currentEmail,
        displayName: firebaseUser.displayName || user?.name || currentEmail.split('@')[0],
        photoURL: firebaseUser.photoURL || '',
        created_at: firebaseUser.metadata?.creationTime || new Date().toISOString(),
        last_login_at: firebaseUser.metadata?.lastSignInTime || new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        role: isOwnerAdmin ? 'admin' : 'user',
      };

      // Write profile data through the Supabase-backed client helper.
      syncUserProfileDocument(firebaseUser.uid, profileData);

      // Also synchronize the server-side profile registry. for Admin panel
      fetch('/api/user/sync-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      }).catch(() => {});
    }
  }, [firebaseUser, user?.email]);

  // 2. Multi-Tenant Firestore Synchronization (Strictly scoped by active authenticated user UID)
  useEffect(() => {
    if (!isSupabaseInitialized) {
      return;
    }

    const uid = firebaseUser?.uid;
    if (!uid) {
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
          }));

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
    setAutomations([]);
    setContacts([]);
    setInboxMessages([]);
    const unsubscribeAutomations = subscribeToUserCollection<Automation>(uid, 'automations', (data) => {
      if (data) {
        const sanitized: Automation[] = data.map(sanitizeAutomationRecord);
        setAutomations(sanitized);
      } else {
        setAutomations([]);
      }
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
          status: c.status || 'converted',
        }));
        setContacts(filterOutMockContacts(sanitized));
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
        }));
        const filtered = filterOutMockMessages(sanitized);
        setInboxMessages(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        setInboxMessages([]);
      }
    });

    const unsubscribeAccount = subscribeToUserCollection<InstagramAccount>(uid, 'instagram_account', (data) => {
      if (data && data.length > 0 && data[0]?.username) {
        const { access_token: _serverOnlyToken, ...safeAccount } = data[0];
        setInstagramAccount(safeAccount as InstagramAccount);
      } else {
        setInstagramAccount(null);
      }
    });

    return () => {
      unsubscribeAutomations();
      unsubscribeContacts();
      unsubscribeInbox();
      unsubscribeAccount();
    };
  }, [firebaseUser?.uid, isSupabaseInitialized]);

  // AI Human Takeover state
  const isAiPausedForUser = (username: string): boolean => {
    if (!username) return false;
    const clean = username.replace(/^@/, '').toLowerCase();
    return pausedAiUsers.some((u) => u.toLowerCase() === clean);
  };

  const toggleAiForUser = (username: string) => {
    if (!username) return;
    const clean = username.replace(/^@/, '').toLowerCase();
    setPausedAiUsers((prev) => {
      const exists = prev.some((u) => u.toLowerCase() === clean);
      if (exists) {
        return prev.filter((u) => u.toLowerCase() !== clean);
      } else {
        return [...prev, clean];
      }
    });
  };

  const setAiPausedForUser = (username: string, paused: boolean) => {
    if (!username) return;
    const clean = username.replace(/^@/, '').toLowerCase();
    setPausedAiUsers((prev) => {
      const exists = prev.some((u) => u.toLowerCase() === clean);
      if (paused && !exists) {
        return [...prev, clean];
      } else if (!paused && exists) {
        return prev.filter((u) => u.toLowerCase() !== clean);
      }
      return prev;
    });
  };

  // 3. Handle OAuth callback parameters, window postMessage events, and initial account load.
  // When there is no app login, the backend uses a secure HttpOnly guest-workspace cookie.
  useEffect(() => {
    const uid = firebaseUser?.uid;

    const fetchAccountData = async () => {
      if (!uid) {
        setInstagramAccountState(null);
        return;
      }

      // Authenticated workspaces are isolated by the Google/Supabase user id.
      // Never hydrate one signed-in user's Instagram account from the shared guest cookie.
      try {
        const saved = await import('../lib/supabase').then(({ getUserDocument }) =>
          getUserDocument<InstagramAccount>(uid, 'instagram_account', 'primary')
        );
        if (saved?.username) {
          const { access_token: _serverOnlyToken, ...safeAccount } = saved as any;
          setInstagramAccountState(safeAccount as InstagramAccount);
        } else {
          setInstagramAccountState(null);
        }
      } catch (err) {
        console.warn('[FETCH_USER_IG_ACCOUNT_ERR]', err);
        setInstagramAccountState(null);
      }
    };

    fetchAccountData();

    const searchParams = new URLSearchParams(window.location.search);
    const statusParam = searchParams.get('status');

    if (statusParam === 'ig_connected') {
      fetchAccountData();
      if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.pathname + (window.location.hash || '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data === 'ig_connected' || event.data?.type === 'ig_connected') {
        // OAuth credentials never cross postMessage. Re-fetch only safe metadata.
        fetchAccountData();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [firebaseUser?.uid]);

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
    setActiveTab('home');
  };

  // Automation CRUD. Authenticated users use Supabase RLS directly;
  // no-login users persist under their secure guest workspace cookie.
  const persistGuestAutomation = async (automation: Automation) => {
    const response = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ automation }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Automation could not be saved.');
    }

    if (Array.isArray(payload?.pausedAutomationIds) && payload.pausedAutomationIds.length) {
      const paused = new Set<string>(payload.pausedAutomationIds);
      setAutomations((prev) =>
        prev.map((item) =>
          paused.has(item.id)
            ? { ...item, status: 'paused', updated_at: new Date().toISOString() }
            : item
        )
      );
    }

    return payload;
  };

  const persistAutomationRecord = (
    automation: Automation,
    uid: string | undefined
  ) => {
    if (uid) {
      saveUserDocument(uid, 'automations', automation).catch((err) =>
        console.warn('[AUTOMATION_SAVE_WARN]', err?.message || err)
      );
      return;
    }

    persistGuestAutomation(automation).catch((err) =>
      console.warn('[GUEST_AUTOMATION_SAVE_WARN]', err?.message || err)
    );
  };

  const hasDuplicateAutomationName = (name: string, exceptId?: string) =>
    automations.some(
      (auto) =>
        auto.id !== exceptId &&
        auto.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()
    );

  const createAutomation = (
    newAuto: Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'stats'>
  ) => {
    const uid = firebaseUser?.uid;
    const now = new Date().toISOString();
    const cleanName = newAuto.name.trim();

    if (hasDuplicateAutomationName(cleanName)) {
      console.warn('[AUTOMATION_NAME_DUPLICATE]', cleanName);
      return;
    }

    const created: Automation = {
      ...newAuto,
      name: cleanName,
      id: `auto_${Date.now()}`,
      created_at: now,
      updated_at: now,
      stats: {
        runs: 0,
        dms_sent: 0,
        unique_users: 0,
        open_rate: 100,
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

    for (const paused of pausedOthers) persistAutomationRecord(paused, uid);
    persistAutomationRecord(created, uid);
  };

  const updateAutomation = (id: string, updates: Partial<Automation>) => {
    const uid = firebaseUser?.uid;
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

    for (const paused of pausedOthers) persistAutomationRecord(paused, uid);
    persistAutomationRecord(updated, uid);
  };

  const deleteAutomation = (id: string) => {
    const uid = firebaseUser?.uid;
    setAutomations((prev) => prev.filter((auto) => auto.id !== id));

    if (uid) {
      removeUserDocument(uid, 'automations', id).catch((err) =>
        console.warn('[AUTOMATION_DELETE_SAVE_WARN]', err?.message || err)
      );
    } else {
      fetch(`/api/automations?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      }).catch((err) =>
        console.warn('[GUEST_AUTOMATION_DELETE_WARN]', err?.message || err)
      );
    }
  };

  const toggleAutomationStatus = (id: string) => {
    const uid = firebaseUser?.uid;
    const current = automations.find((auto) => auto.id === id);
    if (!current) return;

    const now = new Date().toISOString();
    const nextStatus = current.status === 'active' ? 'paused' : 'active';
    const updated: Automation = {
      ...current,
      status: nextStatus,
      updated_at: now,
    };

    const shouldBeOnlyLiveDmAi =
      updated.trigger_type === 'dm_ai_conversation' && nextStatus === 'active';

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

    for (const paused of pausedOthers) persistAutomationRecord(paused, uid);
    persistAutomationRecord(updated, uid);
  };

  // Simulator & Webhook Engine implementation
  const simulateWebhookEvent = async (triggerType: TriggerType, username: string, incomingText: string): Promise<WebhookLogEvent> => {
    const uid = firebaseUser?.uid;
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
      if (firebaseUser?.uid) saveUserDocument(firebaseUser.uid, 'inbox_messages', newInMsg);

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
      if (firebaseUser?.uid) saveUserDocument(firebaseUser.uid, 'webhook_logs', logEntry);
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
      if (firebaseUser?.uid) saveUserDocument(firebaseUser.uid, 'webhook_logs', logEntry);
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

    const userUid = uid || firebaseUser?.uid;
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

    // Update Automation Stats
    updateAutomation(matched.id, {
      stats: {
        ...matched.stats,
        runs: (matched.stats?.runs || 0) + 1,
        dms_sent: (matched.stats?.dms_sent || 0) + 1,
      },
    });

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
    const uid = firebaseUser?.uid;
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
    };

    setInboxMessages((prev) => [newOutMsg, ...prev]);
    saveUserDocument(uid, 'inbox_messages', newOutMsg);

    // Auto pause AI for this contact since human intervened
    setAiPausedForUser(cleanUser, true);

    // Dispatch live Instagram Graph API call to send message to recipient
    try {
      await fetch('/api/instagram/send-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUsername: cleanUser,
          messageText: text.trim(),
          userId: uid,
        }),
      });
    } catch (err) {
      console.warn('[SEND_MANUAL_DM_DISPATCH_WARN]', err);
    }
  };

  // Contacts & Inbox Deletion (Scoped strictly by user UID)
  const deleteContact = async (contactId: string, username?: string) => {
    if (!contactId && !username) return;
    const uid = firebaseUser?.uid;
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
    const uid = firebaseUser?.uid;
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
    const uid = firebaseUser?.uid;
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
    const uid = firebaseUser?.uid;
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
    setIsConnectModalOpen(true);
  };

  const disconnectChannel = async () => {
    const uid = firebaseUser?.uid || user?.id || '';
    setInstagramAccount(null);
    try {
      localStorage.removeItem('autoreply_connected_instagram_account');
    } catch {}

    if (uid && firebaseUser) {
      await removeUserDocument(uid, 'instagram_account', 'primary');
      if (instagramAccount?.id) {
        await removeUserDocument(uid, 'instagram_account', instagramAccount.id);
      }
    }
    try {
      await fetch('/api/instagram/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ account: null }),
      });
    } catch (err) {
      console.warn('[DISCONNECT_CHANNEL_ERR]', err);
    }
  };

  const connectChannel = async (_accountInput: Partial<InstagramAccount> | string) => {
    throw new Error('Direct Instagram connection is disabled. Use the official Meta OAuth flow.');
  };

  const renewPlan = (nextPlan: 'free' | 'starter' | 'pro' | 'business' = 'pro') => {
    const limits = {
      free: { messages: 1500, ai: 1000 },
      starter: { messages: 7500, ai: 5000 },
      pro: { messages: 25000, ai: 15000 },
      business: { messages: 75000, ai: 40000 },
    };
    setUser((prev) => {
      const currentPlan = String(prev.plan || 'free') as keyof typeof limits;
      const current = limits[currentPlan] || limits.free;
      const isFirstFreeUpgrade = currentPlan === 'free' && nextPlan !== 'free';
      return {
        ...prev,
        plan: nextPlan,
        message_usage: 0,
        ai_reply_usage: 0,
        carry_forward_messages: isFirstFreeUpgrade ? Math.max(0, current.messages - Number(prev.message_usage || 0)) : Number(prev.carry_forward_messages || 0),
        carry_forward_ai_replies: isFirstFreeUpgrade ? Math.max(0, current.ai - Number(prev.ai_reply_usage || 0)) : Number(prev.carry_forward_ai_replies || 0),
        carry_forward_expires_at: isFirstFreeUpgrade ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : prev.carry_forward_expires_at,
        trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    });
    setIsRenewModalOpen(false);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        firebaseUser,
        setFirebaseUser,
        authLoading,
        isGuestMode,
        setIsGuestMode,
        logout,
        instagramAccount,
        automations,
        contacts,
        inboxMessages,
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
        toggleAutomationStatus,
        simulateWebhookEvent,
        triggerWebhookSimulation,
        sendManualReply,
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
