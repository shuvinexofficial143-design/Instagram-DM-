import { randomUUID } from 'node:crypto';

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || 'https://mgibujqljahrfwlaafjy.supabase.co'
).replace(/\/$/, '');
const GUEST_COOKIE = 'autoreply_guest_workspace';

function getCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;

    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

function isWorkspaceId(value: string): boolean {
  return /^guest_[a-f0-9-]{16,}$/i.test(value);
}

function getOrCreateWorkspaceId(req: any, res: any): string {
  const existing = getCookie(req, GUEST_COOKIE);
  if (isWorkspaceId(existing)) return existing;

  const workspaceId = `guest_${randomUUID()}`;
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https')
    .split(',')[0]
    .trim();
  const secure = proto === 'https' ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${GUEST_COOKIE}=${encodeURIComponent(
      workspaceId
    )}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`
  );

  return workspaceId;
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

class StoreError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
    this.code = code;
  }
}

async function callStore(action: string, workspaceId: string, extra: any = {}) {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/functions/v1/instagram-account-store`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, workspaceId, ...extra }),
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    console.error(
      '[GUEST_AUTOMATION_STORE_FAILED]',
      action,
      response.status,
      payload?.error || payload,
      payload?.detail || ''
    );
    throw new StoreError(
      payload?.detail ||
        payload?.error ||
        `Automation storage failed (HTTP ${response.status})`,
      response.status,
      payload?.code
    );
  }

  return payload;
}

export default async function handler(req: any, res: any) {
  try {
    const workspaceId = getOrCreateWorkspaceId(req, res);

    if (req.method === 'GET') {
      const payload = await callStore('list_automations', workspaceId);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({
        ok: true,
        automations: Array.isArray(payload?.automations) ? payload.automations : [],
      });
    }

    if (req.method === 'POST') {
      const automation = req.body?.automation;
      if (!automation?.id) {
        return res.status(400).json({ ok: false, error: 'Automation is required.' });
      }

      const payload = await callStore('save_automation', workspaceId, { automation });
      return res.status(200).json({
        ok: true,
        automation: payload?.automation || automation,
        pausedAutomationIds: Array.isArray(payload?.pausedAutomationIds)
          ? payload.pausedAutomationIds
          : [],
      });
    }

    if (req.method === 'DELETE') {
      const automationId = String(req.query?.id || req.body?.id || '').trim();
      if (!automationId) {
        return res.status(400).json({
          ok: false,
          error: 'Automation id is required.',
        });
      }

      await callStore('delete_automation', workspaceId, { automationId });
      return res.status(200).json({ ok: true, automationId });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err: any) {
    console.error('[GUEST_AUTOMATION_API_FATAL]', err);
    const status =
      err?.name === 'AbortError'
        ? 504
        : err instanceof StoreError
        ? err.status
        : 500;

    return res.status(status).json({
      ok: false,
      code: err instanceof StoreError ? err.code : undefined,
      error:
        err?.name === 'AbortError'
          ? 'Automation storage request timed out.'
          : err?.message || 'Automation storage request failed.',
    });
  }
}
