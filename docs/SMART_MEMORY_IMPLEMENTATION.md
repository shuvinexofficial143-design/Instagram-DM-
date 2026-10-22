# Auto Replys smart conversation memory — implementation and evidence

Implemented 21–22 October 2026. This is an additive change to the existing Instagram integration, message documents and shared AI/catalog runtime. No vector database, new paid service, message retention timer or automatic chat deletion was added.

## 1. Audit and original problem

The original AI already read **12 recent messages**, with the latest native owner outbound message retained as an anchor. It did not resend an unlimited transcript. `autoreply_dm_history` was a legacy 12-message fallback. Full history remained in `autoreply_documents`, collection `inbox_messages`, keyed by workspace/collection/Instagram message ID.

Consequently, facts outside that window could be forgotten. There were no durable customer facts, incremental summaries, summary checkpoints or actual provider token measurements. The Inbox fetched the whole collection repeatedly and could hit the PostgREST 1,000-row limit. Native owner Instagram messages were already captured and must remain part of the timeline. Canonical contacts and explicit `ig_user_ids` aliases identify a customer; message text or timing never establishes identity.

At audit: 320 original message documents across four workspaces. Existing 121 sent-event records had median AI time 1,183 ms and ingress-to-send acknowledgement 3,877 ms, but had no provider token observations. Those historical medians are uncontrolled mixed workloads and are **not** a before/after benchmark.

## 2. Files and database changes

Main migration: `supabase/migrations/20261021124744_smart_conversation_memory.sql`, applied to the existing production Supabase project.

| Object | Purpose |
| --- | --- |
| `autoreply_documents` | Existing message source; additive ingestion sequence and generated timeline timestamp; incremental, timeline, cursor, unread and lexical-search indexes |
| `autoreply_customer_memory` | Summary, verified facts, lead state, checkpoint, version and timestamps; primary key workspace + connected Instagram account + canonical conversation |
| `autoreply_memory_settings` | Per-account workspace preferences and bounded limits |
| `autoreply_memory_jobs` | One leased job per scoped conversation, pending sequence, retries, safe error codes and actual provider usage |
| `autoreply_memory_runtime` | Private emergency and dispatch switches |
| `autoreply-smart-memory` cron | Dispatches due work every minute using the existing Supabase Cron/pg_net facilities |

Summary and lead state are columns in the customer-memory table rather than duplicate tables. Instagram customer ID/username remain in existing canonical contacts; the job stores sender ID and the memory primary key stores account/conversation identity.

Backend files: `supabase/functions/instagram-live-webhook/{index.ts,catalogRuntime.ts,smartMemory.ts,smartMemory.js}`, `supabase/functions/instagram-memory-worker/{index.ts,benchmarkRuntime.ts}`, `supabase/functions/instagram-account-store/index.ts`, `api/workspace-data.ts`.

Frontend files: `src/context/AppContext.tsx`, `src/lib/{supabase.ts,inboxPaging.ts,activityLogs.ts}`, `src/types.ts`, `src/components/Inbox/InboxPage.tsx`, `src/components/Analytics/AnalyticsPage.tsx`, `src/components/Settings/{SettingsPage.tsx,MemorySettings.tsx}`.

Tests: `tests/smart-memory.test.ts`, `tests/smart-memory.integration.sql`, `tests/smart-memory-pagination.integration.sql`, updated existing runtime fixtures and UI checks. `package.json` includes the new memory tests. Existing concurrently published pricing/checkout changes from commit `5cfea05` were merged and preserved.

## 3. How the three layers work

- Recent transcript: default 12 relevant delivered messages; configurable 6–20. Customer, automated and native owner messages preserve chronological order. An unsummarized owner opening may add one anchor beyond the normal window.
- Incremental summary: default threshold 10 new messages, configurable 8–12. A quiet conversation flushes after about two minutes plus dispatch timing. The worker reads at most 30 new messages, bounded to 20 KB per model batch, plus prior memory. Checkpoints advance only across an unbroken batch of source messages.
- Customer facts: explicit budget, name, business, requirements, demo/order requests and questions have a cheap extraction path. Batched model extraction covers other supported facts. Values require an exact source-message excerpt. Each saved fact carries source ID, sequence, timestamp and customer/owner/AI role. Newer corrections cannot be overwritten by an older batch. Unknown facts remain absent. Lead state distinguishes an order discussion from a confirmed purchase.

The existing prepare RPC supplies memory in its existing round trip. The business/system prompt retains priority; saved memory is a separate **user DATA** message. Context guidance resolves contradictory facts using newer sources and the dedicated budget field. Scoped lexical historical search retrieves at most four excerpts from the same workspace/customer aliases when needed. No vector service is required.

The context budget uses a conservative UTF-8 text-byte upper bound; it removes old turns before sacrificing mandatory instructions/current input. Image tokens are provider-specific and are measured separately by provider usage. Oversized mandatory instructions fail explicitly instead of silently dropping business rules.

Background updates never make a separate expensive model call for every message. They run outside the reply path. Jobs use SKIP LOCKED claims, 90-second leases, per-conversation database locks, version checks, duplicate protection and up to five attempts with exponential backoff. The background provider timeout is 25 seconds; main reply timeout/settings are preserved. Dead jobs retain safe reason codes for operator investigation.

RLS restricts memory/settings/job reads to the correct workspace owner. Only service code can write memory or process jobs. Worker POST requests require a private Vault-backed credential; an unsigned live POST returned 401. Credentials and full message text are excluded from new diagnostic logs. Sensitive secret patterns are omitted from facts and redacted from summary input/output and short activity previews.

## 4. Original chat history and related features

All original messages remain in the existing table. Summarization never deletes or replaces them. Inbox loads 50-message cursor pages and merges realtime updates without discarding previously loaded pages. Older pages remain available. Explicit data export walks all cursors with account-change guards, so an export is not limited to the visible page.

Unread actions update all relevant source messages, including unloaded aliases. Analytics uses server aggregates over the requested date range rather than the visible Inbox page. Catalog tools, image handling, handoff, automation settings and native Instagram outgoing capture retain their existing shared paths.

Derived memory is invalidated if its original source is deliberately deleted by an existing user action; stale leases are cancelled. There is no automatic retention or archiving action. A configurable future archiving product remains future work rather than a switch that claims to archive without implementing it.

## 5. Actual measurements and limits

Provider A/B evidence is in `SMART_MEMORY_BENCHMARK.json`. These are synthetic conversations using the real existing OpenAI provider, with the same current request and business instructions. The baseline toggles memory off and supplies the old 12-turn plus owner-anchor context; it is **not** a replay of historic production traffic. Each case has one final measured reply per variant, so timing variance is substantial. Initial measurements are retained separately.

| Stored messages | Input tokens before → after | Output tokens before → after | Provider reply time before → after |
| --- | --- | --- | --- |
| 10 | 566 → 1,026 | 232 → 241 | 4,325 → 2,960 ms |
| 50 | 618 → 1,008 | 190 → 242 | 3,797 → 5,229 ms |
| 100 | 618 → 1,063 | 250 → 199 | 4,829 → 2,667 ms |
| 500 | 618 → 1,064 | 213 → 239 | 2,959 → 3,499 ms |

The original bounded context was already cheap. **This implementation does not establish token-cost savings against that baseline**: durable memory adds roughly 390–460 input tokens in these cases. Reply latency improved in two cases and worsened in two; no reliable speedup or 1–2 second end-to-end guarantee is established. Memory prevents the context from growing with full transcript length and restores important old facts. The real-provider outputs retained the gift-business context; stored memory retained the corrected 8,000 INR budget at 100/500 messages. A response need not repeat that budget unless useful.

Incremental summary cost, measured in actual provider tokens:

| Messages processed | Summary calls | Input tokens | Output tokens |
| --- | --- | --- | --- |
| 10 | 1 | 1,084 | 203 |
| 50 | 2 | 3,939 | 360 |
| 100 | 4 | 7,908 | 592 |
| 500 | 17 | 38,457 | 2,595 |

These are bounded-batch backfill measurements, not a promise that an active conversation always uses 30-message batches; the live threshold is 10. No monetary invoice was retrieved, so billed currency savings are not claimed.

Controlled DB/payload evidence is in `SMART_MEMORY_VERIFICATION.json`. For 500 synthetic messages, initial Inbox JSON fell from **111,784 bytes / 500 rows** to **14,184 bytes / 50 rows** (87.3% fewer bytes), while every source was recovered through cursor traversal. DB-only timings for the same fixture were 3.139 ms unpaginated and 2.407 ms first page. At 10/50/100 rows, the cursor RPC's extra authorization/metadata work sometimes cost more than the tiny raw aggregate. These single-run DB timings exclude network/browser latency and do not establish a general query-latency improvement.

## 6. Verification

- 370 automated tests pass across connections, shared catalog/DM engine, identity, native owner messages, memory, automation delivery, customer data, billing/pricing, queue, security, support, invoices, lifecycle, analytics/dashboard and admin.
- 95 offline UI/render/routing checks pass, including the new memory preferences alongside the existing settings design.
- TypeScript and production build pass.
- Four real PostgreSQL integration scripts pass with rolled-back synthetic fixtures: memory state/security, 10/50/100/500 cursor traversal and analytics, manual context, identity.
- Covered: expired/stale leases, duplicate completion, alias identity, account isolation/RLS, exact evidence validation, unknown facts, three-month-old context, budget correction, stale facts, message arrival during a summary snapshot, checkpoint gaps, version conflicts, summary failure/retry, native owner chronology, bounded tokens, scoped old-history search, empty/disabled memory, export pagination/account-change abort, deleted-source invalidation and secret redaction.
- Live production backfill completed for seven conversations; all seven jobs reached idle with no remaining failed/dead job. All 320 original messages remained. Early attempts hit transient background failures and succeeded through retry; diagnostic error codes and a longer background-only provider timeout are included.
- Backend active versions at verification: webhook 61, account-store 29, memory worker 3. Cron/dispatch are enabled.

## 7. Rollback and remaining verification

`SMART_MEMORY_ROLLBACK.sql` disables memory/dispatch non-destructively and includes the legacy context RPC for an operational rollback. All original messages and derived records remain retained. Frontend/backend can be reverted through Git/Vercel without dropping tables or indexes.

Real customer-facing Instagram sends, a fresh owner-initiated Instagram → customer reply → AI exchange, authenticated browser interactions, and sustained production load testing were not performed in this task. No test DM was sent to any customer. Database and automated tests cover those routing/state cases, but do not substitute for a fresh Meta delivery test. Longer production telemetry is needed to assess typical end-to-end latency, cost and summary quality.
