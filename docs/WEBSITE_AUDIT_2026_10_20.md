# Website audit — 20 October 2026

Audited the public routes and main application flows: authentication, Instagram account lifecycle, four automation types, Inbox, contacts, Customer Data, catalog, billing, Settings and Admin access. Public browser checks and mocked API/runtime tests are distinct from a signed-in production walkthrough.

## Fixed

- **Automation editor lost drafts on failed saves.** Creation, editing and duplication now await the server's saved record. Errors stay visible and the editor keeps its draft; controls are disabled while saving.
- **Replacing an active AI automation could pause the previous rule even when saving the replacement failed.** A service-only database transaction now validates names and plan allowance, pauses other AI rules and saves the rule atomically. It also preserves authoritative delivery counters and creation time instead of overwriting them from an old editor snapshot. Retries retain the original login, workspace and rule ID.
- **Deleting conversations covered only loaded messages and then called absent production endpoints.** One authenticated, RLS-protected transaction now deletes all matching message history and selected contacts within the selected workspace. Names are normalized and ID-only conversations are supported. Failed operations are shown in Inbox; another workspace cannot be targeted.
- **Failed manual replies cleared the composer and could be counted as successful bulk sends.** Send errors now propagate to the UI, keep the reply text, and count as failures in bulk operations. A send requires Meta's returned message ID; ambiguous sends are never automatically retried. Account changes during token acquisition stop dispatch. Bulk AI generation now includes authentication.
- Inbox note, saved-reply, label, snooze and unread failures are surfaced instead of becoming unhandled promise rejections. Customer Data guidance now explicitly names AI DM automations.

## Verification

- TypeScript check and production build passed.
- 309 automated tests passed across connections, automation save/send behavior, four automation runtimes, webhook queue, guest authorization, support, customer capture/isolation, billing, invoices, lifecycle email, dashboard, visual contracts and Admin authorization.
- 85 UI rendering/routing checks passed.
- SQL integration checks ran with synthetic fixtures inside transactions ending in `ROLLBACK`. They verified save failure rollback, plan limits, duplicate names, server-owned counters, deletion of 1,005 messages, ID-only deletion and foreign workspace denial. Existing account lifecycle and AI-only capture contracts were retained.
- Browser checks covered the live landing page, pricing and creator controls, About, Help navigation, FAQ search/disclosure and the login form. No application console error was observed; the browser extension's own metadata warning was excluded.
- The inspected backend log window showed no `error`/`failed` event messages in the queried function, Postgres, PostgREST and Auth sources.

## Limits

An authenticated production browser session was unavailable. A real Meta account-switch authorization, actual Instagram delivery and a real payment were not executed. Their API/runtime contracts were checked with synthetic fixtures; no real customer messages were sent and no customer records were deleted. This is a tested audit of the main flows, not a guarantee that every possible bug is absent.
