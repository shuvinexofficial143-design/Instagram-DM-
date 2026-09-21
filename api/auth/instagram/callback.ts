import { createHmac, timingSafeEqual } from 'node:crypto';

const PROD_ORIGIN = 'https://autoreplys.vercel.app';
const SUPABASE_URL = 'https://dwgxmmftybxwpurgsxkx.supabase.co';
const META_APP_ID = String(process.env.INSTAGRAM_APP_ID || '').trim();
const META_APP_SECRET = String(process.env.INSTAGRAM_APP_SECRET || '').trim();
const OAUTH_STATE_SECRET = String(
  process.env.AUTH_SESSION_SECRET || process.env.INSTAGRAM_APP_SECRET || ''
).trim();

type StoredInstagramAccount = {
  id: string;
  ig_user_id: string;
  username: string;
  profile_pic_url?: string;
  followers_count?: number;
  access_token: string;
  token_expires_at?: string;
  connected_at: string;
  status: 'connected';
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderError(res: any, message: string, status = 400) {
  return res.status(status).send(`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Instagram connection failed</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px">
  <div style="max-width:440px;background:white;border:1px solid #e2e8f0;border-radius:20px;padding:28px;box-shadow:0 12px 40px rgba(15,23,42,.08);text-align:center">
    <h2 style="margin:0 0 10px;color:#be123c">Instagram connection failed</h2>
    <p style="color:#475569;line-height:1.6;font-size:14px">${escapeHtml(message)}</p>
    <button onclick="window.close()" style="border:0;background:#2563eb;color:white;border-radius:10px;padding:11px 18px;font-weight:700">Close</button>
  </div>
</body>
</html>`);
}

function getRedirectUri(req: any): string {
  const configured = String(process.env.REDIRECT_URI || '').trim();
  const host = String(req?.headers?.host || '').trim().toLowerCase();
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();

  if (host === 'autoreplys.vercel.app') {
    return `${PROD_ORIGIN}/api/auth/instagram/callback`;
  }

  if (configured && !configured.includes('localhost')) return configured;
  if (host) return `${proto}://${host}/api/auth/instagram/callback`;
  return `${PROD_ORIGIN}/api/auth/instagram/callback`;
}

function isWorkspaceId(value: string): boolean {
  return /^guest_[a-f0-9-]{16,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function verifyOAuthState(rawState: unknown): string {
  if (!rawState || !OAUTH_STATE_SECRET) return '';

  let parsed: any;
  const raw = String(rawState);
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON.parse(decodeURIComponent(raw));
    } catch {
      return '';
    }
  }

  const workspaceId = String(parsed?.workspaceId || '');
  const ts = Number(parsed?.ts || 0);
  const sig = String(parsed?.sig || '');

  if (!isWorkspaceId(workspaceId) || !Number.isFinite(ts) || !sig) return '';
  if (Math.abs(Date.now() - ts) > 15 * 60 * 1000) return '';

  const expected = createHmac('sha256', OAUTH_STATE_SECRET)
    .update(`${workspaceId}:${ts}`)
    .digest('hex');

  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return '';
  } catch {
    return '';
  }

  return workspaceId;
}

function sanitizeAccessToken(value: unknown): string {
  if (!value) return '';

  let token = String(value).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  try {
    let previous = '';
    while (token.includes('%') && token !== previous) {
      previous = token;
      token = decodeURIComponent(token);
    }
  } catch {}

  return token.trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function persistInstagramAccount(
  workspaceId: string,
  account: StoredInstagramAccount
): Promise<void> {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/functions/v1/instagram-account-store`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        workspaceId,
        accessToken: account.access_token,
      }),
    },
    20000
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    console.error(
      '[INSTAGRAM_EDGE_STORE_FAILED]',
      response.status,
      payload?.error || payload,
      payload?.detail || ''
    );
    throw new Error(
      payload?.detail ||
        payload?.error ||
        `Instagram account storage failed (HTTP ${response.status})`
    );
  }
}
async function subscribeInstagramApp(igUserId: string, accessToken: string): Promise<void> {
  const token = sanitizeAccessToken(accessToken);
  if (!token || !igUserId) return;

  const fields =
    'messages,messaging_postbacks,message_deliveries,message_reads,comments,mentions';
  const urls = [
    `https://graph.instagram.com/v21.0/${encodeURIComponent(igUserId)}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
    `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
        10000
      );
      if (response.ok) return;

      const body = await response.text();
      console.warn('[INSTAGRAM_SUBSCRIBE_WARN]', response.status, body);
    } catch (err) {
      console.warn('[INSTAGRAM_SUBSCRIBE_ERROR]', err);
    }
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).send('Method Not Allowed');
    }

    // This gives us a direct way to verify that the callback function itself
    // can boot on Vercel without consuming a one-time Instagram OAuth code.
    if (String(req.query?.health || '') === '1') {
      return res.status(200).json({
        ok: true,
        callbackRuntime: 'ready',
        instagramAppConfigured: Boolean(META_APP_ID && META_APP_SECRET),
        stateSecretConfigured: Boolean(OAUTH_STATE_SECRET),
        supabaseConfigured: Boolean(SUPABASE_URL),
        storageMode: 'supabase-edge-function',
        redirectUri: getRedirectUri(req),
      });
    }

    if (!META_APP_ID || !META_APP_SECRET) {
      return renderError(res, 'Instagram OAuth server credentials are missing.', 503);
    }

    if (!OAUTH_STATE_SECRET) {
      return renderError(res, 'Instagram OAuth session secret is missing.', 503);
    }

    const { code, error, error_reason, error_description, state } = req.query || {};

    if (error || error_reason) {
      return renderError(
        res,
        String(error_description || error_reason || error || 'Meta authorization was cancelled.')
      );
    }

    const workspaceId = verifyOAuthState(state);
    if (!workspaceId) {
      return renderError(
        res,
        'The Instagram login session expired or was invalid. Please connect Instagram again.'
      );
    }

    if (!code) {
      return renderError(res, 'Instagram did not return an authorization code.');
    }

    const redirectUri = getRedirectUri(req);

    let shortToken = '';
    let longToken = '';
    let igUserId = '';

    try {
      const form = new URLSearchParams();
      form.set('client_id', META_APP_ID);
      form.set('client_secret', META_APP_SECRET);
      form.set('grant_type', 'authorization_code');
      form.set('redirect_uri', redirectUri);
      form.set('code', String(code));

      const tokenRes = await fetchWithTimeout(
        'https://api.instagram.com/oauth/access_token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        },
        15000
      );

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.error('[INSTAGRAM_TOKEN_EXCHANGE_FAILED]', tokenRes.status, body);
        return renderError(
          res,
          'Meta could not complete the Instagram token exchange. Please connect Instagram again.'
        );
      }

      const tokenData: any = await tokenRes.json();
      shortToken = sanitizeAccessToken(tokenData?.access_token);
      igUserId = tokenData?.user_id ? String(tokenData.user_id) : '';
    } catch (err) {
      console.error('[INSTAGRAM_TOKEN_EXCHANGE_ERROR]', err);
      return renderError(res, 'Instagram token exchange failed unexpectedly.');
    }

    if (!shortToken) {
      return renderError(res, 'Meta did not return a valid Instagram access token.');
    }

    try {
      const longParams = new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: META_APP_SECRET,
        access_token: shortToken,
      });

      const longRes = await fetchWithTimeout(
        `https://graph.instagram.com/access_token?${longParams.toString()}`,
        {},
        15000
      );

      if (longRes.ok) {
        const longData: any = await longRes.json();
        longToken = sanitizeAccessToken(longData?.access_token);
      } else {
        const body = await longRes.text();
        console.warn('[INSTAGRAM_LONG_TOKEN_WARN]', longRes.status, body);
      }
    } catch (err) {
      console.warn('[INSTAGRAM_LONG_TOKEN_ERROR]', err);
    }

    const accessToken = sanitizeAccessToken(longToken || shortToken);

    let username = '';
    let profilePicUrl = '';
    let followersCount = 0;

    try {
      const meParams = new URLSearchParams({
        fields: 'id,username,name,profile_picture_url,followers_count',
        access_token: accessToken,
      });

      const meRes = await fetchWithTimeout(
        `https://graph.instagram.com/v21.0/me?${meParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        15000
      );

      if (!meRes.ok) {
        const body = await meRes.text();
        console.error('[INSTAGRAM_ME_FAILED]', meRes.status, body);
        return renderError(res, 'Meta did not verify a professional Instagram account.');
      }

      const me: any = await meRes.json();
      igUserId = me?.id ? String(me.id) : igUserId;
      username = String(me?.username || '').trim();
      profilePicUrl = String(me?.profile_picture_url || '').trim();
      followersCount = Number(me?.followers_count || 0);
    } catch (err) {
      console.error('[INSTAGRAM_ME_ERROR]', err);
      return renderError(res, 'Could not read the Instagram account profile from Meta.');
    }

    if (!igUserId || !username) {
      return renderError(res, 'Meta did not return a verified Instagram professional account.');
    }

    const account: StoredInstagramAccount = {
      id: 'primary',
      ig_user_id: igUserId,
      username,
      profile_pic_url:
        profilePicUrl ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}`,
      followers_count: followersCount,
      access_token: accessToken,
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      status: 'connected',
    };

    try {
      await persistInstagramAccount(workspaceId, account);
    } catch (err: any) {
      console.error('[INSTAGRAM_PERSIST_FAILED]', err);
      return renderError(
        res,
        'Instagram login worked, but the account could not be saved securely: ' +
          (err?.message || 'unknown storage error'),
        500
      );
    }

    // Webhook delivery is required for DM automation. Finish the subscription
    // before completing OAuth so a serverless invocation cannot terminate it early.
    await subscribeInstagramApp(igUserId, accessToken);

    const safeUsername = escapeHtml(username);
    const safeProfilePic = escapeHtml(profilePicUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}`);
    const safeFollowers = Number(followersCount || 0).toLocaleString('en-US');
    return res.status(200).send(`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Instagram connected</title>
</head>
<body style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7FAFF;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">
  <main style="width:100%;max-width:430px;background:#FCFDFF;border:1px solid #dbeafe;border-radius:28px;box-shadow:0 24px 70px rgba(30,64,175,.14);overflow:hidden">
    <div style="height:6px;background:linear-gradient(90deg,#2563eb,#4f46e5,#7c3aed)"></div>
    <div style="padding:32px 28px 28px;text-align:center">
      <div style="width:78px;height:78px;margin:0 auto 16px;position:relative">
        <img src="${safeProfilePic}" alt="@${safeUsername}" style="width:78px;height:78px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 5px 20px rgba(15,23,42,.15)" />
        <div style="position:absolute;right:-2px;bottom:1px;width:25px;height:25px;border-radius:50%;background:#16a34a;border:3px solid #FCFDFF;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800">✓</div>
      </div>
      <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:11px;font-weight:750;letter-spacing:.04em;margin-bottom:12px">META VERIFIED</div>
      <h1 style="margin:0;color:#0f172a;font-size:23px;line-height:1.25;font-weight:750;letter-spacing:-.02em">@${safeUsername}</h1>
      <p style="margin:6px 0 0;color:#64748b;font-size:14px;font-weight:600">${safeFollowers} followers</p>
      <div style="height:1px;background:#e2e8f0;margin:24px 0"></div>
      <h2 style="margin:0;color:#172554;font-size:17px;font-weight:750">Instagram connected successfully</h2>
      <p style="margin:8px auto 0;max-width:330px;color:#64748b;line-height:1.55;font-size:13px">Your account is securely connected to AutoReply and ready for automation.</p>
      <div style="margin-top:22px;padding:12px 14px;border:1px solid #dbeafe;border-radius:14px;background:#F7FAFF;color:#475569;font-size:12px;font-weight:600">Returning to your dashboard…</div>
    </div>
  </main>
  <script>
    (function () {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'ig_connected' }, window.location.origin);
          setTimeout(function () { window.close(); }, 1200);
          return;
        }
      } catch (e) {}
      setTimeout(function () {
        window.location.replace('/?tab=settings&status=ig_connected');
      }, 1200);
    })();
  </script>
</body>
</html>`);
  } catch (err: any) {
    console.error('[INSTAGRAM_CALLBACK_FATAL]', err);
    return renderError(
      res,
      err?.message || String(err) || 'Instagram connection failed unexpectedly.',
      500
    );
  }
}
