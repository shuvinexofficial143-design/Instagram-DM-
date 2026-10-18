# Google Sheets optional setup and error recovery — 2026-10-18

## Evidence

A read-only request to the existing spreadsheet with the stored access token returned Google HTTP 401 (`invalid authentication credentials`). The stored access-token expiry was in the past. Refresh-token validity cannot be inferred from that response. The production environment has the Google OAuth client settings and private database key; no credential values were retrieved or exposed.

Earlier sync records contained HTTP 500 without Google's useful error message. Source inspection found that runtime sync ignored the automation's `sheets_enabled` setting, refreshed access tokens were not persisted, and a Vercel string error was discarded by the Edge sync wrapper. The original browser's specific historical 400 payload was not available, so it is not presented as a separately reproduced root cause.

## Corrections

- An accessible button switch is always visible, including before Google is connected. It has explicit On/Off labels, green active state, a 44px click target, keyboard activation, focus styling and a narrow-screen layout. Connection/column controls appear only while enabled.
- Turning Sheets off clears integration errors and invalidates stale in-flight UI results. It does not delete the connected account, sheet or existing records. AI setup does not call Google status while disabled. An enabled integration must be connected and have a ready sheet before continuing to Review.
- The sync worker reads the saved automation switch before extraction, token refresh, queuing or any Sheets write. Historical bindings alone cannot enable tracking.
- Token refresh saves the renewed access token and expiry in backend-only storage. Runtime refresh resolves the stored workspace credential server-side. An expired/revoked grant produces `GOOGLE_RECONNECT_REQUIRED` and a reconnect instruction, rather than generic Bad Request/500.
- Sheet setup checks/creates required tabs before writing headers, safely quotes A1 ranges and ensures enough columns for up to 30 customer fields plus nine metadata fields. Existing legacy sheets are retained.
- A definite Google 4xx creation refusal releases only that request's new reservation so an explicit retry works. Ambiguous network/5xx creation results remain reserved to prevent duplicate spreadsheets.
- Manual lead appends use the selected automation's sheet binding.

## Verification

190 tests, TypeScript, 70 UI assertions and the production build pass locally. Added checks for switch behavior, disabled sync with an existing binding, revoked grants, persisted refresh, missing tabs, wide schemas, rejected creation and ambiguous creation. Existing DM delivery tests remain in the suite.

A new sign-in/Google consent was not performed. The user may need to reconnect if Google also rejects the stored refresh grant. No real customer rows or existing spreadsheet content were changed during these checks.
