import type { InstagramAccount } from '../types';

/** Saved profile metadata is not proof of a live connection. */
export function connectedInstagramAccount(account?: InstagramAccount | null): InstagramAccount | null {
  if (!account?.username || account.status !== 'connected') return null;
  const { access_token: _serverOnlyToken, ...safe } = account;
  return safe as InstagramAccount;
}
