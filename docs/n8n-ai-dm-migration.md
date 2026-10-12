# AI DM n8n migration — safe rollout

Baseline main commit: 038b68a1e8c0d6f9001394fd4b252783fa814da2.
This branch must not modify live Meta webhook routing until n8n is deployed, verified and load-tested.

## Current verified code
- Supabase Edge Function: supabase/functions/instagram-live-webhook/index.ts
- DM automation: trigger_type=dm_ai_conversation; AI action=ai_chatbot
- Per-workspace prompts: ai_system_instruction, with conversation history from runtime context
- Meta sender actions: createTypingSession, sendInstagramSenderAction
- Quota: autoreply_reserve_delivery_quota and autoreply_finish_delivery_quota
- Post-send side effects: conversation history, Sheets lead sync, tags, metrics
- Tests: tests/dm-runtime.test.mjs and tests/automation-delivery.test.mjs

## Isolation boundary
One n8n workflow per group of at most 20 customer workspaces. Grouping is operational, not a security boundary. Resolve workspace and Instagram account from a trusted, authenticated backend, never from arbitrary caller-supplied workspace IDs. Fetch prompt and access token server-side; do not expose Instagram tokens in n8n execution logs or browser payloads.

## Migration contract
1. Preserve Meta webhook verification, deduplication, quota reservation, typing and Meta send in the existing backend.
2. Offload ONLY AI text generation to n8n using a signed backend-to-n8n request with opaque workspace context and limited sanitized prompt/history. Never send Meta credentials to n8n.
3. Use short timeouts and strict response validation. Fall back to the existing AI generator on n8n errors or timeout; avoid duplicate sends.
4. Enable per-workspace feature flag (default legacy), then canary accounts; verify response quality, p50/p95 latency, typing acknowledgement, quotas and error rates.
5. Roll back by disabling flag. Existing webhook and database remain untouched.

## Pre-production blockers
- Provision n8n on an always-on server with HTTPS and secret management; Supabase Storage is not a runtime.
- Configure n8n internal persistent database, encryption key, authentication, execution retention/pruning and backups.
- Add signed request validation and tenant-scoped lookup; never trust user-controlled IDs.
- Remove hardcoded webhook verification token fallback after checking current Meta configuration.
- Confirm Meta sender-action API semantics, permissions and current version.
- Test multi-tenant concurrency, out-of-order messages, retries, idempotency and 20-account groups.
- Benchmark current direct path versus n8n path before cutover.

## Rollback
Keep the main branch at baseline and production routing unchanged until acceptance. Disable n8n routing flag to return to the existing generator; do not delete original AI code or customer records. A git rollback alone cannot restore database state; use separate tested migrations and backups.
