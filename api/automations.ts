import { ensureAutomationSheet } from './google-sheets.js';
import { SUPABASE_URL, authenticatedWorkspace, UpstreamError } from '../src/server/supabaseConfig.js';

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
  return /^guest_[a-f0-9-]{16,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function callStore(body: Record<string, unknown>, authorization: string, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/instagram-account-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authorization ? {Authorization:authorization} : {}) },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    const payload = await response.json().catch(() => null);
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  try {
    const authenticatedUid = (await authenticatedWorkspace(req))?.id || "";
    if (req.headers?.authorization && !authenticatedUid) return res.status(401).json({ ok: false, error: "Your login session expired. Please sign in again." });
    const workspaceId = authenticatedUid || getCookie(req, GUEST_COOKIE);

    if (!isWorkspaceId(workspaceId)) {
      return res.status(401).json({
        ok: false,
        error: 'Your workspace session is unavailable. Sign in again and retry.',
      });
    }

    if (req.method === 'GET') {
      const { response, payload } = await callStore({
        action: 'list_automations',
        workspaceId,
      }, String(req.headers?.authorization || ''));

      if (!response.ok || !payload?.ok) {
        return res.status(response.status >= 400 ? response.status : 500).json({
          ok: false,
          error: payload?.error || 'Automations could not be loaded.',
        });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({
        ok: true,
        automations: Array.isArray(payload?.automations) ? payload.automations : [],
      });
    }

    if (req.method === 'POST') {
      const automation = req.body?.automation;
      if (!automation || typeof automation !== 'object') {
        return res.status(400).json({ ok: false, error: 'Automation data is required.' });
      }

      if(automation.trigger_type==='dm_ai_conversation') {
        await ensureAutomationSheet(workspaceId,String(req.headers?.authorization || '').replace(/^Bearer\s+/i,''),String(automation.id),String(automation.name)+' AI Leads',automation.trigger_config?.sheet_fields || ['Name','Phone','Product','City']);
      }
      const { response, payload } = await callStore({
        action: 'save_automation',
        workspaceId,
        automation,
      }, String(req.headers?.authorization || ''));

      if (!response.ok || !payload?.ok) {
        return res.status(response.status >= 400 ? response.status : 500).json({
          ok: false,
          code: payload?.code || '',
          error: payload?.error || 'Automation could not be saved.',
        });
      }

      return res.status(200).json({
        ok: true,
        automation: payload?.automation || automation,
        pausedAutomationIds: Array.isArray(payload?.pausedAutomationIds)
          ? payload.pausedAutomationIds
          : [],
      });
    }

    if (req.method === 'DELETE') {
      const automationId = String(req.query?.id || req.body?.automationId || '').trim();
      if (!automationId) {
        return res.status(400).json({ ok: false, error: 'Automation id is required.' });
      }

      const { response, payload } = await callStore({
        action: 'delete_automation',
        workspaceId,
        automationId,
      }, String(req.headers?.authorization || ''));

      if (!response.ok || !payload?.ok) {
        return res.status(response.status >= 400 ? response.status : 500).json({
          ok: false,
          error: payload?.error || 'Automation could not be deleted.',
        });
      }

      return res.status(200).json({ ok: true, automationId });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err: any) {
    console.error('[AUTOMATIONS_API_FATAL]', err);
    return res.status(err instanceof UpstreamError ? 503 : err?.status || 500).json({
      ok: false,
      error:
        err?.name === 'AbortError'
          ? 'Automation request timed out. Please try again.'
          : err?.message || 'Automation request failed.',
    });
  }
}
