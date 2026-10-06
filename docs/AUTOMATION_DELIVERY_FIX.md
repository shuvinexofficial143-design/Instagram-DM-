# Automation delivery fix — 6 October 2026

## Verified production failure

The latest four AI DM events stopped with `quota_check_failed`. The processor
selected `autoreply_profiles.data`, but the deployed identity table has no
`data` column. Typing started before this check, making the failure appear to be
an AI generation stall. Monthly usage was zero, not exhausted.

The Instagram account subscription also failed because it requested Facebook
fields `message_deliveries` and `message_reads`. The live processor only handled
text AI DMs; configured static DM, story, and comment rules never dispatched.

## Corrected behavior

- Quota reads the actual free plan row and monthly usage RPC in parallel. This
  deployment has no server-issued paid entitlement; browser-selected plans are
  not trusted as billing authorization. The usage endpoint uses the same schema.
- Resolve active rules for the event's exact type, keywords, and selected media.
  Static DM rules take priority over AI catch-all rules. Stories/comments never
  fall through to the AI DM rule.
- Make an atomic database message claim before sending. Remove detached claims
  and text-based echo suppression, which could drop a different customer's
  identical words. Fetch history without a global shared-reply shortcut.
- Persist conversation history before processing the next message in a batch.
- Start typing only after matching and quota checks; sequence typing-off after
  typing-on. Keep AI timeout bounded and use fallback on AI errors.
- Comment private replies address `recipient.comment_id`. Confirm that private
  delivery succeeds before posting a public reply. Never retry ambiguous sends.
- Static sends avoid OpenAI. Meta writes have a ten-second timeout; media reads
  retry once after transient failures. Contact/history/Sheets work does not
  precede the customer-visible reply.
- Honor explicitly configured delays up to twenty seconds; default is zero.
  Longer legacy delays fail visibly rather than keeping a request open. The
  unsupported auto-like option is removed from the builder. Legacy auto-like
  actions are reported as skipped without blocking supported reply actions.
- Reject unauthenticated relay envelopes; direct Meta requests require HMAC.
- Account load repairs subscriptions using accepted Instagram fields.

## Verification

Run `npm run lint`, `npm run build`, `npm run test:ui`,
`npm run test:connections`, `npm run test:dm`, `npm run test:automations`,
and `node --test tests/api-esm.test.mjs`.

Delivery tests execute the complete deployed handler with mocked Meta/OpenAI
and production-shaped database results, including first message, burst,
duplicate, follow-up history, keywords, media targeting, fallback, send failure,
typing order, relay authentication, and direct Meta HMAC.

Live `instagram-live-webhook?check=runtime` exercises the real plan read and
usage RPC without sending a message. No customer DM/comment is sent by tests.
Actual end-to-end speed requires a fresh inbound message after deployment;
mock test durations are not delivery latency measurements.
