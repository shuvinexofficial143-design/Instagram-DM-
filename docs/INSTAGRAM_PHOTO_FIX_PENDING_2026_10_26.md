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
