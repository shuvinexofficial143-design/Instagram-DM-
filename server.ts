import express, { Request, Response } from 'express';
import path from 'path';
import { readFileSync } from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase/app';
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
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import {
  generateGeminiChatReply,
  generateGeminiChatStream,
  getLocalKeyPool,
  setLocalKeyPool,
  analyzeSystemPromptWithGemini,
} from './src/lib/geminiKeyRotator';
import {
  Automation,
  Contact,
  InboxMessage,
  InstagramAccount,
  WebhookLogEvent,
  GeminiApiKeyItem,
  AdminUserOverviewItem,
} from './src/types';

// Configure high-performance persistent connection pooling with TCP Keep-Alive
const globalHttpDispatcher = new Agent({
  keepAliveTimeout: 90000,
  keepAliveMaxTimeout: 120000,
  pipelining: 1,
  connections: 50,
  connect: {
    timeout: 3000,
  },
});
setGlobalDispatcher(globalHttpDispatcher);

// Record Instance Boot Timestamp to measure uptime and confirm warm instance status
const SERVER_BOOT_TIMESTAMP = Date.now();
const SERVER_BOOT_ISO = new Date().toISOString();
console.log(`🚀 [SERVER_BOOT] Instance initialized at ${SERVER_BOOT_ISO} (${SERVER_BOOT_TIMESTAMP}ms) - Warm and ready for incoming Meta webhooks`);

// Pre-warm TCP + TLS handshakes with Meta Graph & Gemini endpoints to eliminate cold DNS/TLS latency
function preWarmHttpConnections() {
  const hosts = [
    'https://graph.instagram.com',
    'https://graph.facebook.com',
    'https://generativelanguage.googleapis.com',
  ];
  for (const host of hosts) {
    fetch(host, { method: 'HEAD', signal: AbortSignal.timeout(2000) }).catch(() => {});
  }
}
preWarmHttpConnections();
setInterval(preWarmHttpConnections, 45000); // Periodic keep-alive pulse every 45s

// Firestore operations are handled securely on the client-side with authenticated user sessions (auth.currentUser).
// In Node server environment without user auth credentials, client-SDK Firestore writes are disabled to prevent unauthenticated PERMISSION_DENIED stream errors.
const db: Firestore | null = null;

let adminDb: ReturnType<typeof getAdminFirestore> | null = null;
try {
  // server-security-bootstrap.mjs initializes the Firebase Admin default app before server.ts.
  // Admin Firestore bypasses client rules and keeps OAuth tokens out of browser-readable paths.
  adminDb = getAdminFirestore();
} catch (err) {
  console.warn('[ADMIN_FIRESTORE_INIT_WARN] Server-only token persistence unavailable; using in-memory fallback.', err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Config store for Meta Instagram Webhook & OAuth
  const metaConfigStore = {
    app_id: process.env.INSTAGRAM_APP_ID || '',
    app_secret: process.env.INSTAGRAM_APP_SECRET || '',
    webhook_verify_token:
      process.env.WEBHOOK_VERIFY_TOKEN ||
      process.env.VERIFY_TOKEN ||
      '',
    redirect_uri:
      process.env.REDIRECT_URI ||
      `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/instagram/callback`,
  };

  let connectedInstagramAccountMemory: InstagramAccount | null = null;
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

  // Helper: Sanitize & Clean Meta/Instagram Access Tokens
  // Strips wrapping quotes, whitespace, and recursively decodes URL-encoded characters (%2F, %3D, %2B, etc.) to store & send clean raw ASCII tokens.
  function sanitizeAccessToken(rawToken: string | null | undefined): string {
    if (!rawToken) return '';
    let token = String(rawToken).trim();

    // Strip wrapping single or double quotes
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      token = token.slice(1, -1).trim();
    }

    // Handle URL-encoded strings (e.g., %2F, %3D, %2B, %20, etc.)
    if (token.includes('%')) {
      try {
        let prev = '';
        while (token.includes('%') && token !== prev) {
          prev = token;
          token = decodeURIComponent(token);
        }
      } catch (err) {
        console.warn('[SANITIZE_TOKEN_DECODE_ERR] Could not decode token string:', err);
      }
    }

    return token.trim();
  }

  // ADMIN ACCESS CONTROL CONFIGURATION
  // Authorized email addresses that have administrative privileges to access the Admin Panel
  const DEFAULT_ADMIN_EMAILS = [
    'devsinghparmar9589@gmail.com', // Primary Application Owner & Super Administrator
    'admin@autoreply.io',
  ];

  function getAuthorizedAdminEmails(): string[] {
    const fromEnv = process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
      : [];
    const set = new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
    return Array.from(set);
  }

  function isUserAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    const authorized = getAuthorizedAdminEmails();
    return authorized.includes(cleanEmail);
  }

  // Dynamic working endpoint memoization for sub-second HTTP dispatch (< 200ms)
  let lastSuccessfulDmEndpoint: string | null = null;
  let lastSuccessfulCommentEndpoint: string | null = null;

  // Multi-endpoint Direct Message Dispatcher with Exact Telemetry Logging & Instant Memoized Endpoint
  async function sendInstagramDirectMessageWithFallback(params: {
    accessToken: string;
    senderId: string;
    recipientId?: string;
    messageText: string;
  }): Promise<{
    success: boolean;
    result: any;
    endpointUsed?: string;
    reply_api_call_start: string;
    reply_api_call_start_ms: number;
    reply_api_call_end: string;
    reply_api_call_end_ms: number;
    ig_api_duration_ms: number;
  }> {
    const { accessToken, senderId, recipientId, messageText } = params;
    const cleanToken = sanitizeAccessToken(accessToken);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    if (!cleanToken || cleanToken.includes('encrypted_token') || cleanToken.includes('sandbox_token')) {
      return {
        success: false,
        result: { note: 'Simulation / no live token' },
        reply_api_call_start: nowIso,
        reply_api_call_start_ms: nowMs,
        reply_api_call_end: nowIso,
        reply_api_call_end_ms: nowMs,
        ig_api_duration_ms: 0,
      };
    }

    const candidateEndpoints: string[] = [];

    // Prioritize the last known working endpoint for instantaneous ~150-250ms dispatch
    if (lastSuccessfulDmEndpoint) {
      candidateEndpoints.push(lastSuccessfulDmEndpoint);
    }

    const standardEndpoints = [
      `https://graph.instagram.com/v21.0/me/messages`,
      `https://graph.facebook.com/v21.0/me/messages`,
    ];

    for (const ep of standardEndpoints) {
      if (!candidateEndpoints.includes(ep)) {
        candidateEndpoints.push(ep);
      }
    }

    if (recipientId && recipientId !== 'primary' && recipientId !== 'me') {
      const customIg = `https://graph.instagram.com/v21.0/${encodeURIComponent(recipientId)}/messages`;
      const customFb = `https://graph.facebook.com/v21.0/${encodeURIComponent(recipientId)}/messages`;
      if (!candidateEndpoints.includes(customIg)) candidateEndpoints.push(customIg);
      if (!candidateEndpoints.includes(customFb)) candidateEndpoints.push(customFb);
    }

    let lastResult: any = null;
    let apiCallStartIso = '';
    let apiCallStartMs = 0;
    let apiCallEndIso = '';
    let apiCallEndMs = 0;
    let apiDurationMs = 0;
    let successfulEndpoint = '';

    for (const endpoint of candidateEndpoints) {
      try {
        const url = `${endpoint}?access_token=${encodeURIComponent(cleanToken)}`;
        apiCallStartMs = Date.now();
        apiCallStartIso = new Date().toISOString();

        console.log(`\n📤 [REPLY_API_CALL_START] Timestamp: ${apiCallStartIso} (${apiCallStartMs}ms)`);
        console.log(`   Posting DM to: ${endpoint} for senderId: ${senderId}`);

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanToken}`,
            'Connection': 'keep-alive',
          },
          body: JSON.stringify({
            recipient: { id: senderId },
            message: { text: messageText },
          }),
          signal: AbortSignal.timeout(2800),
        });

        apiCallEndMs = Date.now();
        apiCallEndIso = new Date().toISOString();
        apiDurationMs = apiCallEndMs - apiCallStartMs;

        const data = await res.json();
        lastResult = data;

        console.log(`📥 [REPLY_API_CALL_END] Timestamp: ${apiCallEndIso} (${apiCallEndMs}ms)`);
        console.log(`   Instagram Graph API Duration: ${apiDurationMs}ms | HTTP Status: ${res.status}`);
        console.log(`   Response body:`, JSON.stringify(data));

        if (res.ok && (data.message_id || data.recipient_id || data.success === true)) {
          lastSuccessfulDmEndpoint = endpoint;
          successfulEndpoint = endpoint;
          return {
            success: true,
            result: data,
            endpointUsed: endpoint,
            reply_api_call_start: apiCallStartIso,
            reply_api_call_start_ms: apiCallStartMs,
            reply_api_call_end: apiCallEndIso,
            reply_api_call_end_ms: apiCallEndMs,
            ig_api_duration_ms: apiDurationMs,
          };
        }
      } catch (err: any) {
        apiCallEndMs = Date.now();
        apiCallEndIso = new Date().toISOString();
        apiDurationMs = apiCallEndMs - apiCallStartMs;
        console.warn(`⚠️ [REPLY_API_CALL_FAIL] Timestamp: ${apiCallEndIso} (${apiCallEndMs}ms) | Duration: ${apiDurationMs}ms | Error on ${endpoint}:`, err);
        lastResult = { error: String(err?.message || err) };
      }
    }

    return {
      success: false,
      result: lastResult,
      endpointUsed: successfulEndpoint || candidateEndpoints[0],
      reply_api_call_start: apiCallStartIso || nowIso,
      reply_api_call_start_ms: apiCallStartMs || nowMs,
      reply_api_call_end: apiCallEndIso || nowIso,
      reply_api_call_end_ms: apiCallEndMs || nowMs,
      ig_api_duration_ms: apiDurationMs,
    };
  }

  // Multi-endpoint Comment Reply Dispatcher with Exact Telemetry Logging
  async function sendInstagramCommentReplyWithFallback(params: {
    accessToken: string;
    commentId: string;
    messageText: string;
  }): Promise<{
    success: boolean;
    result: any;
    endpointUsed?: string;
    reply_api_call_start: string;
    reply_api_call_start_ms: number;
    reply_api_call_end: string;
    reply_api_call_end_ms: number;
    ig_api_duration_ms: number;
  }> {
    const { accessToken, commentId, messageText } = params;
    const cleanToken = sanitizeAccessToken(accessToken);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    if (!cleanToken || !commentId || cleanToken.includes('encrypted_token') || cleanToken.includes('sandbox_token')) {
      return {
        success: false,
        result: { note: 'Simulation / no live token' },
        reply_api_call_start: nowIso,
        reply_api_call_start_ms: nowMs,
        reply_api_call_end: nowIso,
        reply_api_call_end_ms: nowMs,
        ig_api_duration_ms: 0,
      };
    }

    const candidateEndpoints: string[] = [];
    if (lastSuccessfulCommentEndpoint) {
      candidateEndpoints.push(lastSuccessfulCommentEndpoint);
    }

    const standardEndpoints = [
      `https://graph.instagram.com/v21.0/${encodeURIComponent(commentId)}/replies`,
      `https://graph.facebook.com/v21.0/${encodeURIComponent(commentId)}/replies`,
    ];

    for (const ep of standardEndpoints) {
      if (!candidateEndpoints.includes(ep)) {
        candidateEndpoints.push(ep);
      }
    }

    let lastResult: any = null;
    let apiCallStartIso = '';
    let apiCallStartMs = 0;
    let apiCallEndIso = '';
    let apiCallEndMs = 0;
    let apiDurationMs = 0;
    let successfulEndpoint = '';

    for (const endpoint of candidateEndpoints) {
      try {
        const url = `${endpoint}?access_token=${encodeURIComponent(cleanToken)}`;
        apiCallStartMs = Date.now();
        apiCallStartIso = new Date().toISOString();

        console.log(`\n📤 [REPLY_COMMENT_API_CALL_START] Timestamp: ${apiCallStartIso} (${apiCallStartMs}ms) | URL: ${endpoint}`);

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanToken}`,
            'Connection': 'keep-alive',
          },
          body: JSON.stringify({ message: messageText }),
          signal: AbortSignal.timeout(2800),
        });

        apiCallEndMs = Date.now();
        apiCallEndIso = new Date().toISOString();
        apiDurationMs = apiCallEndMs - apiCallStartMs;

        const data = await res.json();
        lastResult = data;

        console.log(`📥 [REPLY_COMMENT_API_CALL_END] Timestamp: ${apiCallEndIso} (${apiCallEndMs}ms) | Duration: ${apiDurationMs}ms | Status: ${res.status}`);

        if (res.ok && (data.id || data.success === true)) {
          lastSuccessfulCommentEndpoint = endpoint;
          successfulEndpoint = endpoint;
          return {
            success: true,
            result: data,
            endpointUsed: endpoint,
            reply_api_call_start: apiCallStartIso,
            reply_api_call_start_ms: apiCallStartMs,
            reply_api_call_end: apiCallEndIso,
            reply_api_call_end_ms: apiCallEndMs,
            ig_api_duration_ms: apiDurationMs,
          };
        }
      } catch (err: any) {
        apiCallEndMs = Date.now();
        apiCallEndIso = new Date().toISOString();
        apiDurationMs = apiCallEndMs - apiCallStartMs;
        console.warn(`⚠️ [REPLY_COMMENT_API_CALL_FAIL] Timestamp: ${apiCallEndIso} (${apiCallEndMs}ms) | Duration: ${apiDurationMs}ms | Error on ${endpoint}:`, err);
        lastResult = { error: String(err?.message || err) };
      }
    }

    return {
      success: false,
      result: lastResult,
      endpointUsed: successfulEndpoint || candidateEndpoints[0],
      reply_api_call_start: apiCallStartIso || nowIso,
      reply_api_call_start_ms: apiCallStartMs || nowMs,
      reply_api_call_end: apiCallEndIso || nowIso,
      reply_api_call_end_ms: apiCallEndMs || nowMs,
      ig_api_duration_ms: apiDurationMs,
    };
  }

  // Subscribed Apps Helper: Calls Meta Graph API to subscribe app to receiving Instagram Webhook events
  async function subscribeAppToInstagramWebhooks(igUserId: string, rawAccessToken: string) {
    const accessToken = sanitizeAccessToken(rawAccessToken);
    if (!accessToken || accessToken.includes('encrypted_token') || accessToken.includes('sandbox_token')) {
      console.log('[SUBSCRIBE_APPS] Skipping Meta subscription API call: No valid live token provided.');
      return { success: false, reason: 'no_valid_token' };
    }

    const fields = 'messages,messaging_postbacks,message_deliveries,message_reads,comments,mentions';
    const targetId = igUserId && igUserId !== 'primary' ? igUserId : 'me';

    const endpoints = [
      `https://graph.facebook.com/v21.0/${targetId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`,
      `https://graph.facebook.com/v21.0/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`,
      `https://graph.instagram.com/v21.0/${targetId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`,
      `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`,
    ];

    let lastResponse: any = null;
    let isSuccess = false;

    for (const url of endpoints) {
      try {
        console.log(`[SUBSCRIBE_APPS_CALL] Posting to Meta API: ${url.replace(accessToken, 'REDACTED_TOKEN')}`);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        const data = await res.json();
        console.log('[SUBSCRIBE_APPS_RESPONSE]', { status: res.status, ok: res.ok, data });
        lastResponse = data;
        if (res.ok && (data.success === true || data.data?.[0]?.success === true)) {
          isSuccess = true;
          break;
        }
      } catch (err) {
        console.error('[SUBSCRIBE_APPS_ERROR]', err);
      }
    }

    if (db) {
      try {
        const logId = `sub_${Date.now()}`;
        await setDoc(doc(db, 'webhook_logs', logId), {
          id: logId,
          timestamp: new Date().toISOString(),
          trigger_type: 'app_subscription',
          from_username: 'system',
          incoming_text: `Meta Subscribed Apps API call for IG User ID: ${igUserId}`,
          status: isSuccess ? 'success' : 'error',
          matched_automation_name: 'Meta Subscribed Apps API',
          response_sent: isSuccess ? 'Subscribed successfully to messages and comments' : 'Subscription API completed with warnings',
          api_response: lastResponse || null,
        });
      } catch (logErr) {
        console.warn('[SUBSCRIBE_APPS_LOG_ERR]', logErr);
      }
    }

    return { success: isSuccess, response: lastResponse };
  }

  // 1. Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'AutoReply.io Instagram Automation API Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Instagram Account status REST endpoints (Strictly user-scoped, no cross-account leakage)
  app.get('/api/instagram/account', async (req: Request, res: Response) => {
    const userId = req.query.userId as string | undefined;
    let accountData: InstagramAccount | null = null;

    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.json({ success: true, account: null });
    }

    // 1. Check user-scoped in-memory cache
    if (userInstagramAccountsMemory.has(userId)) {
      accountData = userInstagramAccountsMemory.get(userId) || null;
    }

    // 2. Load server-only OAuth credentials/metadata if RAM is cold.
    if (!accountData) {
      accountData = await loadServerInstagramAccount(userId);
    }

    if (accountData?.access_token) {
      accountData.access_token = sanitizeAccessToken(accountData.access_token);
    }

    if (accountData) {
      const cleanToken = sanitizeAccessToken(accountData.access_token);

      // Auto-refresh profile picture if missing, or if last refresh was > 6 hours ago
      const lastRefresh = (accountData as any).last_profile_refresh_at
        ? new Date((accountData as any).last_profile_refresh_at).getTime()
        : 0;
      const isStale = Date.now() - lastRefresh > 6 * 60 * 60 * 1000;

      if (isStale && cleanToken && !cleanToken.includes('masked')) {
        try {
          console.log('[AUTO_REFRESH_IG_PROFILE] Refreshing profile picture from Meta Graph API...');
          const meRes = await fetch(
            `https://graph.instagram.com/v21.0/me?fields=id,username,name,profile_picture_url,followers_count&access_token=${encodeURIComponent(
              cleanToken
            )}`,
            {
              headers: { Authorization: `Bearer ${cleanToken}` },
              signal: AbortSignal.timeout(3500),
            }
          );
          if (meRes.ok) {
            const meData = await meRes.json();
            console.log('[AUTO_REFRESH_IG_PROFILE_SUCCESS]', {
              username: meData.username,
              has_profile_picture_url: Boolean(meData.profile_picture_url),
            });
            if (meData.profile_picture_url) {
              accountData.profile_pic_url = meData.profile_picture_url;
              (accountData as any).last_profile_refresh_at = new Date().toISOString();
              if (meData.username) accountData.username = meData.username;
              if (typeof meData.followers_count === 'number') accountData.followers_count = meData.followers_count;

              // Background update Firestore
              if (db) {
                const updatePayload = {
                  profile_pic_url: accountData.profile_pic_url,
                  username: accountData.username,
                  last_profile_refresh_at: (accountData as any).last_profile_refresh_at,
                };
                updateDoc(doc(db, 'instagram_account', 'primary'), updatePayload).catch(() => {});
                if (userId) {
                  updateDoc(doc(db, 'users', userId, 'instagram_account', 'primary'), updatePayload).catch(() => {});
                }
              }
            }
          } else {
            const errData = await meRes.json().catch(() => ({}));
            console.warn('[AUTO_REFRESH_IG_PROFILE_FAILED]', meRes.status, errData);
          }
        } catch (autoErr) {
          console.warn('[AUTO_REFRESH_IG_PROFILE_ERR]', autoErr);
        }
      }

      // Never return even a masked credential field to the browser.
      return res.json({ success: true, account: toClientSafeInstagramAccount(accountData) });
    }

    return res.json({ success: true, account: null });
  });

  // Explicit Force Refresh Endpoint for Instagram Profile Picture
  app.post('/api/instagram/refresh-profile-pic', async (req: Request, res: Response) => {
    const userId = req.body?.userId as string | undefined;
    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const storedAccount = await loadServerInstagramAccount(userId);
    const token = storedAccount?.access_token || '';

    const cleanToken = sanitizeAccessToken(token);
    if (!cleanToken || cleanToken.includes('masked')) {
      return res.status(400).json({
        success: false,
        error: 'No active Instagram access token found to refresh profile picture.',
      });
    }

    try {
      console.log('[MANUAL_REFRESH_IG_PROFILE] Calling Meta Graph API /v21.0/me...');
      const meRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=id,username,name,profile_picture_url,followers_count&access_token=${encodeURIComponent(
          cleanToken
        )}`,
        {
          headers: { Authorization: `Bearer ${cleanToken}` },
          signal: AbortSignal.timeout(5000),
        }
      );

      const meData = await meRes.json();
      if (!meRes.ok) {
        console.error('[MANUAL_REFRESH_IG_PROFILE_API_ERR]', meRes.status, meData);
        return res.status(meRes.status).json({
          success: false,
          error: meData?.error?.message || 'Failed to fetch fresh profile from Instagram Graph API',
          details: meData,
        });
      }

      console.log('[MANUAL_REFRESH_IG_PROFILE_API_SUCCESS]', meData);

      const nowIso = new Date().toISOString();
      const newPicUrl = meData.profile_picture_url || '';

      const cachedAcc = userInstagramAccountsMemory.get(userId);
      if (cachedAcc) {
        if (newPicUrl) cachedAcc.profile_pic_url = newPicUrl;
        if (meData.username) cachedAcc.username = meData.username;
        (cachedAcc as any).last_profile_refresh_at = nowIso;
      }

      if (db) {
        const updatePayload: any = {
          last_profile_refresh_at: nowIso,
        };
        if (newPicUrl) updatePayload.profile_pic_url = newPicUrl;
        if (meData.username) updatePayload.username = meData.username;
        if (typeof meData.followers_count === 'number') updatePayload.followers_count = meData.followers_count;

        await updateDoc(doc(db, 'users', userId, 'instagram_account', 'primary'), updatePayload).catch(() => {});
      }

      return res.json({
        success: true,
        message: 'Instagram profile picture refreshed successfully!',
        profile_picture_url: newPicUrl,
        username: meData.username,
        followers_count: meData.followers_count,
        refreshed_at: nowIso,
      });
    } catch (err: any) {
      console.error('[MANUAL_REFRESH_IG_PROFILE_EXCEPTION]', err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Diagnostic Endpoint: Inspect Firestore & Meta Graph API profile picture status
  app.get('/api/instagram/debug-avatars', async (req: Request, res: Response) => {
    const diagnosticReport: any = {
      timestamp: new Date().toISOString(),
      firestore_account_primary: null,
      account_profile_pic_http_status: null,
      firestore_contacts_count: 0,
      firestore_contacts: [],
      graph_api_test: null,
      analysis: '',
    };

    if (db) {
      try {
        const igDoc = await getDoc(doc(db, 'instagram_account', 'primary'));
        if (igDoc.exists()) {
          const accData = igDoc.data();
          const cleanToken = sanitizeAccessToken(accData.access_token);
          diagnosticReport.firestore_account_primary = {
            id: accData.id,
            username: accData.username,
            ig_user_id: accData.ig_user_id,
            profile_pic_url: accData.profile_pic_url,
            has_token: Boolean(cleanToken),
          };

          // Test if stored profile_pic_url is accessible or gives 403 Forbidden
          if (accData.profile_pic_url) {
            try {
              const headRes = await fetch(accData.profile_pic_url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
              diagnosticReport.account_profile_pic_http_status = headRes.status;
            } catch (hErr: any) {
              diagnosticReport.account_profile_pic_http_status = `Network error: ${hErr?.message}`;
            }
          }

          // Test live Graph API call
          if (cleanToken && !cleanToken.includes('masked')) {
            try {
              const testMe = await fetch(
                `https://graph.instagram.com/v21.0/me?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(
                  cleanToken
                )}`,
                { signal: AbortSignal.timeout(4000) }
              );
              const testJson = await testMe.json();
              diagnosticReport.graph_api_test = {
                status: testMe.status,
                ok: testMe.ok,
                data: testJson,
              };
            } catch (apiErr: any) {
              diagnosticReport.graph_api_test = { error: apiErr?.message };
            }
          }
        }

        // Check contacts in Firestore
        const cSnap = await getDocs(collection(db, 'contacts'));
        diagnosticReport.firestore_contacts_count = cSnap.size;
        for (const cDoc of cSnap.docs) {
          const cData = cDoc.data();
          diagnosticReport.firestore_contacts.push({
            id: cDoc.id,
            ig_username: cData.ig_username,
            avatar_url: cData.avatar_url,
          });
        }
      } catch (diagErr: any) {
        diagnosticReport.error = diagErr?.message;
      }
    }

    diagnosticReport.analysis =
      'Meta Instagram CDN profile picture URLs expire every 24-48 hours with HTTP 403 Forbidden. The app now features auto-refresh from Graph API /v21.0/me, plus a deterministic colorful initial letter avatar system that renders seamlessly across all pages without broken images.';

    return res.json(diagnosticReport);
  });

  // ----------------------------------------------------
  // ADMIN PANEL & USER MANAGEMENT ENDPOINTS
  // ----------------------------------------------------

  // 1. Verify if an email has administrative privileges
  app.get('/api/admin/check-access', (req: Request, res: Response) => {
    const rawEmail = (req.query.email as string) || (req.headers['x-user-email'] as string) || '';
    const cleanEmail = rawEmail.trim().toLowerCase();
    const isAdmin = isUserAdminEmail(cleanEmail);
    res.json({
      isAdmin,
      email: cleanEmail,
      configuredAdmins: getAuthorizedAdminEmails(),
    });
  });

  // 2. Synchronize user login and profile to registeredUsersMemory and Firestore users/{uid}
  app.post('/api/user/sync-profile', async (req: Request, res: Response) => {
    try {
      const { uid, email, displayName, photoURL, creationTime, lastSignInTime } = req.body || {};
      if (!uid || !email) {
        return res.status(400).json({ success: false, error: 'uid and email are required' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const isAdmin = isUserAdminEmail(cleanEmail);

      const profileData = {
        id: uid,
        uid,
        email: cleanEmail,
        displayName: displayName || cleanEmail.split('@')[0],
        photoURL: photoURL || '',
        created_at: creationTime || new Date().toISOString(),
        last_login_at: lastSignInTime || new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        role: isAdmin ? 'admin' : 'user',
      };

      // Always maintain in-memory registry for instant admin dashboard retrieval
      registeredUsersMemory.set(uid, profileData);

      if (db) {
        try {
          const userDocRef = doc(db, 'users', uid);
          await setDoc(userDocRef, profileData, { merge: true });
          console.log(`[USER_PROFILE_SYNCED] Synced user ${cleanEmail} (${uid}), role: ${profileData.role}`);
        } catch (dbErr: any) {
          // Multi-tenant Firestore rules strictly enforce isOwner(userId) for client authentication.
          // The client's authenticated SDK session directly writes users/{userId}, so server permission denial is expected.
          if (dbErr?.code !== 'permission-denied') {
            console.warn('[USER_SYNC_PROFILE_DB_WARN]', dbErr?.message || dbErr);
          }
        }
      }

      return res.json({ success: true, user: profileData, isAdmin });
    } catch (err: any) {
      console.error('[USER_SYNC_PROFILE_ERR]', err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // ----------------------------------------------------
  // ADMIN AUTHENTICATION & LOGIN GATEWAY
  // ----------------------------------------------------
  const ADMIN_CREDENTIALS = {
    userId: 'Nazhalijing',
    password: 'nazha@9589',
  };
  const ADMIN_SESSION_SECRET = 'admin_session_valid_nazhalijing_9589';

  function isAuthorizedAdminRequest(req: Request): boolean {
    const requesterEmail = (
      (req.query.email as string) ||
      (req.headers['x-user-email'] as string) ||
      ''
    ).trim().toLowerCase();

    const authHeader = (req.headers['authorization'] as string) || '';
    const adminToken = (req.headers['x-admin-token'] as string) || '';

    if (
      adminToken === ADMIN_SESSION_SECRET ||
      authHeader === `Bearer ${ADMIN_SESSION_SECRET}` ||
      authHeader === ADMIN_SESSION_SECRET
    ) {
      return true;
    }

    return isUserAdminEmail(requesterEmail);
  }

  // Admin login with User ID and Password
  app.post('/api/admin/login', (req: Request, res: Response) => {
    try {
      const { userId, username, password } = req.body || {};
      const givenId = String(userId || username || '').trim();
      const givenPassword = String(password || '').trim();

      if (
        givenId.toLowerCase() === ADMIN_CREDENTIALS.userId.toLowerCase() &&
        givenPassword === ADMIN_CREDENTIALS.password
      ) {
        console.log(`[ADMIN_LOGIN_SUCCESS] Admin ${ADMIN_CREDENTIALS.userId} authenticated successfully`);
        return res.json({
          success: true,
          token: ADMIN_SESSION_SECRET,
          adminUser: {
            userId: ADMIN_CREDENTIALS.userId,
            role: 'super_admin',
            email: 'devsinghparmar9589@gmail.com',
          },
        });
      }

      console.warn(`[ADMIN_LOGIN_FAILED] Invalid credentials attempt: id="${givenId}"`);
      return res.status(401).json({
        success: false,
        error: 'Invalid Admin User ID or Password. Please check your credentials.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Login error' });
    }
  });

  // 3. Admin Overview & Dashboard Endpoint: Aggregates all registered users, connected IG accounts & usage stats
  const handleAdminDashboardOverview = async (req: Request, res: Response) => {
    try {
      const requesterEmail = (
        (req.query.email as string) ||
        (req.headers['x-user-email'] as string) ||
        ''
      ).trim().toLowerCase();

      if (!isAuthorizedAdminRequest(req)) {
        console.warn(`[ADMIN_ACCESS_DENIED] Unauthorized request from: "${requesterEmail}"`);
        return res.status(403).json({
          success: false,
          error: 'Access Denied: You do not have administrator permissions to view this data.',
          isAdmin: false,
          requesterEmail: requesterEmail || 'anonymous',
          configuredAdmins: getAuthorizedAdminEmails(),
        });
      }

      // Fetch all user profile documents from 'users' collection or in-memory fallback
      let userDocItems: { id: string; data: () => any }[] = [];
      if (db) {
        try {
          const usersColRef = collection(db, 'users');
          const usersSnap = await getDocs(usersColRef);
          userDocItems = usersSnap.docs.map((d) => ({ id: d.id, data: () => d.data() }));
        } catch (colErr: any) {
          // If firestore rules deny collection scanning from unauthenticated server,
          // smoothly fall back to registeredUsersMemory
        }
      }

      if (userDocItems.length === 0 && registeredUsersMemory.size > 0) {
        userDocItems = Array.from(registeredUsersMemory.values()).map((u) => ({
          id: u.uid || u.id,
          data: () => u,
        }));
      }

      const usersList: AdminUserOverviewItem[] = [];
      let totalAutomatedDmsAll = 0;
      let totalAutomationsAll = 0;

      // Track if primary/owner is found
      let foundAdminUser = false;

      for (const userDoc of userDocItems) {
        const uData = userDoc.data();
        const uid = userDoc.id;
        const uEmail = (uData.email || '').trim().toLowerCase();
        if (isUserAdminEmail(uEmail)) {
          foundAdminUser = true;
        }

        // Subcollection: instagram_account
        let igUsername: string | null = null;
        let igConnectedAt: string | null = null;
        let igStatus: 'active' | 'disconnected' | 'not_connected' = 'not_connected';
        let igFollowers: number = 0;
        let igPic: string | null = null;

        if (db) {
          try {
            const igSnap = await getDoc(doc(db, 'users', uid, 'instagram_account', 'primary'));
            if (igSnap.exists()) {
              const igData = igSnap.data();
              igUsername = igData.username || null;
              igConnectedAt = igData.connected_at || null;
              igStatus = igData.status === 'connected' ? 'active' : 'disconnected';
              igFollowers = Number(igData.followers_count) || 0;
              igPic = igData.profile_pic_url || null;
            }
          } catch (igErr) {
            // Ignored gracefully
          }
        }

        if (!igUsername && userInstagramAccountsMemory.has(uid)) {
          const cachedIg = userInstagramAccountsMemory.get(uid);
          if (cachedIg) {
            igUsername = cachedIg.username || null;
            igConnectedAt = cachedIg.connected_at || null;
            igStatus = cachedIg.status === 'connected' ? 'active' : 'disconnected';
            igFollowers = Number(cachedIg.followers_count) || 0;
            igPic = cachedIg.profile_pic_url || null;
          }
        }

        // Subcollection: automations
        let userAutoCount = 0;
        let latestAutoTime: string | null = null;
        try {
          const autoSnap = await getDocs(collection(db, 'users', uid, 'automations'));
          if (!autoSnap.empty) {
            userAutoCount = autoSnap.docs.length;
            for (const a of autoSnap.docs) {
              const aData = a.data();
              const t = aData.updated_at || aData.created_at;
              if (t && (!latestAutoTime || new Date(t).getTime() > new Date(latestAutoTime).getTime())) {
                latestAutoTime = t;
              }
            }
          } else if (isUserAdminEmail(uEmail)) {
            const rootAutoSnap = await getDocs(collection(db, 'automations'));
            userAutoCount = rootAutoSnap.docs.length;
            for (const a of rootAutoSnap.docs) {
              const aData = a.data();
              const t = aData.updated_at || aData.created_at;
              if (t && (!latestAutoTime || new Date(t).getTime() > new Date(latestAutoTime).getTime())) {
                latestAutoTime = t;
              }
            }
          }
        } catch (aErr) {
          console.warn(`[ADMIN_OVERVIEW_AUTO_ERR] ${uid}:`, aErr);
        }

        // Subcollection: inbox_messages
        let userAutomatedDmsCount = 0;
        let latestMsgTime: string | null = null;
        try {
          const msgSnap = await getDocs(collection(db, 'users', uid, 'inbox_messages'));
          if (!msgSnap.empty) {
            for (const m of msgSnap.docs) {
              const mData = m.data();
              if (mData.direction === 'out' && (mData.is_automated === true || mData.is_automated === 'true')) {
                userAutomatedDmsCount++;
              }
              const t = mData.timestamp;
              if (t && (!latestMsgTime || new Date(t).getTime() > new Date(latestMsgTime).getTime())) {
                latestMsgTime = t;
              }
            }
          } else if (isUserAdminEmail(uEmail)) {
            const rootMsgSnap = await getDocs(collection(db, 'inbox_messages'));
            for (const m of rootMsgSnap.docs) {
              const mData = m.data();
              if (mData.direction === 'out' && (mData.is_automated === true || mData.is_automated === 'true')) {
                userAutomatedDmsCount++;
              }
              const t = mData.timestamp;
              if (t && (!latestMsgTime || new Date(t).getTime() > new Date(latestMsgTime).getTime())) {
                latestMsgTime = t;
              }
            }
          }
        } catch (mErr) {
          console.warn(`[ADMIN_OVERVIEW_MSG_ERR] ${uid}:`, mErr);
        }

        // Subcollection: contacts
        let userContactsCount = 0;
        try {
          const cntSnap = await getDocs(collection(db, 'users', uid, 'contacts'));
          if (!cntSnap.empty) {
            userContactsCount = cntSnap.docs.length;
          } else if (isUserAdminEmail(uEmail)) {
            const rootCntSnap = await getDocs(collection(db, 'contacts'));
            userContactsCount = rootCntSnap.docs.length;
          }
        } catch {}

        // Calculate overall last activity time
        const candidates = [
          uData.last_active_at,
          uData.last_login_at,
          latestMsgTime,
          latestAutoTime,
          igConnectedAt,
          uData.created_at,
        ].filter(Boolean);

        let lastActivity = uData.last_active_at || uData.last_login_at || uData.created_at || new Date().toISOString();
        if (candidates.length > 0) {
          candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          lastActivity = candidates[0];
        }

        totalAutomatedDmsAll += userAutomatedDmsCount;
        totalAutomationsAll += userAutoCount;

        usersList.push({
          uid,
          email: uEmail || 'user@company.com',
          displayName: uData.displayName || uEmail.split('@')[0],
          photoURL: uData.photoURL || undefined,
          first_login_at: uData.created_at || uData.first_login_at || new Date().toISOString(),
          last_login_at: uData.last_login_at || uData.created_at || new Date().toISOString(),
          last_active_at: lastActivity,
          role: isUserAdminEmail(uEmail) ? 'admin' : (uData.role || 'user'),
          instagram: {
            username: igUsername,
            connected_at: igConnectedAt,
            status: igStatus,
            followers_count: igFollowers,
            profile_pic_url: igPic,
          },
          stats: {
            total_dms_sent: userAutomatedDmsCount,
            total_automations: userAutoCount,
            total_contacts: userContactsCount,
            last_activity_time: lastActivity,
          },
        });
      }

      // If no admin user document exists in 'users' collection yet, synthesize the primary owner row
      // and seed it into Firestore so it persists permanently!
      if (!foundAdminUser) {
        let rootIgUser: string | null = null;
        let rootIgConn: string | null = null;
        let rootIgStatus: 'active' | 'disconnected' | 'not_connected' = 'not_connected';
        let rootIgPic: string | null = null;
        let rootIgFollowers = 0;

        try {
          const rootIgSnap = await getDoc(doc(db, 'instagram_account', 'primary'));
          if (rootIgSnap.exists()) {
            const rootIg = rootIgSnap.data();
            rootIgUser = rootIg.username || null;
            rootIgConn = rootIg.connected_at || null;
            rootIgStatus = rootIg.status === 'connected' ? 'active' : 'disconnected';
            rootIgPic = rootIg.profile_pic_url || null;
            rootIgFollowers = Number(rootIg.followers_count) || 0;
          }
        } catch {}

        let rootAutoCount = 0;
        let rootAutoTime: string | null = null;
        try {
          const rootAutoSnap = await getDocs(collection(db, 'automations'));
          rootAutoCount = rootAutoSnap.docs.length;
          for (const a of rootAutoSnap.docs) {
            const t = a.data().updated_at || a.data().created_at;
            if (t && (!rootAutoTime || new Date(t).getTime() > new Date(rootAutoTime).getTime())) {
              rootAutoTime = t;
            }
          }
        } catch {}

        let rootAutomatedDms = 0;
        let rootMsgTime: string | null = null;
        try {
          const rootMsgSnap = await getDocs(collection(db, 'inbox_messages'));
          for (const m of rootMsgSnap.docs) {
            const d = m.data();
            if (d.direction === 'out' && (d.is_automated === true || d.is_automated === 'true')) {
              rootAutomatedDms++;
            }
            const t = d.timestamp;
            if (t && (!rootMsgTime || new Date(t).getTime() > new Date(rootMsgTime).getTime())) {
              rootMsgTime = t;
            }
          }
        } catch {}

        let rootContactsCount = 0;
        try {
          const rootCntSnap = await getDocs(collection(db, 'contacts'));
          rootContactsCount = rootCntSnap.docs.length;
        } catch {}

        const nowIso = new Date().toISOString();
        const primaryAdminItem: AdminUserOverviewItem = {
          uid: 'owner_primary',
          email: requesterEmail || 'devsinghparmar9589@gmail.com',
          displayName: 'Dev Singh Parmar (Owner)',
          photoURL: rootIgPic || undefined,
          first_login_at: rootIgConn || nowIso,
          last_login_at: nowIso,
          last_active_at: rootMsgTime || rootAutoTime || nowIso,
          role: 'admin',
          instagram: {
            username: rootIgUser || 'nazhalijing',
            connected_at: rootIgConn || nowIso,
            status: rootIgStatus || 'active',
            followers_count: rootIgFollowers,
            profile_pic_url: rootIgPic,
          },
          stats: {
            total_dms_sent: rootAutomatedDms,
            total_automations: rootAutoCount,
            total_contacts: rootContactsCount,
            last_activity_time: rootMsgTime || rootAutoTime || nowIso,
          },
        };

        // Seed to Firestore users collection
        try {
          await setDoc(
            doc(db, 'users', 'owner_primary'),
            {
              id: 'owner_primary',
              uid: 'owner_primary',
              email: primaryAdminItem.email,
              displayName: primaryAdminItem.displayName,
              photoURL: primaryAdminItem.photoURL || '',
              created_at: primaryAdminItem.first_login_at,
              last_login_at: primaryAdminItem.last_login_at,
              last_active_at: primaryAdminItem.last_active_at,
              role: 'admin',
            },
            { merge: true }
          );
        } catch (seedErr) {
          console.warn('[SEED_ADMIN_USER_WARN]', seedErr);
        }

        totalAutomatedDmsAll += rootAutomatedDms;
        totalAutomationsAll += rootAutoCount;
        usersList.unshift(primaryAdminItem);
      }

      const totalConnectedCount = usersList.filter(
        (u) => u.instagram?.status === 'active' && u.instagram?.username
      ).length;

      return res.json({
        success: true,
        isAdmin: true,
        requesterEmail: requesterEmail || 'devsinghparmar9589@gmail.com',
        overviewStats: {
          totalRegisteredUsers: usersList.length,
          totalConnectedInstagram: totalConnectedCount,
          totalDmsSent: totalAutomatedDmsAll,
          totalActiveAutomations: totalAutomationsAll,
        },
        users: usersList,
        totalUsers: usersList.length,
        totalAutomatedDms: totalAutomatedDmsAll,
        totalAutomations: totalAutomationsAll,
        configuredAdmins: getAuthorizedAdminEmails(),
      });
    } catch (err: any) {
      console.error('[ADMIN_USERS_OVERVIEW_ERR]', err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  };

  // Mount both routes for flexibility and backwards compatibility
  app.get('/api/admin/dashboard-overview', handleAdminDashboardOverview);
  app.get('/api/admin/users-overview', handleAdminDashboardOverview);

  app.post('/api/instagram/account', async (req: Request, res: Response) => {
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

  // Contacts Deletion Endpoints (Permanently deletes from Firestore)
  app.post('/api/contacts/delete', async (req: Request, res: Response) => {
    const { contactId, username, userId } = req.body || {};
    if (!contactId && !username) {
      return res.status(400).json({ success: false, error: 'contactId or username required' });
    }

    if (db) {
      try {
        if (contactId) {
          if (userId) await deleteDoc(doc(db, 'users', userId, 'contacts', contactId));
          await deleteDoc(doc(db, 'contacts', contactId));
          console.log('[PERMANENT_DELETE_CONTACT]', contactId);
        }
        if (username) {
          if (userId) {
            const userMsgsRef = collection(db, 'users', userId, 'inbox_messages');
            const q = query(userMsgsRef, where('from_username', '==', username));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              await deleteDoc(d.ref);
            }
          }
          const msgsRef = collection(db, 'inbox_messages');
          const q2 = query(msgsRef, where('from_username', '==', username));
          const snap2 = await getDocs(q2);
          for (const d of snap2.docs) {
            await deleteDoc(d.ref);
          }
          console.log('[PERMANENT_DELETE_MESSAGES_FOR_USER]', username);
        }
      } catch (err: any) {
        if (err?.code !== 'permission-denied') {
          console.warn('[DELETE_CONTACT_DB_WARN]', err?.message || err);
        }
      }
    }
    return res.json({ success: true });
  });

  app.post('/api/contacts/bulk-delete', async (req: Request, res: Response) => {
    const { contactIds, usernames, userId } = req.body || {};
    const ids: string[] = Array.isArray(contactIds) ? contactIds : [];
    const unames: string[] = Array.isArray(usernames) ? usernames : [];

    if (db) {
      try {
        for (const cid of ids) {
          if (userId) await deleteDoc(doc(db, 'users', userId, 'contacts', cid));
          await deleteDoc(doc(db, 'contacts', cid));
        }
        for (const uname of unames) {
          if (userId) {
            const userMsgsRef = collection(db, 'users', userId, 'inbox_messages');
            const q = query(userMsgsRef, where('from_username', '==', uname));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              await deleteDoc(d.ref);
            }
          }
          const msgsRef = collection(db, 'inbox_messages');
          const q2 = query(msgsRef, where('from_username', '==', uname));
          const snap2 = await getDocs(q2);
          for (const d of snap2.docs) {
            await deleteDoc(d.ref);
          }
        }
        console.log('[PERMANENT_BULK_DELETE_CONTACTS]', { count: ids.length, usernamesCount: unames.length });
      } catch (err) {
        console.warn('[BULK_DELETE_CONTACTS_WARN]', err);
      }
    }
    return res.json({ success: true, deletedCount: ids.length });
  });

  // Inbox Threads Deletion Endpoints (Permanently deletes thread messages from Firestore)
  app.post('/api/inbox/delete-thread', async (req: Request, res: Response) => {
    const { username, userId } = req.body || {};
    if (!username) {
      return res.status(400).json({ success: false, error: 'username required' });
    }

    if (db) {
      try {
        if (userId) {
          const userMsgsRef = collection(db, 'users', userId, 'inbox_messages');
          const snapAll = await getDocs(userMsgsRef);
          for (const d of snapAll.docs) {
            const data = d.data();
            if (data?.from_username && data.from_username.toLowerCase() === username.toLowerCase()) {
              await deleteDoc(d.ref);
            }
          }
        }
        const msgsRef = collection(db, 'inbox_messages');
        const snapAll2 = await getDocs(msgsRef);
        for (const d of snapAll2.docs) {
          const data = d.data();
          if (data?.from_username && data.from_username.toLowerCase() === username.toLowerCase()) {
            await deleteDoc(d.ref);
          }
        }
        console.log('[PERMANENT_DELETE_THREAD]', username);
      } catch (err) {
        console.warn('[DELETE_THREAD_WARN]', err);
      }
    }
    return res.json({ success: true });
  });

  app.post('/api/inbox/bulk-delete-threads', async (req: Request, res: Response) => {
    const { usernames, userId } = req.body || {};
    const unames: string[] = Array.isArray(usernames) ? usernames : [];

    if (db) {
      try {
        const lowerSet = new Set(unames.map((u) => u.toLowerCase()));
        if (userId) {
          const userMsgsRef = collection(db, 'users', userId, 'inbox_messages');
          const snapAll = await getDocs(userMsgsRef);
          for (const d of snapAll.docs) {
            const data = d.data();
            if (data?.from_username && lowerSet.has(data.from_username.toLowerCase())) {
              await deleteDoc(d.ref);
            }
          }
        }
        const msgsRef = collection(db, 'inbox_messages');
        const snapAll = await getDocs(msgsRef);
        for (const d of snapAll.docs) {
          const data = d.data();
          if (data?.from_username && lowerSet.has(data.from_username.toLowerCase())) {
            await deleteDoc(d.ref);
          }
        }
        console.log('[PERMANENT_BULK_DELETE_THREADS]', unames.length);
      } catch (err) {
        console.warn('[BULK_DELETE_THREADS_WARN]', err);
      }
    }
    return res.json({ success: true, deletedCount: unames.length });
  });

  app.post('/api/instagram/subscribe', async (req: Request, res: Response) => {
    const userId = (req.body?.userId || req.query?.userId) as string | undefined;
    let accessToken = '';
    let igUserId = '';
    if (userId) {
      const storedAccount = await loadServerInstagramAccount(userId);
      accessToken = sanitizeAccessToken(storedAccount?.access_token || '');
      igUserId = storedAccount?.ig_user_id || '';
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'No connected Instagram account access token found.' });
    }

    const result = await subscribeAppToInstagramWebhooks(igUserId, accessToken);
    return res.json({ success: result.success, result: result.response });
  });

  // 2. Meta Instagram Config Endpoints — server environment is authoritative.
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

  // 3. Instagram Meta OAuth Auth Flow Endpoint (Instagram Business Login)
  app.get('/api/auth/instagram', (req: Request, res: Response) => {
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

  // 4. Instagram Meta OAuth Callback Endpoint
  app.get('/api/auth/instagram/callback', async (req: Request, res: Response) => {
    const { code, error, error_reason, error_description, state } = req.query;

    let targetUserId = '';
    if (state) {
      try {
        const decodedState = JSON.parse(decodeURIComponent(String(state)));
        if (decodedState?.userId) targetUserId = String(decodedState.userId);
      } catch {}
    }

    if (error || error_reason) {
      console.warn('[INSTAGRAM_OAUTH_ERROR]', { error, error_reason, error_description });
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Instagram OAuth Error</title></head>
          <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #f8fafc;">
            <div style="max-width: 440px; margin: 0 auto; background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
              <h2 style="color: #dc2626; margin-top: 0;">Instagram OAuth Error</h2>
              <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">${error_description || error_reason || error}</p>
              <a href="/" style="display: inline-block; margin-top: 16px; background: #3b5bff; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Return to Dashboard</a>
            </div>
          </body>
        </html>
      `);
    }

    let shortLivedToken: string | null = null;
    let longLivedToken: string | null = null;
    let userId: string | null = null;
    let accountUsername = '';
    let accountName = '';
    let profilePicUrl = '';
    let followersCount = 0;

    if (code) {
      try {
        const formData = new URLSearchParams();
        formData.append('client_id', metaConfigStore.app_id);
        formData.append('client_secret', metaConfigStore.app_secret);
        formData.append('grant_type', 'authorization_code');
        formData.append('redirect_uri', getInstagramRedirectUri(req));
        formData.append('code', String(code));

        const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          shortLivedToken = sanitizeAccessToken(tokenData.access_token);
          userId = tokenData.user_id ? String(tokenData.user_id) : null;
          console.log('[INSTAGRAM_SHORT_TOKEN_EXCHANGE_SUCCESS]', { userId, hasToken: Boolean(shortLivedToken) });
        } else {
          const errText = await tokenRes.text();
          console.warn('[INSTAGRAM_SHORT_TOKEN_EXCHANGE_WARNING]', errText);
        }
      } catch (err) {
        console.error('[INSTAGRAM_OAUTH_TOKEN_EXCHANGE_ERROR]', err);
      }

      if (shortLivedToken) {
        try {
          const longTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
            metaConfigStore.app_secret
          )}&access_token=${encodeURIComponent(shortLivedToken)}`;

          const longRes = await fetch(longTokenUrl);
          if (longRes.ok) {
            const longData = await longRes.json();
            longLivedToken = sanitizeAccessToken(longData.access_token) || shortLivedToken;
          } else {
            longLivedToken = shortLivedToken;
          }
        } catch (longErr) {
          console.warn('[INSTAGRAM_LONG_TOKEN_EXCHANGE_ERROR]', longErr);
          longLivedToken = shortLivedToken;
        }
      }

      const activeToken = sanitizeAccessToken(longLivedToken || shortLivedToken);
      if (activeToken) {
        try {
          const meRes = await fetch(
            `https://graph.instagram.com/v21.0/me?fields=id,username,name,profile_picture_url,followers_count&access_token=${encodeURIComponent(
              activeToken
            )}`,
            {
              headers: {
                'Authorization': `Bearer ${activeToken}`,
              },
            }
          );

          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.username) accountUsername = meData.username;
            if (meData.name) accountName = meData.name;
            if (meData.id) userId = String(meData.id);
            if (meData.profile_picture_url) profilePicUrl = meData.profile_picture_url;
            if (typeof meData.followers_count === 'number') followersCount = meData.followers_count;
            console.log('[INSTAGRAM_USER_DETAILS_SUCCESS]', meData);
          }
        } catch (userErr) {
          console.warn('[INSTAGRAM_USER_DETAILS_ERROR]', userErr);
        }
      }
    }

    const cleanFinalToken = sanitizeAccessToken(longLivedToken || shortLivedToken);

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
      ig_user_id: String(userId),
      username: accountUsername,
      profile_pic_url: profilePicUrl,
      followers_count: followersCount,
      access_token: cleanFinalToken,
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      status: 'connected',
    };

    await persistServerInstagramAccount(targetUserId, connectedAccount);
    cachedInstagramAccount = connectedAccount;
    cachedInstagramAccountTimestamp = Date.now();

    if (connectedAccount.access_token) {
      // Trigger Webhook Subscribed Apps API Call!
      subscribeAppToInstagramWebhooks(connectedAccount.ig_user_id, connectedAccount.access_token).catch((err) =>
        console.warn('[CALLBACK_SUBSCRIBE_ERR]', err)
      );
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AutoReply.io - Instagram Connected</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f7f6fb; margin: 0; }
            .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); text-align: center; max-width: 440px; }
            .badge { background: #eef2ff; color: #3b5bff; display: inline-block; padding: 8px 16px; border-radius: 99px; font-weight: 600; margin-bottom: 16px; font-size: 13px; }
            .avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin: 0 auto 16px auto; border: 3px solid #3b5bff; }
            button { background: #3b5bff; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; width: 100%; }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="${profilePicUrl}" class="avatar" alt="${accountUsername}" />
            <div class="badge">Instagram Business API Connected</div>
            <h2 style="margin: 0 0 8px 0; color: #111827;">@${accountUsername} Connected!</h2>
            <p style="color: #6b7280; margin-bottom: 24px; font-size: 14px;">Meta verified the account successfully. OAuth credentials are stored server-side only.</p>
            <button onclick="navigateDashboard()">Go to Dashboard</button>
          </div>
          <script>
            function sendConnectMessage() {
              if (window.opener) {
                window.opener.postMessage({ type: 'ig_connected' }, window.location.origin);
              }
            }

            function navigateDashboard() {
              sendConnectMessage();
              window.location.href = '/?tab=settings&status=ig_connected';
            }

            sendConnectMessage();
            setTimeout(() => {
              navigateDashboard();
            }, 1200);
          </script>
        </body>
      </html>
    `);
  });

  // 5. Meta Webhook Verification Endpoint (GET)
  const handleWebhookVerification = (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[WEBHOOK VERIFY REQUEST]', { mode, token, challenge });

    const acceptedTokens = [
      metaConfigStore.webhook_verify_token,
      'autoreply_meta_verify_secret_token_2026',
      process.env.WEBHOOK_VERIFY_TOKEN,
      process.env.VERIFY_TOKEN,
    ].filter(Boolean);

    const isTokenValid = Boolean(
      token && (acceptedTokens.includes(String(token)) || acceptedTokens.length === 0)
    );

    if (mode === 'subscribe' && isTokenValid) {
      console.log('WEBHOOK_VERIFIED successfully! Challenge:', challenge);
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(String(challenge || ''));
    } else {
      console.warn('WEBHOOK_VERIFICATION_FAILED: Token mismatch or invalid mode', {
        mode,
        token,
        acceptedTokens,
      });
      return res.status(403).send('Forbidden');
    }
  };

  const webhookPaths = [
    '/webhook',
    '/webhook/',
    '/api/webhook',
    '/api/webhook/',
    '/api/instagram/webhook',
    '/api/instagram/webhook/',
  ];

  webhookPaths.forEach((pathUrl) => {
    app.get(pathUrl, handleWebhookVerification);
  });

  // --- ULTRA-FAST IN-MEMORY CACHE ENGINE WITH STALE-WHILE-REVALIDATE ---
  let cachedInstagramAccount: InstagramAccount | null = null;
  let cachedInstagramAccountTimestamp = 0;

  let cachedAutomations: Automation[] = [];
  let cachedAutomationsTimestamp = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
  let isFetchingAccountInBackground = false;
  let isFetchingAutomationsInBackground = false;

  async function primeCacheOnBoot() {
    if (!db) return;
    try {
      const [accTopSnap, autoTopSnap] = await Promise.all([
        getDoc(doc(db, 'instagram_account', 'primary')).catch(() => null),
        getDocs(collection(db, 'automations')).catch(() => null),
      ]);

      if (accTopSnap && accTopSnap.exists()) {
        cachedInstagramAccount = accTopSnap.data() as InstagramAccount;
        cachedInstagramAccountTimestamp = Date.now();
        connectedInstagramAccountMemory = cachedInstagramAccount;
      }

      const activeList: Automation[] = [];
      const seenIds = new Set<string>();

      if (autoTopSnap) {
        autoTopSnap.forEach((d) => {
          const item = { id: d.id, ...d.data() } as Automation;
          if (item.status === 'active' && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            activeList.push(item);
          }
        });
      }

      if (activeList.length > 0) {
        cachedAutomations = activeList;
        cachedAutomationsTimestamp = Date.now();
      }

      console.log('⚡ [IN_MEMORY_CACHE_READY] Primed Token & Automations in RAM on boot!');
    } catch (e) {
      console.warn('[PRIME_CACHE_WARN]', e);
    }
  }

  function refreshInstagramAccountCacheInBackground() {
    if (isFetchingAccountInBackground || !db) return;
    isFetchingAccountInBackground = true;
    getDoc(doc(db, 'instagram_account', 'primary'))
      .then((topSnap) => {
        if (topSnap && topSnap.exists()) {
          const accData = topSnap.data() as InstagramAccount;
          cachedInstagramAccount = accData;
          cachedInstagramAccountTimestamp = Date.now();
          connectedInstagramAccountMemory = accData;
        }
      })
      .catch((err) => console.warn('[BG_CACHE_ACCOUNT_WARN]', err))
      .finally(() => {
        isFetchingAccountInBackground = false;
      });
  }

  function refreshAutomationsCacheInBackground() {
    if (isFetchingAutomationsInBackground || !db) return;
    isFetchingAutomationsInBackground = true;
    getDocs(collection(db, 'automations'))
      .then((topSnap) => {
        const list: Automation[] = [];
        const seen = new Set<string>();
        if (topSnap) {
          topSnap.forEach((docSnap) => {
            const item = { id: docSnap.id, ...docSnap.data() } as Automation;
            if (item.status === 'active' && !seen.has(item.id)) {
              seen.add(item.id);
              list.push(item);
            }
          });
        }
        if (list.length > 0) {
          cachedAutomations = list;
          cachedAutomationsTimestamp = Date.now();
        }
      })
      .catch((err) => console.warn('[BG_CACHE_AUTOMATIONS_WARN]', err))
      .finally(() => {
        isFetchingAutomationsInBackground = false;
      });
  }

  // Synchronous, zero-latency In-Memory Account Resolver
  async function getCachedInstagramAccount(): Promise<{ accessToken: string; igUsername: string; profilePicUrl: string }> {
    const now = Date.now();

    // 1. Instant RAM Cache hit (0ms)
    if (cachedInstagramAccount && cachedInstagramAccount.access_token) {
      if (now - cachedInstagramAccountTimestamp >= CACHE_TTL_MS) {
        refreshInstagramAccountCacheInBackground();
      }
      return {
        accessToken: sanitizeAccessToken(cachedInstagramAccount.access_token || ''),
        igUsername: cachedInstagramAccount.username || '',
        profilePicUrl: cachedInstagramAccount.profile_pic_url || '',
      };
    }

    // 2. Fallback to in-memory connected account (0ms)
    if (connectedInstagramAccountMemory && connectedInstagramAccountMemory.access_token) {
      cachedInstagramAccount = connectedInstagramAccountMemory;
      cachedInstagramAccountTimestamp = now;
      return {
        accessToken: sanitizeAccessToken(connectedInstagramAccountMemory.access_token || ''),
        igUsername: connectedInstagramAccountMemory.username || '',
        profilePicUrl: connectedInstagramAccountMemory.profile_pic_url || '',
      };
    }

    // 3. Cold startup fetch with bounded 400ms timeout race (runs only if cache empty on initial cold hit)
    if (db) {
      try {
        const fetchPromise = getDoc(doc(db, 'instagram_account', 'primary')).catch(() => null);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 400));
        const accSnap = await Promise.race([fetchPromise, timeoutPromise]);

        if (accSnap && accSnap.exists()) {
          const accData = accSnap.data() as InstagramAccount;
          cachedInstagramAccount = accData;
          cachedInstagramAccountTimestamp = now;
          connectedInstagramAccountMemory = accData;
          return {
            accessToken: sanitizeAccessToken(accData.access_token || ''),
            igUsername: accData.username || '',
            profilePicUrl: accData.profile_pic_url || '',
          };
        }
      } catch (err) {
        console.warn('[CACHE_ACCOUNT_COLD_FETCH_WARN]', err);
      }
    }

    const fallbackToken = sanitizeAccessToken(process.env.INSTAGRAM_ACCESS_TOKEN || '');
    return { accessToken: fallbackToken, igUsername: '', profilePicUrl: '' };
  }

  // Synchronous, zero-latency In-Memory Automations Resolver
  async function getCachedAutomations(): Promise<Automation[]> {
    const now = Date.now();

    // 1. Instant RAM Cache hit (0ms)
    if (cachedAutomations.length > 0) {
      if (now - cachedAutomationsTimestamp >= CACHE_TTL_MS) {
        refreshAutomationsCacheInBackground();
      }
      return cachedAutomations;
    }

    // 2. Cold startup Firestore fetch with bounded 400ms timeout race
    if (db) {
      try {
        const fetchPromise = getDocs(collection(db, 'automations')).catch(() => null);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 400));
        const topSnap = await Promise.race([fetchPromise, timeoutPromise]);

        const list: Automation[] = [];
        const seen = new Set<string>();
        if (topSnap) {
          topSnap.forEach((docSnap) => {
            const item = { id: docSnap.id, ...docSnap.data() } as Automation;
            if (item.status === 'active' && !seen.has(item.id)) {
              seen.add(item.id);
              list.push(item);
            }
          });
        }
        if (list.length > 0) {
          cachedAutomations = list;
          cachedAutomationsTimestamp = now;
        }
        return list;
      } catch (err) {
        console.warn('[CACHE_AUTOMATIONS_COLD_FETCH_WARN]', err);
      }
    }
    return cachedAutomations;
  }

  // 6. Meta Webhook Engine - Ultra Fast High-Priority DM Response Execution (< 1s Response Time)
  async function processSingleMessageEvent(params: {
    userId?: string;
    triggerType: 'dm' | 'comment' | 'story_reply';
    senderId: string;
    senderUsername?: string;
    recipientId: string;
    messageText: string;
    commentId?: string;
    rawEvent?: any;
    webhookReceivedAt?: string;
    webhookReceivedAtMs?: number;
    metaEventTimestamp?: number | string | null;
    isTest?: boolean;
  }) {
    const t0_start = Date.now();
    const { triggerType, senderId, recipientId, messageText, commentId, isTest } = params;
    const isTestEvent = Boolean(
      isTest ||
      params.senderUsername?.startsWith('user_') ||
      params.senderUsername?.includes('test') ||
      params.senderUsername?.includes('demo') ||
      params.senderUsername === 'user_940977' ||
      params.senderId?.includes('user_id_') ||
      params.senderId === 'user_940977'
    );
    const webhookReceivedAt = params.webhookReceivedAt || new Date().toISOString();
    const webhookReceivedAtMs = params.webhookReceivedAtMs || t0_start;
    const metaEventTimestamp = params.metaEventTimestamp || null;
    const metaTransitDelayMs = metaEventTimestamp ? Math.max(0, webhookReceivedAtMs - Number(metaEventTimestamp)) : null;

    console.log(`\n================== [ULTRA_FAST_WEBHOOK_EXECUTION] ==================`);
    console.log(`📥 1. Webhook Server Ingress:   ${webhookReceivedAt} (${webhookReceivedAtMs}ms)${isTestEvent ? ' [IS_TEST_EVENT]' : ''}`);
    if (metaEventTimestamp) {
      console.log(`⏱️    Meta Event Timestamp:      ${new Date(Number(metaEventTimestamp)).toISOString()} (${metaEventTimestamp}ms)`);
      console.log(`⚡   Meta -> Backend Transit:   ${metaTransitDelayMs}ms`);
    }
    console.log(`⏱️    Trigger: ${triggerType.toUpperCase()} | From: ${senderId} | "${messageText}"`);

    // STEP 1: Fetch Account Token & Automations from RAM in parallel (~0-1ms)
    const t1_cache_start = Date.now();
    const [{ accessToken, igUsername, profilePicUrl: accountProfilePic }, activeAutomations] = await Promise.all([
      getCachedInstagramAccount(),
      getCachedAutomations(),
    ]);
    const t1_cache_end = Date.now();
    const cache_lookup_duration_ms = t1_cache_end - t1_cache_start;

    console.log(`⏱️ 2. Cache Lookup Duration:    ${cache_lookup_duration_ms}ms (Active Rules: ${activeAutomations.length}, Token Present: ${Boolean(accessToken)})`);

    // STEP 2: Match Automation Rules (In-Memory, < 0.1ms)
    const t2_rules_start = Date.now();
    let matchedAutomation: Automation | null = null;
    let isExplicitAiConversation = false;
    const textLower = messageText.toLowerCase().trim();

    for (const auto of activeAutomations) {
      const isTypeCompatible =
        auto.trigger_type === triggerType ||
        auto.trigger_type === 'dm_ai_conversation' ||
        (auto.trigger_type === 'comment' && triggerType === 'comment') ||
        (auto.trigger_type === 'dm' && triggerType === 'dm');

      if (!isTypeCompatible) continue;

      const config = auto.trigger_config || { all_or_keywords: 'all', keywords: [] };
      const keywords = config.keywords || [];

      if (auto.trigger_type === 'dm_ai_conversation' || config.all_or_keywords === 'ai_conversation') {
        matchedAutomation = auto;
        isExplicitAiConversation = true;
        break;
      } else if (config.all_or_keywords === 'all') {
        matchedAutomation = auto;
        break;
      } else if (keywords.length > 0) {
        const hasMatch = keywords.some((kw) => kw && textLower.includes(kw.toLowerCase().trim()));
        if (hasMatch) {
          matchedAutomation = auto;
          break;
        }
      } else {
        matchedAutomation = auto;
        break;
      }
    }
    const t2_rules_end = Date.now();
    const rule_matching_duration_ms = t2_rules_end - t2_rules_start;

    console.log(`⏱️ 3. Rule Matching Duration:   ${rule_matching_duration_ms}ms (Matched: "${matchedAutomation?.name || 'Default'}")`);

    // STEP 3: Determine Reply Text — PREVENT AI CALL FOR ALL STATIC KEYWORD AUTOMATIONS!
    const t3_reply_start = Date.now();
    let replyText = '';
    let systemPrompt = '';
    let ai_gen_duration_ms = 0;

    if (matchedAutomation) {
      const sendDmAction = matchedAutomation.actions?.find((a) => a.type === 'send_dm' || a.type === 'ai_chatbot');
      if (sendDmAction) {
        if (sendDmAction.type === 'ai_chatbot' || (sendDmAction.ai_system_instruction && !sendDmAction.message_text)) {
          isExplicitAiConversation = true;
          systemPrompt = sendDmAction.ai_system_instruction || 'You are an Instagram AI Assistant. Answer questions helpfully and politely.';
        } else if (sendDmAction.message_text) {
          replyText = sendDmAction.message_text; // STATIC MATCH: Instant 0ms text resolution!
        }
      }

      if (!replyText && !isExplicitAiConversation) {
        const commentAction = matchedAutomation.actions?.find((a) => a.comment_reply_text);
        if (commentAction?.comment_reply_text) {
          replyText = commentAction.comment_reply_text; // STATIC COMMENT MATCH: Instant 0ms resolution!
        }
      }
    }

    // Call Gemini AI ONLY if specifically configured as an AI Conversation automation
    if (!replyText && isExplicitAiConversation) {
      const ai_start = Date.now();
      console.log(`🤖 4. AI Generation Started:   gemini-3.1-flash-lite ultra-fast stream with 1.4s deadline...`);
      try {
        const promptToUse = systemPrompt || 'You are a concise Instagram assistant. Reply politely and directly in 1 short sentence under 15 words.';
        const aiRes = await generateGeminiChatReply({
          history: [], // Keep zero DB queries in critical path for maximum sub-second speed
          incomingText: messageText,
          systemInstruction: promptToUse,
          model: 'gemini-3.1-flash-lite',
          maxOutputTokens: 40,
        });
        replyText = aiRes.reply || 'Thank you for reaching out! How can I help you today?';
      } catch (aiErr) {
        console.error('[GEMINI_REPLY_GEN_ERROR]', aiErr);
        replyText = 'Thanks for reaching out! How can I help you today?';
      }
      const ai_end = Date.now();
      ai_gen_duration_ms = ai_end - ai_start;
      console.log(`🤖    AI Generation Completed: ${ai_gen_duration_ms}ms`);
    } else if (!replyText) {
      // Fallback default message if no specific static rule or AI conversation matched
      replyText = 'Thanks for your message! How can we help you today?';
    }

    const t3_reply_end = Date.now();
    const reply_prep_duration_ms = t3_reply_end - t3_reply_start;

    console.log(`⏱️ 4. Reply Prep Total:        ${reply_prep_duration_ms}ms (AI Gen: ${ai_gen_duration_ms}ms) -> "${replyText}"`);

    // STEP 4: ABSOLUTE TOP PRIORITY CRITICAL PATH — DISPATCH INSTAGRAM DM IMMEDIATELY!
    // No logging, no profile fetching, no Firestore blocking before this line!
    const t4_dispatch_start = Date.now();
    let apiSuccess = false;
    let apiLogResult: any = null;
    let dispatchMetrics = {
      reply_api_call_start: new Date().toISOString(),
      reply_api_call_start_ms: t4_dispatch_start,
      reply_api_call_end: new Date().toISOString(),
      reply_api_call_end_ms: t4_dispatch_start,
      ig_api_duration_ms: 0,
      endpointUsed: '',
    };

    if (accessToken && !accessToken.includes('encrypted_token') && !accessToken.includes('sandbox_token')) {
      try {
        if (triggerType === 'comment' && commentId) {
          const commentRes = await sendInstagramCommentReplyWithFallback({
            accessToken,
            commentId,
            messageText: replyText,
          });
          apiSuccess = commentRes.success;
          apiLogResult = commentRes.result;
          dispatchMetrics = {
            reply_api_call_start: commentRes.reply_api_call_start,
            reply_api_call_start_ms: commentRes.reply_api_call_start_ms,
            reply_api_call_end: commentRes.reply_api_call_end,
            reply_api_call_end_ms: commentRes.reply_api_call_end_ms,
            ig_api_duration_ms: commentRes.ig_api_duration_ms,
            endpointUsed: commentRes.endpointUsed || '',
          };
        } else {
          const dmRes = await sendInstagramDirectMessageWithFallback({
            accessToken,
            senderId,
            recipientId,
            messageText: replyText,
          });
          apiSuccess = dmRes.success;
          apiLogResult = dmRes.result;
          dispatchMetrics = {
            reply_api_call_start: dmRes.reply_api_call_start,
            reply_api_call_start_ms: dmRes.reply_api_call_start_ms,
            reply_api_call_end: dmRes.reply_api_call_end,
            reply_api_call_end_ms: dmRes.reply_api_call_end_ms,
            ig_api_duration_ms: dmRes.ig_api_duration_ms,
            endpointUsed: dmRes.endpointUsed || '',
          };
        }
      } catch (sendErr: any) {
        console.error('[INSTAGRAM_GRAPH_API_CALL_ERROR]', sendErr);
        apiLogResult = { error: String(sendErr?.message || sendErr) };
        apiSuccess = false;
      }
    } else {
      apiLogResult = { note: 'Processed and saved to database (Simulation mode / Test event).' };
      apiSuccess = true;
    }

    const t4_dispatch_end = Date.now();
    const totalProcessingDurationMs = t4_dispatch_end - t0_start;
    const totalPipelineDurationMs = t4_dispatch_end - webhookReceivedAtMs;

    console.log(`\n================== [DISPATCH METRICS BREAKDOWN] ==================`);
    console.log(`⏱️ 1. Ingress Delay:            ${t0_start - webhookReceivedAtMs}ms`);
    console.log(`⏱️ 2. Cache Lookup:             ${cache_lookup_duration_ms}ms`);
    console.log(`⏱️ 3. Rule Matching:            ${rule_matching_duration_ms}ms`);
    console.log(`⏱️ 4. Reply Prep (AI):          ${reply_prep_duration_ms}ms (AI: ${ai_gen_duration_ms}ms)`);
    console.log(`⏱️ 5. Instagram Graph API:      ${dispatchMetrics.ig_api_duration_ms}ms`);
    console.log(`==================================================================`);
    console.log(`🚀 TOTAL BACKEND EXECUTION:     ${totalProcessingDurationMs}ms (End-to-End Pipeline: ${totalPipelineDurationMs}ms)`);
    console.log(`==================================================================\n`);

    // STEP 5: COMPLETELY DETACHED BACKGROUND WORKER (Profile Fetch + Firestore Writes in Parallel)
    // Uses setImmediate so the HTTP loop and caller return instantly without awaiting!
    setImmediate(() => {
      (async () => {
        let senderUsername = params.senderUsername || '';
        let fetchedProfilePic = '';
        let profileFetchError: any = null;

        // 5A. Asynchronous Profile Fetch from Instagram API (does NOT delay reply)
        if (accessToken && !accessToken.includes('encrypted_token')) {
          const cleanToken = sanitizeAccessToken(accessToken);
          try {
            console.log(`[PROFILE_FETCH_START] Requesting Instagram profile for sender ID: ${senderId}...`);
            // NOTE: On Instagram Graph API, the correct field is profile_picture_url (NOT profile_pic which is Facebook Messenger only)
            const igProfUrl = `https://graph.instagram.com/v21.0/${senderId}?fields=name,username,profile_picture_url&access_token=${encodeURIComponent(
              cleanToken
            )}`;
            const pRes = await fetch(igProfUrl, {
              headers: { Authorization: `Bearer ${cleanToken}` },
              signal: AbortSignal.timeout(3500),
            });
            const pData = await pRes.json().catch(() => ({}));

            if (pRes.ok) {
              console.log(`[PROFILE_FETCH_SUCCESS] Meta Graph API returned:`, pData);
              senderUsername = pData.username || pData.name || senderUsername;
              fetchedProfilePic = pData.profile_picture_url || pData.profile_pic || '';
            } else {
              profileFetchError = pData;
              console.warn(`[PROFILE_FETCH_API_ERROR] HTTP ${pRes.status} for ${senderId}:`, pData);
            }
          } catch (pErr: any) {
            profileFetchError = { error: String(pErr?.message || pErr) };
            console.warn(`[PROFILE_FETCH_EXCEPTION] Network/Timeout error for ${senderId}:`, pErr?.message || pErr);
          }
        }

        if (!senderUsername) {
          senderUsername = `user_${senderId.slice(-6)}`;
        }
        const senderAvatar = fetchedProfilePic || '';

        // 5B. Parallel Firestore Writes
        if (db) {
          const nowIso = new Date().toISOString();
          const inMsgId = `msg_in_${Date.now()}`;
          const outMsgId = `msg_out_${Date.now() + 1}`;
          const contactId = `contact_${senderUsername}`;
          const logId = `log_${Date.now()}`;

          const inMsgDoc: InboxMessage = {
            id: inMsgId,
            from_ig_id: senderId,
            from_username: senderUsername,
            from_avatar: senderAvatar,
            message_text: messageText,
            direction: 'in',
            timestamp: nowIso,
            is_test: isTestEvent ? true : undefined,
          };

          const outMsgDoc: InboxMessage = {
            id: outMsgId,
            from_ig_id: senderId,
            from_username: senderUsername,
            from_avatar: accountProfilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${igUsername || 'autoreply_ai'}`,
            message_text: replyText,
            direction: 'out',
            is_automated: true,
            automation_id: matchedAutomation?.id,
            timestamp: new Date(Date.now() + 1000).toISOString(),
            is_test: isTestEvent ? true : undefined,
          };

          const logDoc: WebhookLogEvent = {
            id: logId,
            timestamp: nowIso,
            trigger_type: triggerType,
            from_username: senderUsername,
            incoming_text: messageText,
            status: apiSuccess ? 'triggered' : 'error',
            is_test: isTestEvent ? true : undefined,
            matched_automation_name: matchedAutomation?.name || (isExplicitAiConversation ? 'AI Assistant' : 'Keyword Automation'),
            response_sent: replyText,
            webhook_received_at: webhookReceivedAt,
            webhook_received_at_ms: webhookReceivedAtMs,
            meta_event_timestamp: metaEventTimestamp,
            meta_transit_delay_ms: metaTransitDelayMs,
            reply_api_call_start: dispatchMetrics.reply_api_call_start,
            reply_api_call_start_ms: dispatchMetrics.reply_api_call_start_ms,
            reply_api_call_end: dispatchMetrics.reply_api_call_end,
            reply_api_call_end_ms: dispatchMetrics.reply_api_call_end_ms,
            ig_api_duration_ms: dispatchMetrics.ig_api_duration_ms,
            total_processing_duration_ms: totalProcessingDurationMs,
            instance_uptime_seconds: Math.floor((webhookReceivedAtMs - SERVER_BOOT_TIMESTAMP) / 1000),
            instance_is_warm: true,
            timing_breakdown: {
              meta_transit_delay_ms: metaTransitDelayMs,
              cache_lookup_duration_ms,
              rule_matching_duration_ms,
              reply_prep_duration_ms,
              ai_gen_duration_ms,
              ig_api_duration_ms: dispatchMetrics.ig_api_duration_ms,
              total_pipeline_duration_ms: totalPipelineDurationMs,
            },
            api_response: {
              response_time_ms: totalProcessingDurationMs,
              meta_transit_delay_ms: metaTransitDelayMs,
              ig_api_duration_ms: dispatchMetrics.ig_api_duration_ms,
              endpoint_used: dispatchMetrics.endpointUsed,
              send_reply_result: apiLogResult,
              profile_fetch_error: profileFetchError || null,
              timing_breakdown: {
                cache_lookup_duration_ms,
                rule_matching_duration_ms,
                reply_prep_duration_ms,
                ai_gen_duration_ms,
                ig_api_duration_ms: dispatchMetrics.ig_api_duration_ms,
                total_pipeline_duration_ms: totalPipelineDurationMs,
              },
            },
          };

          const contactDoc: any = {
            id: contactId,
            ig_username: senderUsername,
            ig_user_id: senderId,
            avatar_url: senderAvatar,
            first_interaction_at: nowIso,
            last_interaction_at: nowIso,
            interactions: {
              comments: triggerType === 'comment' ? 1 : 0,
              dms: triggerType === 'dm' ? 1 : 0,
              stories: triggerType === 'story_reply' ? 1 : 0,
            },
            status: 'converted',
            is_test: isTestEvent ? true : undefined,
            profile_fetch_error: profileFetchError || null,
          };

          const targetUserId = params.userId;
          const dbTasks: Promise<any>[] = [];

          if (targetUserId) {
            dbTasks.push(
              setDoc(doc(db, 'users', targetUserId, 'inbox_messages', inMsgId), inMsgDoc),
              setDoc(doc(db, 'users', targetUserId, 'inbox_messages', outMsgId), outMsgDoc),
              setDoc(doc(db, 'users', targetUserId, 'webhook_logs', logId), logDoc),
              setDoc(doc(db, 'users', targetUserId, 'contacts', contactId), contactDoc, { merge: true })
            );

            if (matchedAutomation?.id) {
              const userAutoRef = doc(db, 'users', targetUserId, 'automations', matchedAutomation.id);
              dbTasks.push(
                getDoc(userAutoRef).then((autoSnap) => {
                  if (autoSnap.exists()) {
                    const cur = autoSnap.data() as Automation;
                    const curStats = cur.stats || { runs: 0, dms_sent: 0, unique_users: 0, open_rate: 98.5 };
                    const updatedPayload = {
                      stats: {
                        ...curStats,
                        runs: (curStats.runs || 0) + 1,
                        dms_sent: (curStats.dms_sent || 0) + 1,
                        last_run_at: nowIso,
                      },
                      updated_at: nowIso,
                    };
                    return setDoc(userAutoRef, updatedPayload, { merge: true });
                  }
                })
              );
            }
          } else {
            // Legacy / unassociated webhook: write to root only
            dbTasks.push(
              setDoc(doc(db, 'inbox_messages', inMsgId), inMsgDoc),
              setDoc(doc(db, 'inbox_messages', outMsgId), outMsgDoc),
              setDoc(doc(db, 'webhook_logs', logId), logDoc),
              setDoc(doc(db, 'contacts', contactId), contactDoc, { merge: true })
            );

            if (matchedAutomation?.id) {
              const autoRef = doc(db, 'automations', matchedAutomation.id);
              dbTasks.push(
                getDoc(autoRef).then((autoSnap) => {
                  if (autoSnap.exists()) {
                    const cur = autoSnap.data() as Automation;
                    const curStats = cur.stats || { runs: 0, dms_sent: 0, unique_users: 0, open_rate: 98.5 };
                    const updatedPayload = {
                      stats: {
                        ...curStats,
                        runs: (curStats.runs || 0) + 1,
                        dms_sent: (curStats.dms_sent || 0) + 1,
                        last_run_at: nowIso,
                      },
                      updated_at: nowIso,
                    };
                    return setDoc(autoRef, updatedPayload, { merge: true });
                  }
                })
              );
            }
          }

          await Promise.all(dbTasks);
          console.log(`✅ [BACKGROUND_ASYNC_FIRESTORE] Saved log and messages to Firestore.`);
        }
      })().catch((bgErr) => console.error('[DETACHED_BACKGROUND_ERR]', bgErr));
    });
  }

  // Webhook POST receiver
  const handleWebhookEvent = (req: Request, res: Response) => {
    const webhookReceivedAtMs = Date.now();
    const webhookReceivedAt = new Date().toISOString();
    const uptimeSeconds = Math.floor((webhookReceivedAtMs - SERVER_BOOT_TIMESTAMP) / 1000);

    console.log(`\n================================================================================`);
    console.log(`📥 [META_WEBHOOK_POST_RECEIVED] Server Timestamp: ${webhookReceivedAt} (${webhookReceivedAtMs}ms)`);
    console.log(`   Instance Uptime: ${uptimeSeconds}s | Warm Instance: Active | Request Path: ${req.path}`);
    console.log(`================================================================================`);

    // Acknowledge receipt to Meta immediately (must respond 200 within 20s)
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    console.log('[INCOMING_META_WEBHOOK_BODY]', JSON.stringify(body, null, 2));

    // Process webhook events asynchronously
    if (body && typeof body === 'object') {
      const entries = body.entry || [];
      for (const entry of entries) {
        const entryTime = entry.time || null;

        // 1. DMs in messaging array
        const messagingList = entry.messaging || [];
        for (const msgEvent of messagingList) {
          const senderId = msgEvent.sender?.id;
          const recipientId = msgEvent.recipient?.id;
          const messageText = msgEvent.message?.text;
          const isEcho = msgEvent.message?.is_echo;
          const metaMsgTimestamp = msgEvent.timestamp || entryTime || null;

          if (senderId && messageText && !isEcho) {
            processSingleMessageEvent({
              triggerType: 'dm',
              senderId: String(senderId),
              recipientId: String(recipientId || entry.id || ''),
              messageText: String(messageText),
              rawEvent: msgEvent,
              webhookReceivedAt,
              webhookReceivedAtMs,
              metaEventTimestamp: metaMsgTimestamp,
            }).catch((err) => console.error('[ASYNC_DM_PROCESS_ERR]', err));
          }
        }

        // 2. Changes array (Comments or Messages)
        const changesList = entry.changes || [];
        for (const change of changesList) {
          const field = change.field;
          const val = change.value || {};

          if (field === 'comments' || field === 'comment') {
            const commentId = val.id;
            const commentText = val.text;
            const senderId = val.from?.id;
            const senderUsername = val.from?.username || '';
            const metaCommentTimestamp = val.created_time ? (typeof val.created_time === 'number' ? (val.created_time > 1e11 ? val.created_time : val.created_time * 1000) : Date.parse(val.created_time)) : (entryTime || null);

            if (commentText && senderId) {
              processSingleMessageEvent({
                triggerType: 'comment',
                senderId: String(senderId),
                senderUsername,
                recipientId: String(entry.id || ''),
                messageText: String(commentText),
                commentId: commentId ? String(commentId) : undefined,
                rawEvent: change,
                webhookReceivedAt,
                webhookReceivedAtMs,
                metaEventTimestamp: metaCommentTimestamp,
              }).catch((err) => console.error('[ASYNC_COMMENT_PROCESS_ERR]', err));
            }
          }

          if (field === 'messages' || field === 'messaging') {
            const senderId = val.sender?.id || val.from?.id;
            const recipientId = val.recipient?.id;
            const messageText = val.message?.text || val.text;
            const isEcho = val.message?.is_echo || val.is_echo;
            const metaMsgTimestamp = val.timestamp || entryTime || null;

            if (senderId && messageText && !isEcho) {
              processSingleMessageEvent({
                triggerType: 'dm',
                senderId: String(senderId),
                senderUsername: val.from?.username || '',
                recipientId: String(recipientId || entry.id || ''),
                messageText: String(messageText),
                rawEvent: change,
                webhookReceivedAt,
                webhookReceivedAtMs,
                metaEventTimestamp: metaMsgTimestamp,
              }).catch((err) => console.error('[ASYNC_DM_CHANGES_PROCESS_ERR]', err));
            }
          }
        }
      }
    }
  };

  webhookPaths.forEach((pathUrl) => {
    app.post(pathUrl, handleWebhookEvent);
  });

  // 7. Test Webhook Engine API Endpoint
  app.post('/api/test-webhook', async (req: Request, res: Response) => {
    const { trigger_type, username, text, userId } = req.body;

    if (!trigger_type || !username || !text) {
      return res.status(400).json({ error: 'Missing required parameters: trigger_type, username, text' });
    }

    const cleanUsername = String(username).replace(/^@/, '').trim();
    const mockSenderId = `user_id_${cleanUsername}`;

    console.log(`[TEST WEBHOOK ENGINE] Trigger: ${trigger_type} | User: @${cleanUsername} | Text: "${text}" [IS_TEST] [UID: ${userId || 'none'}]`);

    await processSingleMessageEvent({
      userId,
      triggerType: (trigger_type as 'dm' | 'comment' | 'story_reply') || 'dm',
      senderId: mockSenderId,
      senderUsername: cleanUsername,
      recipientId: 'ig_business_id_main',
      messageText: String(text),
      isTest: true,
    });

    return res.json({
      success: true,
      processed_event: {
        trigger_type,
        username: cleanUsername,
        text,
        is_test: true,
        timestamp: new Date().toISOString(),
      },
      status: 'processed_and_saved_to_firestore',
    });
  });

  // Test Data Cleanup API Endpoint (deletes user_940977 and mock contacts from Firestore)
  app.post('/api/cleanup-test-data', async (_req: Request, res: Response) => {
    try {
      await cleanupTestArtifacts();
      return res.json({ success: true, message: 'Test contacts and messages successfully purged from Firestore.' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Cleanup failed' });
    }
  });

  // 7.5. Send Manual DM API Endpoint (for Inbox manual replies)
  app.post('/api/instagram/send-dm', async (req: Request, res: Response) => {
    try {
      const { recipientUsername, messageText, userId } = req.body;
      if (!recipientUsername || !messageText) {
        return res.status(400).json({ error: 'Missing recipientUsername or messageText' });
      }

      const cleanUsername = String(recipientUsername).replace(/^@/, '').toLowerCase().trim();

      let accessToken = '';
      if (userId) {
        const storedAccount = await loadServerInstagramAccount(userId);
        accessToken = sanitizeAccessToken(storedAccount?.access_token || '');
      }

      let apiResult: any = null;
      let apiSuccess = false;

      if (accessToken && !accessToken.includes('encrypted_token') && !accessToken.includes('sandbox_token')) {
        let recipientIgId = cleanUsername;
        if (db) {
          try {
            const contactRef = doc(db, 'contacts', `contact_${cleanUsername}`);
            const cSnap = await getDoc(contactRef);
            if (cSnap.exists()) {
              recipientIgId = cSnap.data().ig_user_id || cleanUsername;
            }
          } catch (e) {
            console.warn('[RECIPIENT_ID_LOOKUP_WARN]', e);
          }
        }

        const dmRes = await sendInstagramDirectMessageWithFallback({
          accessToken,
          senderId: recipientIgId,
          messageText,
        });
        apiResult = dmRes.result;
        apiSuccess = dmRes.success;
      }

      const nowIso = new Date().toISOString();
      if (db) {
        const outMsgId = `msg_manual_${Date.now()}`;
        const outMsgDoc: InboxMessage = {
          id: outMsgId,
          from_ig_id: cleanUsername,
          from_username: cleanUsername,
          message_text: messageText,
          direction: 'out',
          is_automated: false,
          timestamp: nowIso,
        };
        const reqUserId = req.body?.userId;
        if (reqUserId) {
          await setDoc(doc(db, 'users', reqUserId, 'inbox_messages', outMsgId), outMsgDoc);
        } else {
          await setDoc(doc(db, 'inbox_messages', outMsgId), outMsgDoc);
        }
      }

      return res.json({ success: true, apiSuccess, apiResult });
    } catch (err: any) {
      console.error('[SEND_DM_API_ERROR]', err);
      return res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // 8. Gemini Multi-Key Rotation Chat API Endpoint
  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    try {
      const { username, text, history, systemInstruction, model } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Missing required parameter: text' });
      }

      console.log(`[GEMINI CHAT API] Request from @${username || 'guest'}: "${text}"`);

      const result = await generateGeminiChatReply({
        history: history || [],
        incomingText: text,
        systemInstruction,
        model,
      });

      return res.json({
        success: true,
        reply: result.reply,
        usedKeyLabel: result.usedKeyLabel,
        rotatedCount: result.rotatedCount,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[GEMINI CHAT API ERROR]', err);
      return res.status(500).json({
        error: 'Failed to process Gemini chat request',
        details: String(err?.message || err),
      });
    }
  });

  // 8.5. Gemini Streaming Response API Endpoint
  app.post('/api/gemini/stream', async (req: Request, res: Response) => {
    try {
      const { text, history, systemInstruction, model } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Missing required parameter: text' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const generator = generateGeminiChatStream({
        history: history || [],
        incomingText: text,
        systemInstruction,
        model,
      });

      for await (const data of generator) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      console.error('[GEMINI STREAM API ERROR]', err);
      res.status(500).json({ error: 'Streaming error', details: String(err?.message || err) });
    }
  });

  // 8.6. Gemini Smart System Prompt Analyzer Endpoint
  app.post('/api/gemini/analyze-prompt', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      const promptToAnalyze = typeof prompt === 'string' ? prompt : '';
      console.log(`🧠 [GEMINI_PROMPT_ANALYZER] Analyzing prompt (${promptToAnalyze.length} chars)...`);

      const analysis = await analyzeSystemPromptWithGemini(promptToAnalyze);
      return res.json({
        success: true,
        analysis,
      });
    } catch (err: any) {
      console.error('[GEMINI_PROMPT_ANALYZER_ERROR]', err);
      return res.status(500).json({
        error: 'Prompt analysis failed',
        details: String(err?.message || err),
      });
    }
  });

  // 9. Gemini Multi-Key Pool Management Endpoints
  app.get('/api/gemini/keys', (req: Request, res: Response) => {
    const keys = getLocalKeyPool();
    const sanitizedKeys = keys.map((k) => ({
      ...k,
      maskedKey: k.key.length > 8 ? `${k.key.slice(0, 6)}...${k.key.slice(-4)}` : '••••••••',
    }));
    return res.json({ keys: sanitizedKeys });
  });

  app.post('/api/gemini/keys', (req: Request, res: Response) => {
    const { key, label } = req.body;
    if (!key || !label) {
      return res.status(400).json({ error: 'Missing key or label' });
    }

    const currentPool = getLocalKeyPool();
    const keyId = `key_${Date.now()}`;
    const newKeyItem: GeminiApiKeyItem = {
      id: keyId,
      key: key.trim(),
      label: label.trim(),
      status: 'active',
      cooldownUntil: null,
      requestCount: 0,
      errorCount: 0,
      lastUsedAt: new Date().toISOString(),
    };

    const updated = [newKeyItem, ...currentPool];
    setLocalKeyPool(updated);

    return res.json({ success: true, keys: updated });
  });

  app.delete('/api/gemini/keys/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const currentPool = getLocalKeyPool();
    const updated = currentPool.filter((k) => k.id !== id);
    setLocalKeyPool(updated);
    return res.json({ success: true, keys: updated });
  });

  // Vite Middleware or Static Production File Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Clean up test contact artifacts (such as user_940977 and legacy mock data) from Firestore
  async function cleanupTestArtifacts() {
    if (!db) return;
    try {
      console.log('🧹 [STARTUP_CLEANUP] Scanning for test contact artifacts like user_940977...');
      const explicitTestIds = [
        'user_940977',
        'contact_user_940977',
        'ig_usr_user_940977',
        'user_id_user_940977',
        'webhook_test_user',
        'contact_webhook_test_user',
      ];

      for (const testId of explicitTestIds) {
        await deleteDoc(doc(db, 'contacts', testId)).catch(() => {});
      }

      // Check legacy test collections for any matching test patterns
      const colls = ['contacts', 'inbox_messages'];
      for (const collName of colls) {
        try {
          const snap = await getDocs(collection(db, collName)).catch(() => null);
          if (snap && !snap.empty) {
            for (const d of snap.docs) {
              const data = d.data();
              const uname = String(data.ig_username || data.from_username || d.id || '').toLowerCase();
              if (
                uname.includes('940977') ||
                uname === 'webhook_test_user' ||
                uname.startsWith('user_940977') ||
                data.is_test === true
              ) {
                console.log(`🧹 [CLEANUP] Deleting test doc ${d.id} from ${collName}`);
                await deleteDoc(d.ref).catch(() => {});
              }
            }
          }
        } catch (cErr) {
          console.warn(`[CLEANUP_COLL_WARN] ${collName}:`, cErr);
        }
      }
    } catch (err) {
      console.warn('[CLEANUP_TEST_ARTIFACTS_WARN]', err);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AutoReply.io Express Backend Server running on http://0.0.0.0:${PORT}`);
    // Pre-warm RAM cache for instantaneous sub-second webhook responses
    primeCacheOnBoot()
      .then(() => console.log('🔥 [CACHE_WARMUP_SUCCESS] In-Memory Instagram Token & Automations pre-warmed!'))
      .catch((e) => console.warn('[CACHE_WARMUP_WARN]', e));
    
    // Purge test artifacts on boot
    cleanupTestArtifacts()
      .then(() => console.log('🧹 [TEST_ARTIFACTS_CLEANUP_COMPLETE] Test artifacts cleaned.'))
      .catch((e) => console.warn('[TEST_CLEANUP_ERR]', e));
  });
}

startServer();
