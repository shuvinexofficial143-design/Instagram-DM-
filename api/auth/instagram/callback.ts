import {
  escapeHtml,
  getInstagramRedirectUri,
  metaAppId,
  metaAppSecret,
  persistInstagramAccount,
  sanitizeAccessToken,
  subscribeInstagramApp,
  verifyOAuthState,
  type StoredInstagramAccount,
} from '../../../src/server/instagramVercel';

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  if (!metaAppId || !metaAppSecret) {
    return renderError(res, 'Instagram OAuth server credentials are missing.', 503);
  }

  const { code, error, error_reason, error_description, state } = req.query || {};
  if (error || error_reason) {
    return renderError(
      res,
      String(error_description || error_reason || error || 'Meta authorization was cancelled.')
    );
  }

  const userId = verifyOAuthState(state);
  if (!userId) {
    return renderError(res, 'The Instagram login session expired or was invalid. Please try again.');
  }

  if (!code) {
    return renderError(res, 'Instagram did not return an authorization code.');
  }

  const redirectUri = getInstagramRedirectUri(req);

  let shortToken = '';
  let longToken = '';
  let igUserId = '';

  try {
    const form = new URLSearchParams();
    form.set('client_id', metaAppId);
    form.set('client_secret', metaAppSecret);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', redirectUri);
    form.set('code', String(code));

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[INSTAGRAM_TOKEN_EXCHANGE_FAILED]', tokenRes.status, body);
      return renderError(res, 'Meta could not complete the Instagram token exchange.');
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
      client_secret: metaAppSecret,
      access_token: shortToken,
    });
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?${longParams.toString()}`
    );
    if (longRes.ok) {
      const longData: any = await longRes.json();
      longToken = sanitizeAccessToken(longData?.access_token);
    }
  } catch (err) {
    console.warn('[INSTAGRAM_LONG_TOKEN_WARN]', err);
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
    const meRes = await fetch(
      `https://graph.instagram.com/v21.0/me?${meParams.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
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
    await persistInstagramAccount(userId, account);
  } catch (err: any) {
    console.error('[INSTAGRAM_PERSIST_FAILED]', err);
    return renderError(
      res,
      err?.message?.includes('SUPABASE_SERVICE_ROLE_KEY')
        ? 'Instagram login worked, but secure server storage is not configured in Vercel yet.'
        : 'Instagram login worked, but the account could not be saved securely.',
      500
    );
  }

  void subscribeInstagramApp(igUserId, accessToken);

  const safeUsername = escapeHtml(username);
  return res.status(200).send(`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Instagram connected</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px">
  <div style="max-width:440px;background:white;border:1px solid #e2e8f0;border-radius:20px;padding:28px;box-shadow:0 12px 40px rgba(15,23,42,.08);text-align:center">
    <div style="font-size:42px">✅</div>
    <h2 style="margin:8px 0;color:#0f172a">@${safeUsername} connected</h2>
    <p style="color:#64748b;line-height:1.6;font-size:14px">Meta verified the Instagram account successfully.</p>
    <p style="color:#94a3b8;font-size:12px">You can close this window.</p>
  </div>
  <script>
    (function () {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'ig_connected' }, window.location.origin);
          setTimeout(function () { window.close(); }, 800);
          return;
        }
      } catch (e) {}
      setTimeout(function () {
        window.location.replace('/?tab=settings&status=ig_connected');
      }, 500);
    })();
  </script>
</body>
</html>`);
}
