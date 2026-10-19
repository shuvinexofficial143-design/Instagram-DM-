# Administrator automations and Instagram campaigns

Sign in to `/admin` with a verified account listed in the **server-only** `ADMIN_EMAILS` environment variable. Use a comma-separated allowlist. Never use a `VITE_` prefix for administrator emails or service credentials.

## Automation Manager

Search registered customers by email, name or Instagram username. Select a workspace to create, edit, duplicate, pause, activate or delete its actual automation records. These are the same records read by the customer's dashboard and webhook runtime. Customer accounts receive workspace update notices and an administrator-change badge. Their normal counts and trigger displays continue to use the same documents.

Administrator history records the previous and resulting configuration. Restore applies the previous configuration while preserving current counters. Deleting an automation preserves its customer-data tables. A recorded, explicit override permits an administrator to create an automation above the account's count allowance; delivery and AI quotas still apply. Activating an AI DM catch-all pauses other active AI DM catch-alls in that workspace.

## Campaign Center

1. Connect your own Instagram account, or choose one of your already connected accounts.
2. Enter a campaign name, paste up to 500 usernames or numeric conversation IDs, and write the message.
3. Add the AI instructions and enable follow-up if desired.
4. Check recipients. Only unique existing conversations with a real incoming message inside the supported 24-hour window are eligible. Unknown usernames, duplicate recipients and expired conversations show a reason. Pasting a username does not allow cold outreach through the official API.
5. Save the draft, review it and start it. Nothing is sent by saving a draft.

The background worker checks up to five queued recipients per minute. Delivery continues after leaving the page. Each recipient is checked again for connection, window eligibility and message quota before dispatch. Instagram must return a message ID before the recipient is marked sent and the outgoing message is added to Inbox. Timeouts and ambiguous responses become **Needs review** and are never automatically retried. Check Instagram before creating another campaign for those recipients.

Pause holds queued messages and campaign AI follow-up; resume continues them. A message already accepted for dispatch may finish while a pause or stop is being saved. Stop permanently blocks that campaign's remaining sends and follow-up. Completed campaigns can continue AI replies while follow-up is enabled. AI settings can be edited or turned off independently.

A campaign's AI prompt applies only after that recipient was successfully sent the campaign. It uses the existing conversation history. The latest sent, enabled campaign takes precedence for a recipient. Human takeover, account disconnection, quota enforcement and reply delivery checks still apply. Campaign follow-up never activates a globally paused automation.

## Deployment and verification

Vercel requires `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) and the existing verified Supabase authentication configuration. Service credentials stay on the server. Campaign tables and administrator history have RLS enabled and are inaccessible to anonymous or authenticated browser roles; privileged operations require the private administrator allowlist first.

Apply the five `202610190748*` migrations in filename order. Deploy `instagram-campaign-worker` and the updated `instagram-live-webhook`. Both authenticate requests inside their handlers. The migration creates a dedicated Vault capability and a minute-based `pg_cron` job; no campaign secret belongs in source code or the browser. The cron job does not make requests when there are no running campaigns.

Run `npm run test:admin`, `npm run test:automations`, `npm run lint`, `npm run test:ui` and `npm run build`. `tests/admin-campaigns.integration.sql` exercises the real database functions, customer visibility and cross-workspace RLS using synthetic data inside an always-rolled-back transaction. Never use customer recipients for automated delivery tests.
