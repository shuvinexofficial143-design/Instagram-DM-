from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, found {count}')
    return new_text


# -----------------------------------------------------------------------------
# Frontend AppContext: remove client secrets, strip tokens, disable fake connect.
# -----------------------------------------------------------------------------
path = 'src/context/AppContext.tsx'
text = read(path)
text = replace_once(
    text,
    "  app_secret: 'a8f9210c48e8312019b882',\n  webhook_verify_token: 'Nazha125',",
    "  app_secret: '',\n  webhook_verify_token: '',",
    'remove frontend Meta secrets',
)
text = replace_once(
    text,
    "          if (parsed && parsed.username) return parsed;",
    "          if (parsed && parsed.username) {\n            const { access_token: _legacyToken, ...safeParsed } = parsed;\n            return safeParsed as InstagramAccount;\n          }",
    'strip legacy token from localStorage',
)
text = replace_once(
    text,
    """  const setInstagramAccount = (acc: InstagramAccount | null) => {
    setInstagramAccountState(acc);
    try {
      const activeUid = firebaseUser?.uid || auth?.currentUser?.uid;
      if (activeUid) {
        if (acc && acc.username) {
          localStorage.setItem(`autoreply_connected_instagram_account_${activeUid}`, JSON.stringify(acc));
        } else {
          localStorage.removeItem(`autoreply_connected_instagram_account_${activeUid}`);
        }
      }
      localStorage.removeItem('autoreply_connected_instagram_account');
    } catch {}
  };""",
    """  const setInstagramAccount = (acc: InstagramAccount | null) => {
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
  };""",
    'sanitize Instagram state and localStorage',
)
text = replace_once(
    text,
    """    const unsubscribeAccount = subscribeToUserCollection<InstagramAccount>(uid, 'instagram_account', (data) => {
      if (data && data.length > 0 && data[0]?.username) {
        setInstagramAccount(data[0]);
      } else {
        setInstagramAccount(null);
      }
    });""",
    """    const unsubscribeAccount = subscribeToUserCollection<InstagramAccount>(uid, 'instagram_account', (data) => {
      if (data && data.length > 0 && data[0]?.username) {
        const { access_token: _serverOnlyToken, ...safeAccount } = data[0];
        setInstagramAccount(safeAccount as InstagramAccount);
      } else {
        setInstagramAccount(null);
      }
    });""",
    'strip any legacy Firestore access token',
)
text = replace_once(
    text,
    """    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'ig_connected' || event.data?.type === 'ig_connected') {
        if (event.data?.account && event.data.account.username) {
          const formatted = { ...event.data.account, id: 'primary' };
          setInstagramAccount(formatted);
          saveUserDocument(uid, 'instagram_account', formatted).catch(() => {});
        }
        fetchAccountData();
      }
    };""",
    """    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data === 'ig_connected' || event.data?.type === 'ig_connected') {
        // OAuth credentials never cross postMessage. Always re-fetch safe metadata
        // from our authenticated same-origin backend after Meta completes OAuth.
        fetchAccountData();
      }
    };""",
    'harden OAuth postMessage listener',
)
text = regex_once(
    text,
    r"  const connectChannel = async \(accountInput: Partial<InstagramAccount> \| string\) => \{.*?\n  \};\n\n  const renewPlan",
    """  const connectChannel = async (_accountInput: Partial<InstagramAccount> | string) => {
    throw new Error('Direct Instagram connection is disabled. Use the official Meta OAuth flow.');
  };

  const renewPlan""",
    'disable client-side fake/manual connect',
)
write(path, text)


# -----------------------------------------------------------------------------
# Backend: server-only token store, strict OAuth, no false-success connections.
# -----------------------------------------------------------------------------
path = 'server.ts'
text = read(path)
text = replace_once(
    text,
    "import { Agent, setGlobalDispatcher } from 'undici';",
    "import { Agent, setGlobalDispatcher } from 'undici';\nimport { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';",
    'import Firebase Admin Firestore',
)
text = replace_once(
    text,
    """const db: Firestore | null = null;

async function startServer() {""",
    """const db: Firestore | null = null;

let adminDb: ReturnType<typeof getAdminFirestore> | null = null;
try {
  // server-security-bootstrap.mjs initializes the Firebase Admin default app before server.ts.
  // Admin Firestore bypasses client rules and keeps OAuth tokens out of browser-readable paths.
  adminDb = getAdminFirestore();
} catch (err) {
  console.warn('[ADMIN_FIRESTORE_INIT_WARN] Server-only token persistence unavailable; using in-memory fallback.', err);
}

async function startServer() {""",
    'initialize server-only Admin Firestore',
)
text = replace_once(
    text,
    """    webhook_verify_token:
      process.env.WEBHOOK_VERIFY_TOKEN ||
      process.env.VERIFY_TOKEN ||
      'autoreply_meta_verify_secret_token_2026',""",
    """    webhook_verify_token:
      process.env.WEBHOOK_VERIFY_TOKEN ||
      process.env.VERIFY_TOKEN ||
      '',""",
    'remove hardcoded webhook secret fallback',
)
text = replace_once(
    text,
    """  let connectedInstagramAccountMemory: InstagramAccount | null = null;
  const userInstagramAccountsMemory = new Map<string, InstagramAccount>();
  const registeredUsersMemory = new Map<string, any>();

  // Helper: Sanitize & Clean Meta/Instagram Access Tokens""",
    """  let connectedInstagramAccountMemory: InstagramAccount | null = null;
  const userInstagramAccountsMemory = new Map<string, InstagramAccount>();
  const registeredUsersMemory = new Map<string, any>();
  const SERVER_INSTAGRAM_TOKEN_COLLECTION = 'server_instagram_tokens';

  function getInstagramRedirectUri(req: Request): string {
    const host = req.get('host') || 'localhost:3000';
    const proto = String(req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http')).split(',')[0].trim();
    const autoRedirectUri = `${proto}://${host}/api/auth/instagram/callback`;
    const configured = String(metaConfigStore.redirect_uri || '').trim();
    const configuredLooksInvalid =
      !configured ||
      configured.includes('MY_APP_URL') ||
      configured.includes('your-app-url') ||
      (configured.includes('localhost') && !host.includes('localhost'));
    return configuredLooksInvalid ? autoRedirectUri : configured;
  }

  function toClientSafeInstagramAccount(account: InstagramAccount): InstagramAccount {
    const { access_token: _serverOnlyToken, ...safe } = account;
    return safe as InstagramAccount;
  }

  async function persistServerInstagramAccount(userId: string, account: InstagramAccount) {
    const cleanAccount: InstagramAccount = {
      ...account,
      access_token: sanitizeAccessToken(account.access_token || ''),
    };
    userInstagramAccountsMemory.set(userId, cleanAccount);
    connectedInstagramAccountMemory = cleanAccount;

    if (!adminDb) return;
    try {
      await Promise.all([
        adminDb.collection(SERVER_INSTAGRAM_TOKEN_COLLECTION).doc(userId).set(cleanAccount, { merge: true }),
        adminDb
          .collection('users')
          .doc(userId)
          .collection('instagram_account')
          .doc('primary')
          .set(toClientSafeInstagramAccount(cleanAccount), { merge: true }),
      ]);
    } catch (err) {
      console.warn('[SERVER_IG_ACCOUNT_PERSIST_WARN]', err);
    }
  }

  async function loadServerInstagramAccount(userId: string): Promise<InstagramAccount | null> {
    const cached = userInstagramAccountsMemory.get(userId);
    if (cached?.access_token) return cached;
    if (!adminDb) return cached || null;

    try {
      const snap = await adminDb.collection(SERVER_INSTAGRAM_TOKEN_COLLECTION).doc(userId).get();
      if (!snap.exists) return null;
      const account = snap.data() as InstagramAccount;
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
    if (adminDb) {
      try {
        await Promise.all([
          adminDb.collection(SERVER_INSTAGRAM_TOKEN_COLLECTION).doc(userId).delete(),
          adminDb.collection('users').doc(userId).collection('instagram_account').doc('primary').delete(),
        ]);
      } catch (err) {
        console.warn('[SERVER_IG_ACCOUNT_DELETE_WARN]', err);
      }
    }
  }

  // Helper: Sanitize & Clean Meta/Instagram Access Tokens""",
    'add server-only Instagram credential helpers',
)

# Account GET must load from server-only store and never return a token.
text = regex_once(
    text,
    r"    // 2\. Query Firestore under users/\{userId\}/instagram_account/primary\n    if \(!accountData && db\) \{.*?\n    \}\n\n    if \(accountData\?\.access_token\)",
    """    // 2. Load server-only OAuth credentials/metadata if RAM is cold.
    if (!accountData) {
      accountData = await loadServerInstagramAccount(userId);
    }

    if (accountData?.access_token)""",
    'replace client-readable account token fallback',
)
text = replace_once(
    text,
    """      // Return sanitized account object (mask sensitive token in client JSON response)
      const sanitizedAccount = {
        ...accountData,
        access_token: cleanToken ? `${cleanToken.slice(0, 8)}...masked` : '',
      };
      return res.json({ success: true, account: sanitizedAccount });""",
    """      // Never return even a masked credential field to the browser.
      return res.json({ success: true, account: toClientSafeInstagramAccount(accountData) });""",
    'remove access token from account API response',
)

# Manual account POST is disconnect-only; OAuth is the only connection path.
text = regex_once(
    text,
    r"  app\.post\('/api/instagram/account', async \(req: Request, res: Response\) => \{.*?\n  \}\);\n\n  // Contacts Deletion Endpoints",
    """  app.post('/api/instagram/account', async (req: Request, res: Response) => {
    const userId = req.body?.userId as string | undefined;
    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.status(400).json({ success: false, error: 'userId is required for Instagram account operations' });
    }

    if (req.body && 'account' in req.body && req.body.account === null) {
      await deleteServerInstagramAccount(userId);
      return res.json({ success: true, account: null });
    }

    return res.status(405).json({
      success: false,
      error: 'Manual Instagram connection is disabled. Connect through the official Meta OAuth flow.',
    });
  });

  // Contacts Deletion Endpoints""",
    'make account POST disconnect-only',
)

# Meta config is environment-only and never exposes secrets.
text = regex_once(
    text,
    r"  // 2\. Meta Instagram Config Endpoints\n  app\.get\('/api/meta-config'.*?\n  // 3\. Instagram Meta OAuth Auth Flow Endpoint \(Instagram Business Login\)",
    """  // 2. Meta Instagram Config Endpoints — server environment is authoritative.
  app.get('/api/meta-config', (_req: Request, res: Response) => {
    res.json({
      app_id: metaConfigStore.app_id,
      redirect_uri: metaConfigStore.redirect_uri,
      is_configured: Boolean(metaConfigStore.app_id && metaConfigStore.app_secret),
    });
  });

  app.post('/api/meta-config', (_req: Request, res: Response) => {
    return res.status(403).json({
      success: false,
      error: 'Meta credentials are server-only. Configure INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, WEBHOOK_VERIFY_TOKEN and REDIRECT_URI in deployment environment variables.',
    });
  });

  // 3. Instagram Meta OAuth Auth Flow Endpoint (Instagram Business Login)""",
    'lock Meta config to server environment',
)

# OAuth start must use server-controlled app ID/redirect only.
text = regex_once(
    text,
    r"  app\.get\('/api/auth/instagram', \(req: Request, res: Response\) => \{.*?\n  \}\);\n\n  // 4\. Instagram Meta OAuth Callback Endpoint",
    """  app.get('/api/auth/instagram', (req: Request, res: Response) => {
    const appId = metaConfigStore.app_id;
    const clientUserId = (req.query.userId as string) || '';
    const redirectUri = getInstagramRedirectUri(req);

    if (!appId || !metaConfigStore.app_secret) {
      return res.status(503).send('Instagram OAuth is not configured on the server. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET.');
    }

    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
      'instagram_business_content_publish',
    ].join(',');

    const stateObj = { userId: clientUserId, ts: Date.now() };
    const state = encodeURIComponent(JSON.stringify(stateObj));

    const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;

    console.log('[INSTAGRAM_OAUTH_REDIRECT]', { appId, redirectUri, clientUserId });
    res.redirect(instagramAuthUrl);
  });

  // 4. Instagram Meta OAuth Callback Endpoint""",
    'lock OAuth start to server config',
)
text = replace_once(
    text,
    "        formData.append('redirect_uri', metaConfigStore.redirect_uri);",
    "        formData.append('redirect_uri', getInstagramRedirectUri(req));",
    'use identical callback redirect URI during token exchange',
)

# Hard failure: no token/profile = no connected account.
text = replace_once(
    text,
    """    if (!accountUsername) {
      accountUsername = userId ? `creator_${userId.slice(-6)}` : 'connected_creator';
    }
    if (!accountName) {
      accountName = accountUsername;
    }
    if (!profilePicUrl) {
      profilePicUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountUsername}`;
    }

    const cleanFinalToken = sanitizeAccessToken(longLivedToken || shortLivedToken);

    const connectedAccount: InstagramAccount = {
      id: 'primary',
      ig_user_id: String(userId || `ig_user_${accountUsername}`),""",
    """    const cleanFinalToken = sanitizeAccessToken(longLivedToken || shortLivedToken);

    if (!code || !cleanFinalToken || !userId || !accountUsername || !targetUserId) {
      console.error('[INSTAGRAM_OAUTH_HARD_FAILURE]', {
        hasCode: Boolean(code),
        hasToken: Boolean(cleanFinalToken),
        hasInstagramUserId: Boolean(userId),
        hasUsername: Boolean(accountUsername),
        hasAuthenticatedTargetUser: Boolean(targetUserId),
      });
      return res.status(502).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Instagram Connection Failed</title></head>
          <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #f8fafc;">
            <div style="max-width: 460px; margin: 0 auto; background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
              <h2 style="color: #dc2626; margin-top: 0;">Instagram connection failed</h2>
              <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">Meta did not return a verified Instagram professional account and valid access token. Nothing was connected or saved. Close this window and try again.</p>
              <button onclick="window.close()" style="margin-top: 16px; background: #3b5bff; color: white; border: 0; padding: 11px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close</button>
            </div>
          </body>
        </html>
      `);
    }

    if (!accountName) accountName = accountUsername;
    if (!profilePicUrl) {
      profilePicUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountUsername}`;
    }

    const connectedAccount: InstagramAccount = {
      id: 'primary',
      ig_user_id: String(userId),""",
    'hard-fail invalid OAuth callback',
)

# Persist token only in server-only Admin collection; browser-readable metadata is tokenless.
text = regex_once(
    text,
    r"    if \(targetUserId\) \{\n      userInstagramAccountsMemory\.set\(targetUserId, connectedAccount\);\n    \} else \{.*?\n    if \(connectedAccount\.access_token\) \{",
    """    await persistServerInstagramAccount(targetUserId, connectedAccount);
    cachedInstagramAccount = connectedAccount;
    cachedInstagramAccountTimestamp = Date.now();

    if (connectedAccount.access_token) {""",
    'persist OAuth token server-side only',
)

# Success page sends only an event, never account/token data and never wildcard origin.
text = regex_once(
    text,
    r"            <p style=\"color: #6b7280; margin-bottom: 24px; font-size: 14px;\">Instagram Graph API access token exchanged & stored securely in Firestore\.</p>\n            <button onclick=\"navigateDashboard\(\)\">Go to Dashboard</button>\n          </div>\n          <script>\n            const accountData = .*?\n            function navigateDashboard\(\) \{",
    """            <p style=\"color: #6b7280; margin-bottom: 24px; font-size: 14px;\">Meta verified the account successfully. OAuth credentials are stored server-side only.</p>
            <button onclick=\"navigateDashboard()\">Go to Dashboard</button>
          </div>
          <script>
            function sendConnectMessage() {
              if (window.opener) {
                window.opener.postMessage({ type: 'ig_connected' }, window.location.origin);
              }
            }

            function navigateDashboard() {""",
    'remove OAuth token/account data from callback HTML',
)

# Use durable server-only credential store when RAM is cold for authenticated actions.
text = regex_once(
    text,
    r"    let token = userInstagramAccountsMemory\.get\(userId\)\?\.access_token \|\| '';\n    if \(\(!token \|\| token\.includes\('masked'\)\) && db\) \{.*?\n    \}\n\n    const cleanToken",
    """    const storedAccount = await loadServerInstagramAccount(userId);
    const token = storedAccount?.access_token || '';

    const cleanToken""",
    'load server token for profile refresh',
)
text = regex_once(
    text,
    r"    let accessToken = '';\n    let igUserId = '';\n    if \(userId\) \{.*?\n    if \(!accessToken && !userId && connectedInstagramAccountMemory\) \{.*?\n    \}\n\n    if \(!accessToken\)",
    """    let accessToken = '';
    let igUserId = '';
    if (userId) {
      const storedAccount = await loadServerInstagramAccount(userId);
      accessToken = sanitizeAccessToken(storedAccount?.access_token || '');
      igUserId = storedAccount?.ig_user_id || '';
    }

    if (!accessToken)""",
    'load server token for webhook subscription',
)
text = regex_once(
    text,
    r"      let accessToken = '';\n      if \(userId\) \{.*?\n      if \(!accessToken && !userId && connectedInstagramAccountMemory\?\.access_token\) \{.*?\n      \}\n\n      let apiResult",
    """      let accessToken = '';
      if (userId) {
        const storedAccount = await loadServerInstagramAccount(userId);
        accessToken = sanitizeAccessToken(storedAccount?.access_token || '');
      }

      let apiResult""",
    'load server token for manual DM',
)

write(path, text)
print('Production auth + Instagram OAuth hardening patch applied successfully.')
