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
network round trips. It allows only service-role execution and refuses unknown
business IDs rather than invoking the legacy single-account fallback. Preparation
failure blocks typing and send. Run migration before deploying this function.
Self events and the connected account's sender username are also filtered, covering
outgoing change notifications without recipient/is_echo fields. Text equality is
never used to suppress customer messages.

Typing starts immediately after this single valid snapshot while AI generation
runs in parallel. Off is requested when the reply is ready, without waiting for
that API to send the actual reply; if on is pending, off is sequenced behind it.
Mocked tests cover these gates. Live RPC execution was validated inside a rolled
back transaction, and role privileges were checked without exposing account tokens.
