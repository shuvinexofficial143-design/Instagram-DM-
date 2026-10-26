# Instagram profile photo follow-up — production deployment verified

Update: the earlier approval-review usage block cleared. Both profile migrations are applied; webhook v64 and account-store v31 are deployed. Their shared-module source was retrieved and compared with local files. Both health endpoints returned HTTP 200. The earlier username recovery and lazy-thenable AI dispatch fix remain intact.

## Findings

- Eleven contacts have verified usernames. No duplicate exact workspace/scoped-ID contact groups were found during the investigation.
- Two available original Meta photo URLs returned HTTP 200 JPEG images. Nine contacts have no available photo; eight outbound-only profiles returned Meta error 230 (user consent required). A photo cannot be invented or guaranteed where Meta withholds it.
- The existing avatar component accepts valid image URLs and cached image data. The follow-up caches actual verified photos to reduce dependence on signed CDN URL lifetime.

## Prepared changes

The shared profile resolver supports exact scoped sender IDs from verified business conversations. Webhook events resolve available names immediately. The photo downloader restricts destinations to Meta CDN hosts, bounds time and bytes, validates image signatures, and stores cached image bytes once on the private contact. Profile updates merge fields atomically through a service-only RPC. A partial unique index prevents duplicate exact workspace/scoped IDs; the UI consolidates explicit aliases without merging unrelated contacts by username. Pending identities no longer display numeric suffixes.

## Validation and release status

Local validation passed: 405 automated tests, 100 UI checks, TypeScript checking, and production build. The new image test suite is included in the CI test command.

The initial migration attempt in the earlier execution was blocked before execution by an approval-review usage limit. On resumption the standard Supabase connector succeeded. Both migrations now apply successfully. One additional migration attempt accidentally contained a local file-read error while the CLI was still creating the file; automatic review rejected it before execution. After the generated SQL file existed, its successful read and SQL contents were checked explicitly before the corrected migration was applied. No error payload was executed.

Production rollback-only SQL tests passed for atomic name/photo merge, unchanged message text/tags/counters, duplicate scoped-ID rejection, browser RPC denial, and cached-photo preservation across a failed/expired raw CDN refresh. All fixtures were rolled back. Two real JPEG photos were fetched from the previously verified exact contacts and cached through the private profile RPC. Final database counts: 11 contacts, 11 verified usernames, zero numeric usernames, two cached real photos. The original message-text hash before and after photo repair remained `c0aefae93ea91446754185874e3f831a` (same expression and sort order used for this check).

The photo cache does not grant missing Meta consent. Nine contacts still have no available photo. Cached real photos render through the existing avatar component, with offline checks in both Inbox and Leads. Retrieving a newly eligible photo in the deployed runtime and delivering an AI reply to a future real incoming DM remain live-flow verification boundaries. No customer test DM or historical message replay was sent.

## Real incoming-message verification — 2026-10-26, 22:05–22:07 IST

Five new customer-initiated messages from the existing test participant arrived while the follow-up investigation was running. A read-only database join matched each incoming Meta message ID to its exact webhook outcome, then joined that outcome's confirmed Instagram outgoing message ID to the automated Inbox row. Results: five incoming turns, five `sent` outcomes with no AI error, five matching automated outgoing rows, and five distinct outgoing IDs. Message-to-send acknowledgement ranged from 4,227 to 8,619 milliseconds. The latest matched reply was at 16:37:17.816 UTC. This supersedes the earlier statement that real incoming AI delivery remained pending. Meta send acceptance and Inbox persistence are verified; recipient read acknowledgement was not tested.

Current readiness also passed: one active AI rule, administrator unlimited allowance, authenticated account-store health, webhook runtime health, OpenAI configuration, and the actual business subscription includes `messages`. No historical message was replayed and no test message was originated by the operator.

Photo investigation correction: recent profile-refresh logs show error 230 for eight outbound-only profiles. The ninth missing-photo profile is different: a live authorized GET returned HTTP 200 with its exact scoped ID and username but omitted `profile_pic`. Therefore it is inaccurate to label all nine as confirmed consent errors. The response does not establish whether that account has a public picture elsewhere. Real incoming messages on this ninth profile still did not yield a photo through the authorized profile endpoint. Existing two cached real photos remain intact.

Meta's current primary documentation states that messaging User Profile API consent is set when the person sends a message or completes another documented eligible interaction. A business owner's permission cannot impersonate that participant's consent. The present code already retries the exact-ID profile lookup after incoming persistence; no unsupported scraping or unrelated profile image is substituted. Eight participants' consent and the ninth API's absent photo remain external availability boundaries, not repaired or claimed as available.

Primary reference: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile
