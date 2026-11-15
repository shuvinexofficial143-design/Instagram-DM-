# Customer detail continuity and GPT-5.6 Luna

Live DMs, preview, prompt analysis and background memory use `gpt-5.6-luna`.
Structured extraction uses low reasoning. Chat Completions tool requests use
`reasoning_effort: none`, the provider-supported combination for this model;
photo, catalog search, historical search and human handoff retain their contracts.

Before a reply, the runtime scans inbound customer data and persists field-level
source spans independently of lossy conversation summaries. Only exact inbound
source evidence from the same workspace and conversation is accepted. Name
changes require an explicit correction; conversational “kar diya” is not a name.
Customer aliases share a canonical record. Concurrent patches merge by source
time. Custom configured capture fields retain evidence validation.

Business instructions are preserved up to 60,000 characters, with explicit
validation above the limit. The default conservative UTF-8 context bound is
131,072 bytes, with a protected recent-message window. Canonical customer facts
are included even if a historical summary is incomplete or contradictory.
Replies should ask one or two genuinely missing details. A request for already
known details is retried once and then constrained to missing fields.

Phone and PIN syntax checks do not verify ownership, postal geography, service
coverage or physical deliverability. Ambiguous address parts must be confirmed.
Customer, owner and assistant messages are not proof of payment or fulfillment.

Apply `20261115051544_customer_detail_evidence_and_luna.sql` before the live
webhook. Deploy `instagram-live-webhook`, `instagram-memory-worker` and website
source together. The additive merge RPC is service-only. Removing an inbox source
invalidates only derived fields referencing that exact source.

`tests/customer-facts.test.ts` covers combined addresses, missing PINs, source
isolation, name overwrite prevention, context retention, provider parameters and
reply retries. `tests/customer-facts.integration.sql` runs synthetic checks in a
rolled-back transaction. `instagram-ai-check` is protected by the existing worker
authorization and runs synthetic provider checks with no Meta send or customer
write path.
