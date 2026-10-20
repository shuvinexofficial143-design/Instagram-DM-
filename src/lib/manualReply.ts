/** A manual DM is successful only after the server returns Meta's message ID. */
export async function dispatchManualReply(input: {
  workspaceId: string; ownerId: string; username: string; text: string;
  currentOwnerId: () => string | undefined; getToken: () => Promise<string>;
}) {
  const token = await input.getToken();
  if (!token || !input.ownerId || input.currentOwnerId() !== input.ownerId) throw new Error('Your login changed. Sign in again before sending.');
  // A send is never retried automatically: a lost response may already have delivered the DM.
  const response = await fetch('/api/instagram/send-dm', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Autoreply-Workspace': input.workspaceId },
    body: JSON.stringify({ recipientUsername: input.username, messageText: input.text, userId: input.workspaceId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || payload?.sent !== true || !payload?.message_id || !payload?.message) {
    throw new Error(payload?.error || 'Instagram did not confirm delivery. Check the conversation before retrying.');
  }
  return payload.message;
}
