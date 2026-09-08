import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserProfile,
  InstagramAccount,
  Automation,
  Contact,
  InboxMessage,
  MetaConfig,
  WebhookLogEvent,
  TriggerType,
  GeminiApiKeyItem,
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
  isFirebaseInitialized,
} from '../lib/firebase';
import { generateGeminiChatReply } from '../lib/geminiKeyRotator';

const defaultMetaConfig: MetaConfig = {
  app_id: '2300969844066002',
  app_secret: '',
  webhook_verify_token: '',
  redirect_uri: `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/auth/instagram/callback`,
};

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
  metaConfig: MetaConfig;
  logs: WebhookLogEvent[];
  geminiKeys: GeminiApiKeyItem[];
  pausedAiUsers: string[];
  isAdmin: boolean;
  activeTab: 'home' | 'automations' | 'contacts' | 'inbox' | 'settings' | 'about' | 'admin';
  setActiveTab: (tab: 'home' | 'automations' | 'contacts' | 'inbox' | 'settings' | 'about' | 'admin') => void;
  
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
  
  // Gemini Keys Management
  addGeminiKey: (key: string, label: string) => void;
  deleteGeminiKey: (id: string) => void;
  updateGeminiKey: (id: string, updates: Partial<GeminiApiKeyItem>) => void;

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
  updateMetaConfig: (config: Partial<MetaConfig>) => void;
  reauthorizeChannel: () => void;
  disconnectChannel: () => Promise<void>;
  connectChannel: (account: Partial<InstagramAccount> | string) => Promise<void>;
  renewPlan: () => void;
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
    name: 'Creator',
    email: '',
    avatar_url: '',
    plan: 'pro',
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
  const [metaConfig, setMetaConfig] = useState<MetaConfig>(defaultMetaConfig);
  const [logs, setLogs] = useState<WebhookLogEvent[]>([]);
  const [geminiKeys, setGeminiKeys] = useState<GeminiApiKeyItem[]>([]);
  const [pausedAiUsers, setPausedAiUsers] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'home' | 'automations' | 'contacts' | 'inbox' | 'settings' | 'about' | 'admin'>('home');
  const [isBuilderOpen, setIsBuilderOpen] = useState<boolean>(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState<boolean>(false);

  // 1. Listen for Firebase Auth State Changes & Silent Background Init
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
          console.log('[FIREBASE_REDIRECT_SUCCESS] Successfully authenticated via redirect:', result.user.email);
          setFirebaseUser(result.user);
          setIsGuestMode(false);
          const userProfile: UserProfile = {
            id: result.user.uid,
            name: result.user.displayName || result.user.email?.split('@')[0] || 'Creator Admin',
            email: result.user.email || 'admin@autoreply.io',
            avatar_url: result.user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${result.user.uid}`,
            plan: 'pro',
            trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: result.user.metadata.creationTime || new Date().toISOString(),
          };
          setUser(userProfile);
          setAuthLoading(false);
        }
      })
      .catch((rErr: any) => {
        if (!isMounted) return;
        console.warn('[FIREBASE_REDIRECT_CHECK_WARN]', rErr?.code, rErr?.message);
        if (rErr?.code === 'auth/unauthorized-domain') {
          console.error(
            `[UNAUTHORIZED_DOMAIN] Domain "${window.location.hostname}" is not authorized in Firebase Console -> Authentication -> Settings -> Authorized Domains!`
          );
        }
      })
      .finally(() => {
        try {
          sessionStorage.removeItem('firebase_redirect_pending');
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
          avatar_url: currUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currUser.uid}`,
          plan: 'pro',
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

  // Check Admin privileges & sync user profile to backend Firestore
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

    // Sync profile to Firestore users/{uid} collection directly via authenticated client SDK
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

      // 1. Write directly to Firestore using client authenticated session (satisfies isOwner(userId))
      syncUserProfileDocument(firebaseUser.uid, profileData);

      // 2. Synchronize to server in-memory registry for Admin panel
      fetch('/api/user/sync-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      }).catch(() => {});
    }
  }, [firebaseUser, user?.email]);

  // 2. Multi-Tenant Firestore Synchronization (Strictly scoped by active authenticated user UID)
  useEffect(() => {
    if (!isFirebaseInitialized) {
      return;
    }

    const uid = firebaseUser?.uid;
    if (!uid) {
      // User is not logged in: clear multi-tenant data collections
      setAutomations([]);
      setContacts([]);
      setInboxMessages([]);
      setLogs([]);
      setGeminiKeys([]);
      return;
    }

    // Immediately reset collection state for this session
    setAutomations([]);
    setContacts([]);
    setInboxMessages([]);
    setLogs([]);
    setGeminiKeys([]);

    const unsubscribeAutomations = subscribeToUserCollection<Automation>(uid, 'automations', (data) => {
      if (data) {
        const sanitized: Automation[] = data.map((auto) => ({
          ...auto,
          id: auto.id || `auto_${Date.now()}`,
          name: auto.name || 'Untitled Automation',
          trigger_type: auto.trigger_type || 'dm',
          trigger_config: {
            all_or_keywords: auto.trigger_config?.all_or_keywords || 'keywords',
            keywords: Array.isArray(auto.trigger_config?.keywords) ? auto.trigger_config.keywords : [],
            smart_matching: auto.trigger_config?.smart_matching ?? true,
            story_scope: auto.trigger_config?.story_scope || 'any_story',
            post_scope: auto.trigger_config?.post_scope || 'any_post',
            specific_post_url: auto.trigger_config?.specific_post_url || '',
          },
          actions: Array.isArray(auto.actions) ? auto.actions : [],
          status: auto.status || 'active',
          stats: {
            runs: Number(auto.stats?.runs) || 0,
            dms_sent: Number(auto.stats?.dms_sent) || 0,
            unique_users: Number(auto.stats?.unique_users) || 0,
            open_rate: typeof auto.stats?.open_rate === 'number' ? auto.stats.open_rate : 98,
          },
          created_at: auto.created_at || new Date().toISOString(),
          updated_at: auto.updated_at || new Date().toISOString(),
        }));
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

    const unsubscribeLogs = subscribeToUserCollection<WebhookLogEvent>(uid, 'webhook_logs', (data) => {
      if (data) {
        setLogs(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        setLogs([]);
      }
    });

    const unsubscribeKeys = subscribeToUserCollection<GeminiApiKeyItem>(uid, 'gemini_api_keys', (data) => {
      if (data) {
        setGeminiKeys(data);
      } else {
        setGeminiKeys([]);
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
      unsubscribeLogs();
      unsubscribeKeys();
      unsubscribeAccount();
    };
  }, [firebaseUser?.uid, isFirebaseInitialized]);

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

  // 3. Handle OAuth callback parameters, window postMessage events, and initial account load
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setInstagramAccount(null);
      return;
    }

    const fetchAccountData = async () => {
      try {
        const res = await fetch(`/api/instagram/account?userId=${encodeURIComponent(uid)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.account && data.account.username) {
            const formatted = { ...data.account, id: 'primary' };
            setInstagramAccount(formatted);
            saveUserDocument(uid, 'instagram_account', formatted).catch(() => {});
          } else {
            setInstagramAccount(null);
          }
        }
      } catch (err) {
        console.warn('[FETCH_IG_ACCOUNT_ERR]', err);
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
        // OAuth credentials never cross postMessage. Always re-fetch safe metadata
        // from our authenticated same-origin backend after Meta completes OAuth.
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
    setGeminiKeys([]);
    setActiveTab('home');
  };

  // Automation CRUD (Scoped strictly by user UID)
  const createAutomation = (newAuto: Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'stats'>) => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    const created: Automation = {
      ...newAuto,
      id: `auto_${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stats: {
        runs: 0,
        dms_sent: 0,
        unique_users: 0,
        open_rate: 100,
      },
    };
    setAutomations((prev) => [created, ...prev]);
    saveUserDocument(uid, 'automations', created);
  };

  const updateAutomation = (id: string, updates: Partial<Automation>) => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    setAutomations((prev) =>
      prev.map((auto) => {
        if (auto.id === id) {
          const updated = { ...auto, ...updates, updated_at: new Date().toISOString() };
          saveUserDocument(uid, 'automations', updated);
          return updated;
        }
        return auto;
      })
    );
  };

  const deleteAutomation = (id: string) => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    setAutomations((prev) => prev.filter((auto) => auto.id !== id));
    removeUserDocument(uid, 'automations', id);
  };

  const toggleAutomationStatus = (id: string) => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    setAutomations((prev) =>
      prev.map((auto) => {
        if (auto.id === id) {
          const updated = { ...auto, status: auto.status === 'active' ? ('paused' as const) : ('active' as const) };
          saveUserDocument(uid, 'automations', updated);
          return updated;
        }
        return auto;
      })
    );
  };

  // Gemini Key Management Actions (Scoped strictly by user UID)
  const addGeminiKey = (key: string, label: string) => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    const newKeyItem: GeminiApiKeyItem = {
      id: `key_${Date.now()}`,
      key: key.trim(),
      label: label.trim(),
      status: 'active',
      cooldownUntil: null,
      requestCount: 0,
      errorCount: 0,
      lastUsedAt: new Date().toISOString(),
    };
    setGeminiKeys((prev) => [newKeyItem, ...prev]);
    saveUserDocument(uid, 'gemini_api_keys', newKeyItem);
  };

  const deleteGeminiKey = (id: string) => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    setGeminiKeys((prev) => prev.filter((k) => k.id !== id));
    removeUserDocument(uid, 'gemini_api_keys', id);
  };

  const updateGeminiKey = (id: string, updates: Partial<GeminiApiKeyItem>) => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    setGeminiKeys((prev) =>
      prev.map((k) => {
        if (k.id === id) {
          const updated = { ...k, ...updates };
          saveUserDocument(uid, 'gemini_api_keys', updated);
          return updated;
        }
        return k;
      })
    );
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
      // Limit context history to last 2 messages for ultra-fast processing
      const previousHistory = (inboxMessages || [])
        .filter((m) => m?.from_username?.toLowerCase() === cleanUser)
        .sort((a, b) => new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime())
        .slice(-2)
        .map((m) => ({
          role: (m.direction === 'in' ? 'user' : 'model') as 'user' | 'model',
          text: m.message_text || '',
        }));

      try {
        const aiResponse = await generateGeminiChatReply({
          history: previousHistory,
          incomingText,
          systemInstruction: aiAction.ai_system_instruction || 'You are a helpful and polite Instagram assistant. Reply directly in 1 short sentence.',
          model: (aiAction.ai_model as any) || 'gemini-3.1-flash-lite',
          maxOutputTokens: 60,
        });
        responseSummary = aiResponse.reply;
      } catch (err: any) {
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

  const updateMetaConfig = (config: Partial<MetaConfig>) => {
    setMetaConfig((prev) => ({ ...prev, ...config }));
  };

  const reauthorizeChannel = () => {
    setIsConnectModalOpen(true);
  };

  const disconnectChannel = async () => {
    const uid = firebaseUser?.uid || user?.id || 'creator_primary';
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
        body: JSON.stringify({ account: null, userId: uid }),
      });
    } catch (err) {
      console.warn('[DISCONNECT_CHANNEL_ERR]', err);
    }
  };

  const connectChannel = async (_accountInput: Partial<InstagramAccount> | string) => {
    throw new Error('Direct Instagram connection is disabled. Use the official Meta OAuth flow.');
  };

  const renewPlan = () => {
    setUser((prev) => ({
      ...prev,
      plan: 'pro',
      trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }));
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
        metaConfig,
        logs,
        geminiKeys,
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
        addGeminiKey,
        deleteGeminiKey,
        updateGeminiKey,
        simulateWebhookEvent,
        triggerWebhookSimulation,
        sendManualReply,
        deleteContact,
        deleteContactsBulk,
        deleteInboxThread,
        deleteInboxThreadsBulk,
        updateMetaConfig,
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
