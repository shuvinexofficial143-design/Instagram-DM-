# Production Inbox investigation and repair — 2026-10-26

Project: `dwgxmmftybxwpurgsxkx` / Instagram DM Production. Selected connection: Nazha.

## Confirmed reply failure

The INAARA inbound message reached the Inbox on 2026-10-25 at 15:22:55.994 UTC and was saved at 15:22:58.098 UTC. Runtime logs at 15:22:58.141 UTC reported `task.catch is not a function` in background work. Adjacent native outgoing events repeatedly crashed at the same helper.

`admin.rpc()` returns a lazy PostgREST PromiseLike builder with `.then()`, not a native Promise with `.catch()`. `runInBackground()` called `.catch()` directly. In the inbound persistence completion callback this rejected `inboundSaved`, preventing the handler from reaching the Instagram send. The old event was already claimed; historical webhook replay is therefore neither a safe test nor the recovery strategy.

The helper now uses `Promise.resolve(task).catch(...)` before registering it with `EdgeRuntime.waitUntil`. The automation test fixture now models the actual lazy thenable instead of masking this failure with an `async` mock. The previously passing first AI reply test failed with that realistic fixture before the fix and passed afterward. The full suite also covers native outgoing context, inbound follow-up, duplicate delivery and takeover behavior.

An explicitly sourced forensic event was attached to the exact INAARA incoming message, preserving the observed timestamp and stating that the fix is deployed and no historical reply was resent. No success or attempted delivery was fabricated.

## Confirmed profile cause and recovery

The User Profile API returned `User consent is required to access user profile` for the eight outbound-only customers. The account-store function retried only that endpoint and left the numeric sender IDs as usernames.

The authorized business Conversations API returned each actual scoped recipient ID with its real username. A bounded, paginated fallback now reads this endpoint, verifies the business is a participant, and matches only the exact requested scoped recipient IDs. It reconstructs requests from the fixed Graph host and pagination cursor rather than following arbitrary next URLs. Foreign-business conversations, mismatched profile IDs and unrelated recipients are rejected in regression tests.

The eight numeric contacts were archived in the existing document store before recovery. All 11 screenshot contacts and their 19 Inbox messages now have verified usernames. The same scoped enrichment RPC updates Leads and Inbox identities; no customer conversations were merged. The message count and original transcript/timestamp hash stayed unchanged: `97fafbb4a2332e0d6ee059f84040ee89`.

Photo access remains separate. The authorized Conversations response supplies scoped IDs/usernames, not photos. Existing real photos are preserved. No fake, scraped, generated or another account's photo was substituted when Meta withheld a photo. The normal inbound enrichment and bounded profile refresh continue to request an eligible customer's actual photo.

## Deployed and verified

- Applied `authenticated_inbox_message_time_permission`: authenticated timestamp parsing is granted; anonymous execution and browser access to the private worker remain denied.
- Tested the timestamp parser, mark-read and the two-message INAARA Inbox page under the actual workspace owner's authenticated role; all test writes were rolled back.
- Deployed `instagram-live-webhook` v62 and `instagram-account-store` v30, preserving their existing JWT configuration and internal request authentication.
- 397 automated tests, 98 offline UI checks, TypeScript and production build passed.

No customer DM was sent and no historical incoming message was replayed. A future customer-driven incoming DM remains the final live delivery confirmation; compilation, health checks and mocked Meta sends are not proof of that delivery.
