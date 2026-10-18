# Inbox delivery repair — 2026-10-18

## Confirmed production causes

- Meta delivered DM webhooks, but the processor logged `connected_account_not_found` before Inbox persistence and AI execution. Account registration stored `/me.id`, while incoming `entry.id` and `recipient.id` used `/me.user_id`. Connecting a second account also removed the accidental single-account lookup fallback that had concealed this mismatch.
- Inbox submitted `/api/instagram/send-dm`, but Vercel had no handler or rewrite for this URL. The Express-only implementation queried a global contact collection and returned success even without Meta confirmation.

## Changes

- Store the verified professional `user_id` as `ig_user_id`; retain the app-scoped profile `id` separately. Reconnect finds either legacy or professional identity and preserves the existing workspace. Loading a legacy connection repairs identity metadata. No token is exposed to the browser.
- Route manual replies through the existing Vercel account function and one shared Express/Vercel handler. Authenticate the session and selected workspace; ignore client-supplied ownership. Resolve the recipient only from that workspace's contacts. Require a real messaging-scoped numeric recipient and Meta `message_id`.
- Use `/me/messages` with the stored token; do not retry ambiguous sends. Persist successful replies by Meta's real message ID. Report Meta errors to the user and keep AI enabled when a manual send fails.
- Use the runtime Fetch API consistently so platform instrumentation, Node environment handling and test mocks apply. Check all compiled API/server modules in native Node ESM.
- Correct two existing TypeScript errors (Sheets trigger setting and unsupported token refresh argument). Make the existing typography test enforce readable root size instead of a stale exact value; no CSS changed.

## Production recovery

Both connected accounts were verified against Meta with existing stored tokens, without exposing the tokens. Updated token/membership/public-account data; the existing database trigger rebuilt the runtime contexts. A rollback-only call through the real automation preparation RPC resolved each webhook ID to its correct, active workspace.

Fetched recent real conversations from Meta and inserted 42 missing messages (22 incoming, 20 outgoing) with conflict protection, preserving existing rows/read states. Recovered one missing contact. Historical messages were not replayed through AI, and no test DM was sent to a customer.

## Validation and limits

The regression suite covers two different account ID scopes, legacy reconnect/load repair, workspace ownership, actual recipient resolution, confirmed delivery, Meta refusal, missing confirmation, ambiguous timeouts, Inbox persistence failure and production URL routing. TypeScript, production build, native ESM loading and UI checks are run before publishing.

A customer-driven fresh incoming DM followed by a manual reply is still the final end-to-end confirmation against Instagram. A mocked send or a correct database mapping alone is not proof of customer delivery. Meta permission and messaging-window errors are returned explicitly.
