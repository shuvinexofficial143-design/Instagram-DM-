# Contact profiles and message-specific reply diagnostics

Leads and its Sales pipeline previously rendered numeric messaging IDs as `@username` even though Inbox already treated them as unavailable profiles. They now share a verified identity resolver, use a saved full name when available, and can recover the handle/photo from messages with the same scoped sender ID or an explicit saved alias. Text similarity never joins contacts. CSV exports keep username, full name and Instagram ID in separate columns.

Profile refresh now includes empty/invalid usernames with an existing photo, malformed refresh timestamps, and profiles older than 24 hours. Existing in-flight guards and per-contact retry delays remain. The account-store refresher also accepts a verified name-only response.

Reply diagnostics now correlate a failure to the latest incoming Meta message ID. An unrelated Sheet/extraction error cannot become its explanation, and a failed/pending manual send cannot hide the AI failure. The Inbox displays the observed provider error with credential redaction. Human Takeover, manual pause, stale conversation context and quota reservation denial now keep their actual reason in the webhook event, with the sender ID.

## Production boundary

**Update after the Nazha Supabase connection became available:** production investigation and deployment are completed in [INBOX_BACKEND_VERIFICATION_2026_10_26.md](INBOX_BACKEND_VERIFICATION_2026_10_26.md). The access limitation described below records the earlier execution, not the current state.

The earlier timestamp EXECUTE repair remains in `supabase/migrations/20261025_authenticated_inbox_message_time_permission.sql`. It grants only the pure timestamp parser to `authenticated` and keeps anonymous and private campaign RPC access restricted. Mark-read now uses the existing account-store Edge route, with authenticated workspace selection and a second ownership check at the Edge boundary. This avoids calculating the generated timestamp under the browser's restricted database role. The underlying database migration is still required for other authenticated writes.

During this execution the Supabase connector denied access to project `dwgxmmftybxwpurgsxkx`; its connected project list did not include this project. Backend SQL execution, Edge deployments and inspection of the screenshot's actual incoming message therefore remain unverified. Vercel project `instagram-dm` was listed under `team_jN4pWc8SGA3NOfKJdcR3b9vw`, but project inspection returned 403 requiring a team access grant.

Deploy the timestamp permission migration, `instagram-account-store` and `instagram-live-webhook` to the verified production Supabase project. Confirm the authenticated mark-read operation and refresh results, then inspect the specific real inbound event before declaring the third reply repaired. No customer test DM or historical replay was sent in this execution. Meta can withhold profile fields; an unavailable photo or handle is never invented.

## Validation

- Functional identity, refresh and message-specific failure regression tests.
- Webhook execution tests for handoff/pause, changed conversation and provider refusal logging.
- Offline React rendering checks for Leads, Sales pipeline and Inbox.
- TypeScript and production build.
- SQL/live Instagram end-to-end verification requires the production access described above.
