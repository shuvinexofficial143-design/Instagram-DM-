import type { Automation } from '../types';

type Mutation = { method: 'POST' | 'DELETE'; automation?: Automation; id?: string };
type SessionScope = {
  workspaceId: string;
  ownerId: string;
  currentOwnerId: () => string | undefined;
  getToken: () => Promise<string>;
};

/** Keep a retry bound to the login and Instagram account that initiated it. */
export async function requestAutomationMutation(input: Mutation, scope: SessionScope): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const guest = !scope.ownerId && /^guest_[a-f0-9-]{16,}$/i.test(scope.workspaceId);
      if ((!scope.ownerId && !guest) || (scope.currentOwnerId() || '') !== scope.ownerId) throw Object.assign(new Error('Your login changed. Sign in again before saving.'), { status: 401 });
      const token = scope.ownerId ? await scope.getToken() : '';
      if ((!token && !guest) || (scope.currentOwnerId() || '') !== scope.ownerId) throw Object.assign(new Error('Your login changed. Sign in again before saving.'), { status: 401 });
      const url = input.method === 'DELETE' ? `/api/automations?id=${encodeURIComponent(input.id || '')}` : '/api/automations';
      const response = await fetch(url, {
        method: input.method, credentials: 'same-origin', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Autoreply-Workspace': scope.workspaceId },
        ...(input.method === 'POST' ? { body: JSON.stringify({ automation: input.automation }) } : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw Object.assign(new Error(data?.error || 'Automation request failed. Please retry.'), { status: response.status || 502 });
      if (input.method === 'POST' && !data.automation?.id) throw Object.assign(new Error('The server did not confirm the saved automation. Please retry.'), { status: 502 });
      return data;
    } catch (error: any) {
      if (attempt || (error?.status && error.status < 500)) throw error;
    }
  }
}
