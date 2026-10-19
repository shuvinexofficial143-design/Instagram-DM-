import { createHmac, timingSafeEqual } from 'node:crypto';

export type InstagramReconnectTarget = { ids: string[]; username: string };
type OAuthState = { workspaceId: string; ownerId: string; ts: number; target?: InstagramReconnectTarget };
const isWorkspaceId = (value: string) => /^guest_[a-f0-9-]{16,}$/i.test(value) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const signedPayload = (state: OAuthState) => JSON.stringify({
  v: 2, workspaceId: state.workspaceId, ownerId: state.ownerId, ts: state.ts,
  target: state.target || null,
});

export function createInstagramOAuthState(workspaceId: string, ownerId: string, secret: string, target?: InstagramReconnectTarget): string {
  const state = { workspaceId, ownerId, ts: Date.now(), ...(target ? { target } : {}) };
  const sig = createHmac('sha256', secret).update(signedPayload(state)).digest('hex');
  return JSON.stringify({ v: 2, ...state, sig });
}

/** Only return fields covered by the signature. Accept in-flight legacy states for 15 minutes. */
export function verifyInstagramOAuthState(raw: unknown, secret: string): OAuthState | null {
  if (typeof raw !== 'string' || !secret) return null;
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { try { parsed = JSON.parse(decodeURIComponent(raw)); } catch { return null; } }
  const state: OAuthState = { workspaceId: String(parsed?.workspaceId || ''), ownerId: String(parsed?.ownerId || ''), ts: Number(parsed?.ts || 0) };
  if (!isWorkspaceId(state.workspaceId) || (state.ownerId && !isWorkspaceId(state.ownerId)) ||
      !Number.isFinite(state.ts) || Math.abs(Date.now() - state.ts) > 15 * 60_000 || !/^[a-f0-9]{64}$/.test(String(parsed?.sig || ''))) return null;
  if (parsed.v === 2 && parsed.target) {
    if (!state.ownerId || !Array.isArray(parsed.target.ids) || !parsed.target.ids.length || parsed.target.ids.length > 2 ||
        !parsed.target.ids.every((id: unknown) => typeof id === 'string' && /^\d{5,30}$/.test(id)) ||
        typeof parsed.target.username !== 'string' || !/^[a-zA-Z0-9._]{1,30}$/.test(parsed.target.username)) return null;
    state.target = { ids: parsed.target.ids, username: parsed.target.username };
  }
  let payload: string;
  if (parsed.v === 2) payload = signedPayload(state);
  else if (parsed.v == null) payload = state.ownerId ? `${state.workspaceId}:${state.ownerId}:${state.ts}` : `${state.workspaceId}:${state.ts}`;
  else return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const signature = Buffer.from(parsed.sig, 'hex');
  return signature.length === expected.length && timingSafeEqual(signature, expected) ? state : null;
}
