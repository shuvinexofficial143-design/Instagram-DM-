# DM latency investigation — 6 October 2026

Two confirmed production replies before this change showed:

| Stage | Sample 1 | Sample 2 |
| --- | ---: | ---: |
| Context/claim/history RPC | 988 ms | 517 ms |
| Backend typing dispatch | 1,147 ms | 632 ms |
| AI generation | 2,364 ms | 1,808 ms |
| Instagram Send API acknowledgement | 2,184 ms | 3,879 ms |
| Message timestamp to send start | 6,405 ms | 3,510 ms |

These are two observations, not a percentile or latency guarantee. Typing dispatch
is when our fetch starts, not when a customer sees the indicator. `meta_delivery_ms`
is a legacy name for message timestamp to send **start**, not delivery confirmation.
The gap between that metric and backend pre-send time was approximately 1.1–2.9s;
it includes upstream ingress and work before per-item timing starts.

## Changes

- Start fresh automation-rule and quota reads concurrently after durable message
  claiming and workspace resolution. Still await both before typing or sending.
- Reject explicitly outgoing DM events whose recipient is neither the entry
  business nor its resolved account ID. This also handles unflagged outgoing
  notifications with another sender scope. Never use text equality to suppress
  inbound customer messages.
- Ask AI for concise straightforward answers without reducing the existing token
  limit, removing business instructions, or replacing greetings with canned text.
- Measure `meta_ingress_ms`, `verification_ms`, `batch_wait_ms`, `rules_ms`,
  `quota_ms`, `eligibility_ms`, `typing_api_ms`, `typing_ack_ms`,
  `typing_accepted`, and `message_to_send_ack_ms`. An accepted API request is not
  proof of customer-visible display; Meta provides no display timestamp here.
- Typing acknowledgement remains independent of AI generation and delivery.
  Collect its final measurements during background logging.

GET webhook verification is a subscription handshake, not a per-DM network call.
POST authenticity uses local HMAC/constant-time secret comparison. No antivirus
step exists in this implementation. Keep signature verification, fresh quotas,
atomic duplicate claims, history, and confirmed outbound message IDs intact.

## Validation and remaining measurement

Mocked handler tests prove rules/quota overlap, typing waits for valid allowance,
slow typing acknowledgement cannot block AI/send, and outgoing scoped events do
not generate AI requests. Existing DM, story, comment, retry and HMAC tests pass.
A new real customer test is needed after deployment to measure the new breakdown.
Under-one-second customer-visible typing cannot be guaranteed when upstream Meta
notification or sender-action delivery alone takes longer than one second.

## External documentation reviewed

- OpenAI latency optimization: https://developers.openai.com/api/docs/guides/latency-optimization
  Concise output and independent parallel operations reduce controllable latency.
- n8n queue mode: https://docs.n8n.io/hosting/scaling/queue-mode/
  Queue handoff scales processing but may add overhead/latency.
- Manychat AI Replies: https://help.manychat.com/hc/en-us/articles/23018283889180-Manychat-AI-Replies
  Describes knowledge-based AI replies; does not publish a measurable subsecond
  Instagram delivery guarantee or enough internals to attribute its speed.


## Follow-up: one preparation RPC

Latest confirmed replies dispatched typing at 459/1,059ms, with Meta acknowledging
at 1,264/2,257ms. Upstream event ingress took 1,302/2,861ms; signature verification
was 1ms. The typing API accepted both actual customer requests. Acknowledgement
still does not prove that Instagram displayed the indicator.

The new `autoreply_prepare_automation_event` RPC returns a durable claim, history,
fresh automation rules and quota together, eliminating all additional eligibility
network round trips. It allows only service-role execution. It preserves the existing single-account
ID-scope compatibility fallback; with multiple accounts, exact routing is required. Preparation
failure blocks typing and send. Run migration before deploying this function.
Self events and the connected account's sender username are also filtered, covering
outgoing change notifications without recipient/is_echo fields. Text equality is
never used to suppress customer messages.

Typing starts immediately after this single valid snapshot while AI generation
runs in parallel. Off is requested when the reply is ready, without waiting for
that API to send the actual reply; if on is pending, off is sequenced behind it.
Mocked tests cover these gates. Live RPC execution was validated inside a rolled
back transaction, and role privileges were checked without exposing account tokens.


## ID compatibility hotfix

An extra exact-ID precheck in the preparation RPC blocked notifications whose
business ID differs from the connected account's app-scoped ID. Meta POST requests
were acknowledged, but no claim/reply was started. The precheck was removed to
restore the existing service-only single-account resolution behavior. The original
context RPC only uses this fallback when exactly one runtime account exists; it
never chooses arbitrarily among multiple workspaces. HMAC authentication remains
mandatory before calling this service-only RPC. Live database execution using a
different ID scope was validated inside a rolled-back transaction.

Batch-result and unresolved-account diagnostics now expose safe reason/latency
fields in function logs without message text, replies or tokens.


## Typing handoff correction

The previous stop-before-send ordering could leave a visible empty interval while
Instagram accepted the outgoing message. Typing off is now requested only after
the Send API returns a confirmed message ID (or after a failed send for cleanup).
Typing and AI still run concurrently. Off never blocks delivery. A controlled
slow-send regression test proves no typing-off request runs while send is pending.
Meta acceptance does not expose a customer-visible display timestamp, so exact
visual simultaneity cannot be promised.


## Typing lifecycle (2026-10-06)

Successful customer events at 10:31–10:32 UTC had typing accepted by Meta, with preparation taking 555–1175 ms and sender-action acknowledgement taking another 603–1717 ms. Separate failed events returned Meta 500 errors; these do not establish the reason typing was absent on the customer's screen. API acceptance is not a client visibility timestamp.

Sender actions now share a conversation-specific queue within each edge worker. A newer turn supersedes the older turn's cleanup; pending actions finish in order, and stale off actions are skipped. Long-running turns refresh typing every four seconds. Transient sender-action failures get at most one retry while the turn is still active; permission errors do not retry. AI and message generation remain parallel with typing. Refresh timers stop after confirmed message acceptance or send failure.

This queue is worker-local, not a distributed conversation lock. It prevents local action ordering races but cannot guarantee ordering of separate workers or Meta's app rendering. No artificial wait is added to the reply merely to keep the indicator visible. The earliest permitted start remains after fresh automation/quota checks and a durable message claim.


## Fast typing start with durable inbox (2026-10-06)

The current inbox implementation performed contact lookup, contact writes and
message writes before typing/AI. Those writes now run alongside typing and AI,
after the authenticated preparation RPC has durably claimed the message and
fresh rules/quota have passed. Reply delivery still waits for successful inbound
storage. Persistence failure blocks both AI and static delivery; AI typing is
cleaned up. Ignored/quota-limited inbound events remain registered as background
tasks so their inbox writes are retained. Profile enrichment waits for base
persistence to avoid overwriting the initial contact.

Configured AI reply delays now begin after typing is dispatched; the configured
reply delay remains respected. AI generation never waits for typing acceptance.
The existing refresh, transient retry and send-confirmation-before-off behavior
remains. `inbound_save_ms` measures persistence independently of `context_ms`.

History remains in the same preparation SQL transaction: splitting it would add
a network round trip and risk stale cross-worker conversation state. No stale
account/rule/quota cache is used to start typing. No region change was guessed:
Mumbai database/function placement already exists and requires measured A/B tests
against automatic routing before altering the live Meta callback. Early webhook
acknowledgment requires durable processing/recovery design, not untracked
fire-and-forget work, and is not introduced in this patch.

Controlled storage-gate tests prove typing and AI begin before storage completes,
while sends wait for durable storage. These establish the scheduling improvement,
not a customer-visible subsecond latency guarantee. Existing ingress/API timings
are historical observations, not fresh measurements of this version.


## Verified self-echo sender identity repair

Five numeric-sender inbox records matched five confirmed outgoing messages by
both conversation/item identity (their raw MIDs differed only in account scope)
and text. Each mistaken automation attempt to that sender failed with user not
found. These are self echoes, not a second customer. The second AI automation's
five confirmed sends are valid and must not be zeroed or counted twice.

A server-maintained `own_sender_ids` array on the private connected-account record
now filters verified business sender scopes before inbox writes, typing or AI.
Reconnect preserves aliases only when the verified Instagram account ID matches;
other accounts cannot inherit them. Numeric IDs alone and repeated message text
are never reasons to suppress customers. Alias seeding/cleanup is restricted to
evidence-backed workspace records; no global sender ID is hardcoded in the app.
Incorrect inbox/contact/insight records are archived with their original data
before removal, and successful outgoing messages/statistics stay intact.
