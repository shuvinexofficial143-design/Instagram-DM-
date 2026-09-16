import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jnrftwolkhkuvpsbvbww.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Eae4_ClutOufXa5U2vo6MA_nhnOL8D7';

const sessionSecret =
  process.env.AUTH_SESSION_SECRET ||
  process.env.INSTAGRAM_APP_SECRET ||
  process.env.WEBHOOK_VERIFY_TOKEN ||
  randomBytes(32).toString('hex');

const SESSION_COOKIE = 'autoreply_session';
const SESSION_TTL_SECONDS = 60 * 60;
const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const CLEAR_SESSION_HEADER = 'x-autoreply-clear-session';

function signSession(uid, email = '') {
  const payload = Buffer.from(
    JSON.stringify({
      uid,
      email: typeof email === 'string' ? email.toLowerCase() : '',
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
    'utf8'
  ).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySession(value) {
  if (!value || !value.includes('.')) return null;
  const [payload, suppliedSignature] = value.split('.', 2);
  if (!payload || !suppliedSignature) return null;

  const expectedSignature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded?.uid || !decoded?.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      uid: String(decoded.uid),
      email: typeof decoded.email === 'string' ? decoded.email.toLowerCase() : '',
    };
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const raw = req.headers?.cookie || '';
  for (const pair of raw.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(pair.slice(index + 1).trim());
    } catch {
      return pair.slice(index + 1).trim();
    }
  }
  return null;
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  return Boolean(req.secure || forwardedProto === 'https');
}

function writeSessionCookie(req, res, uid, email = '') {
  const cookie = [
    `${SESSION_COOKIE}=${encodeURIComponent(signSession(uid, email))}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    isSecureRequest(req) ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  res.append('Set-Cookie', cookie);
}

function clearSessionCookie(req, res) {
  const cookie = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    isSecureRequest(req) ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  res.append('Set-Cookie', cookie);
}

async function verifySupabaseAccessToken(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id) return null;
  return {
    uid: String(user.id),
    email: typeof user.email === 'string' ? user.email.toLowerCase() : '',
  };
}

async function resolveAuthenticatedUser(req, res) {
  const authorization = String(req.headers?.authorization || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (bearer) {
    try {
      const verified = await verifySupabaseAccessToken(bearer);
      if (verified?.uid) {
        writeSessionCookie(req, res, verified.uid, verified.email);
        return verified;
      }
    } catch (error) {
      console.warn('[SECURITY_INVALID_SUPABASE_TOKEN]', error?.message || String(error));
    }
  }

  const cookieSession = verifySession(readCookie(req, SESSION_COOKIE));
  if (cookieSession?.uid) return cookieSession;
  return null;
}

function forceQueryValue(req, key, value) {
  try {
    if (req.query && typeof req.query === 'object') req.query[key] = value;
  } catch {}
}

function forceBodyValue(req, key, value) {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  req.body[key] = value;
}

function classifyProtectedRoute(path) {
  if (path === '/api/auth/instagram') return 'oauth-start';
  if (path === '/api/auth/instagram/callback') return 'oauth-callback';
  if (path === '/api/user/sync-profile') return 'profile-sync';
  if (path.startsWith('/api/admin/')) return 'admin';
  if (
    path === '/api/test-webhook' ||
    path.startsWith('/api/instagram') ||
    path.startsWith('/api/contacts/') ||
    path.startsWith('/api/inbox/')
  ) {
    return 'user';
  }
  return null;
}

function buildSecurityMiddleware(mode) {
  return async function autoreplySecurityMiddleware(req, res, next) {
    if (String(req.headers?.[CLEAR_SESSION_HEADER] || '') === '1') {
      clearSessionCookie(req, res);
      return res.status(204).end();
    }

    const authenticated = await resolveAuthenticatedUser(req, res);
    if (!authenticated?.uid) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { uid, email } = authenticated;

    if (mode === 'oauth-callback') {
      const incomingState = req.query?.state;
      let timestamp = 0;
      if (incomingState) {
        try {
          const decodedState = JSON.parse(decodeURIComponent(String(incomingState)));
          timestamp = Number(decodedState?.ts || 0);
        } catch {}
      }
      if (!timestamp || Math.abs(Date.now() - timestamp) > OAUTH_STATE_MAX_AGE_MS) {
        return res.status(400).send('Invalid or expired Instagram OAuth state. Please reconnect from the dashboard.');
      }

      forceQueryValue(req, 'state', encodeURIComponent(JSON.stringify({ userId: uid, ts: timestamp })));
      return next();
    }

    // Never trust a browser supplied userId. Verified Supabase auth identity is authoritative.
    forceQueryValue(req, 'userId', uid);
    forceBodyValue(req, 'userId', uid);

    if (mode === 'profile-sync') {
      forceBodyValue(req, 'uid', uid);
      forceBodyValue(req, 'id', uid);
      if (email) forceBodyValue(req, 'email', email);
    }

    if (mode === 'admin') {
      forceQueryValue(req, 'email', email || '__no_verified_email__');
      forceBodyValue(req, 'email', email || '__no_verified_email__');
    }

    return next();
  };
}

for (const methodName of ['get', 'post', 'put', 'patch', 'delete']) {
  const original = express.application[methodName];
  if (typeof original !== 'function') continue;

  express.application[methodName] = function patchedRouteRegistration(path, ...handlers) {
    if (handlers.length === 0 || typeof path !== 'string') {
      return original.call(this, path, ...handlers);
    }

    const mode = classifyProtectedRoute(path);
    if (!mode) return original.call(this, path, ...handlers);
    return original.call(this, path, buildSecurityMiddleware(mode), ...handlers);
  };
}

console.log('[SERVER_SECURITY_BOOTSTRAP] Supabase-authenticated user isolation enabled.');
