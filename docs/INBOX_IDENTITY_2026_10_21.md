# Instagram inbox identity repair — 2026-10-21

Native Instagram messages were visible, but appeared under numerical handles and extra incoming conversations.

## Root cause and changes

- `autoreply_claim_dm_context_v4` routed unknown business entries to the only connected workspace. Messages mirrored from a disconnected account therefore became incoming messages in the active account. It now resolves exactly one verified business entry, including verified scoped aliases, and never falls back to a different account. The Edge worker supplies the entry alone and independently rejects a foreign entry before any inbox write, AI call or send.
- Native outgoing capture previously looked up contacts only by row ID. It now recognizes `ig_user_id` and explicit `ig_user_ids` aliases, keeps the verified handle, avoids creating a second placeholder contact and recognizes the business's own scoped ID.
- Outgoing capture requests the recipient's Meta profile in the background. A service-only enrichment RPC updates contact/message identity fields atomically and within one workspace. Numeric fallback results cannot replace verified handles. Inbound enrichment uses the same RPC without overwriting transcript fields or read status.
- Inbox groups by sender identity and explicit aliases. Historical numeric/renamed handles remain in the same thread, with notes and metadata accessible through old keys. Reply, read and takeover actions use the actual messaging ID. Unresolved profiles display `Instagram user` with an ID suffix instead of an invented `@numeric` username. Separate sender IDs are never merged by text or timestamp similarity.
- Conversation deletion resolves historical aliases server-side, including messages outside the loaded page.

## Existing data

A read-only Graph API lookup verified the screenshot's actual outgoing recipient handle. Five false incoming records were proven to be alternate business-entry views of existing outgoing messages: their stored Instagram message IDs contained the same conversation and message components while the business-entry component differed. Their text and sub-two-second timestamps were checked again in the repair transaction.

Five mirrored messages, two placeholder contacts and their two inferred customer-insight records were archived in `inbox_identity_archive` before removal from the active collections. Nine correct messages and two real contacts remain. The actual outgoing recipient now has its verified username. No real message was sent or customer conversation merged during verification. This inspection of existing opaque IDs was a one-time forensic check; runtime routing never decodes message IDs.

Each archived row retains `original` JSON. Message archives use the original message ID. Contact/insight archives also retain `collection` and `original_id`, allowing restoration into the original collection without reconstructing history.

## Verification

- 344 automated tests, including identity grouping, native outgoing scoping, stable-ID replies and existing lifecycle/security suites.
- 94 offline UI rendering checks, including one combined conversation, verified handle display, retained old/new messages and unavailable-profile fallback.
- TypeScript and production build pass.
- SQL integration tests for inbox identities, native/manual conversation context and authenticated conversation deletion run with synthetic fixtures and rollback.
- Edge deployments: `instagram-live-webhook` v59; `instagram-account-store` v28.

A real newly sent Instagram DM was not used as a test. Meta may withhold a new recipient's username until its profile permissions/interaction requirements are satisfied; the fallback remains honest and the conversation does not split when enrichment succeeds.
