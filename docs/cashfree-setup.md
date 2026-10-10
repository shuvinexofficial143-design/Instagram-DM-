# Cashfree payment setup

The existing plan cards remain unchanged. Choosing a paid plan opens `/billing/checkout?plan=starter|pro|business`. The app opens separate plan, order-confirmation, eligible-method, payment and result screens. Account name/email are prefilled; only missing receipt information is requested. Cashfree Elements supply secure payment fields, and the server polls the provider. Signed webhooks reconcile payment even if the browser is closed. Orders and subscription activation are durable and idempotent. Payment callbacks, signatures alone, or client state never grant access: the server fetches the order and successful payment, verifies identity, amount and INR, and activates in one database transaction.

## Test first

1. Cashfree Merchant Dashboard → **Test Environment → Developers → Payment Gateway → API Keys**. Use Payment Gateway keys, not Payouts, Verification Suite or Subscriptions keys.
2. In Vercel project **Instagram DM** → Settings → Environment Variables, enter the values directly:
   - `CASHFREE_CLIENT_ID`: test App ID / Client ID.
   - `CASHFREE_CLIENT_SECRET`: test Secret Key, **Sensitive**, server only.
   - `CASHFREE_ENV`: `sandbox`.
   - `CASHFREE_LIVE_ENABLED`: `false`.
   - `APP_URL`: `https://autoreplys.vercel.app` (canonical return host).
   - Existing `SUPABASE_SERVICE_ROLE_KEY` remains server only; do not replace it with a publishable key.
3. Cashfree Payment Gateway → Developers → Whitelisting: register the exact HTTPS website domain. Use the same origin for checkout and APP_URL; log in on that origin to retain the return session.
4. Payment Gateway → Developers → Webhooks: add `https://autoreplys.vercel.app/api/billing?action=webhook`, select Payment Success, Payment Failed, Payment User Dropped and current supported webhook version. Set this separately in test and live dashboards. Success events recheck Cashfree; failed attempts never remove paid access.
5. Redeploy Vercel after setting environment variables. Complete success, declined, abandoned, refresh/return and repeated callback tests using Cashfree sandbox details. Sandbox receipts are labelled Test and do **not** change live entitlements.

Do not paste API secrets in chat, screenshots, frontend variables, source code or client storage. These keys are not required in the frontend: only the order-specific `payment_session_id` is returned to its authenticated owner.

## Business details to supply

Use the exact Cashfree registered legal business/individual proprietor name, customer-support email, phone number and business address. Set:

- `BUSINESS_LEGAL_NAME`
- `BUSINESS_SUPPORT_EMAIL`
- `BUSINESS_SUPPORT_PHONE`
- `BUSINESS_ADDRESS`

About, Contact, Privacy, Terms and Refund & Cancellation pages display configured contact details. Missing identity is shown honestly and blocks production checkout. KYC, PAN, Aadhaar and bank documents belong in the Cashfree onboarding portal, not in this repository or chat. No fabricated business name, email or phone is supplied by the app.

## Go live after Cashfree approval

Complete pending activation/VCIP requirements in Cashfree. Whitelist the canonical production domain and configure the live webhook. Replace test keys with production Payment Gateway keys, set `CASHFREE_ENV=production`, fill all business details and set `CASHFREE_LIVE_ENABLED=true`. Redeploy and complete one authorized live purchase before offering checkout to customers. Merely setting environment variables does not prove that Cashfree approval, whitelisting or payment methods are available.

Cashfree decides which UPI/QR/card options appear. The site uses provider-generated checkout payment references; it never creates a static personal QR or activates a plan from a screenshot of a bank payment.

## Plan rules implemented

- Starter ₹299, Pro ₹599, Business ₹1,299, from the authoritative database at reservation time; total amount is INR, no hidden surcharge.
- 30 days per purchase, manual renewal, no automatic debit mandate.
- Same active plan: extend its expiry by 30 days. Different plan: immediate replacement with a new 30-day period, no prorated credit for unused time. Checkout and Terms disclose this before payment.
- Calendar-month usage across the login's Instagram workspaces. A purchase does not reset monthly consumption. Expiry automatically resolves to Free limits, including in the webhook preparation RPC.
- First paid purchase stores remaining Free allowance as a 30-day additional allowance. No repeated Free bonus on subsequent renewals.
- Each new plan selection starts an independent checkout. Only retries with the same request ID reuse its immutable order, customer details and deadline. Bank debit without PAID + SUCCESS verification does not grant access.
- Old out-of-order payments cannot overwrite a more recent plan; their receipts show activation review for support reconciliation.
- Refund requests are handled by business support and the payment provider; there is no automated refund or AutoPay cancellation API in this integration. Reply packs remain unavailable.

## Verification

`npm run lint`, `npm run build`, `npm run test:billing`, `npm run test:ui`, `npm run test:connections`, `npm run test:automations`, `npm run test:dm`.

Database tests run in a transaction and roll back synthetic reservations/activations, checking duplicate callbacks, sandbox separation and real entitlement selection. Billing tables have RLS, no browser privileges and service-only RPC execution. Internal webhook RPCs are service-only. No real payment has been completed until merchant keys are configured and test/live checkout is exercised.

Official references:
- https://www.cashfree.com/docs/payments/online/web/redirect
- https://www.cashfree.com/docs/payments/online/webhooks/signature-verification
- https://www.cashfree.com/docs/api-reference/payments/latest/orders/get-order
- https://www.cashfree.com/docs/api-reference/payments/latest/payments/get-payments-for-an-order
- https://www.cashfree.com/docs/payments/online/go-live/whitelist


## Custom checkout (10 October 2026)

The authenticated checkout now opens outside the workspace navigation. Plan review and billing details lead to an Auto Replies payment page using Cashfree **Elements**, rather than embedding the complete hosted checkout. Individual `upiQr`, `upiApp`, `netbanking`, and secure card field components use Cashfree's official v3 CDN. UPI QR stays inside our layout; bank and card authorization may navigate to the bank before returning. This integration uses the browser Element SDK, not the raw S2S Order Pay API.

A chargeable order is created only when the customer starts a payment method. New orders persist a five-minute deadline before the provider request and send it as `order_expiry_time`. The UI uses the earlier of that immutable deadline and the provider deadline, removes QR at expiry and checks server status before regeneration. Refreshing or retrying cannot extend it. Historical provider expiry is stored separately.

Pending payments are reconciled automatically every four seconds while visible and on browser focus. Successful SDK callbacks and redirects trigger verification but never grant access themselves. A verified production payment activates the subscription; the success page then reloads billing to refresh the account's entitlement. Signed webhooks remain active when the customer closes the page.

Validation: all paid plans passed authoritative-price and activation API tests, and reservation, activation, entitlement and idempotency checks ran inside a rolled-back production database transaction. No live bank payment was made. Merchant acceptance of real QR, card and bank payments still requires an authenticated checkout/payment test on the whitelisted domain.


## Selected-plan checkout revision (2026-10-10)

The Billing & Usage current-plan card is white again. Its plan cards and usage cards retain their existing styling. Manage subscription now lives in Settings.

A plan URL opens that plan directly. Historical unpaid orders remain in billing history, independently of new checkout selection. See the independent-checkout revision below for current reservation and reconciliation behavior.

Checkout now uses a centered white layout with orange actions, compact progress steps and no dashboard sidebar. Only the plan-details screen lists features; order confirmation and method selection are separate screens. Merchant-enabled methods and banks are obtained from Cashfree eligibility using authoritative plan prices. QR expiry is read from the provider, preserved on refresh and checked before regeneration. Verified active plans show a short check/confetti animation and return to fresh Billing data after four seconds. Receipt views do not redirect. New provider order IDs use short environment prefixes to stay within the 45-character limit; legacy references remain readable. Provider failures return safe error codes and merchant-authentication messages without exposing secrets.

Latest validation: 25 API unit tests and 55 UI regression checks; local React interaction tests cover all three paid-plan paths, expiry/unmount, and paid-but-activating transition to congratulations. These tests mock Cashfree; an authenticated real payment remains required to prove live merchant acceptance.


## Independent checkout revision (2026-10-10)

The historical Starter order was stuck in Cashfree `TERMINATION_REQ`. The previous single-pending-order constraint and termination wait blocked newly selected plans indefinitely. Apply `supabase/migrations/20261010141402_independent_billing_checkouts.sql` before deploying the updated API.

The new service-only reservation RPC locks per owner and reuses only the same request ID. A fresh request supersedes earlier unpaid checkouts and immediately reserves the selected plan using authoritative plan data. It does not wait for or repeatedly request provider termination. The former pending-order unique index is replaced with a nonunique owner/environment history index. Immutable customer details keep provider idempotency retries identical.

`checkout_state` controls whether payment can be offered; financial `status` records provider confirmation independently. Back, local closure, replacement and the five-minute UI expiry never fabricate a financial failure. Closed/replaced/expired history has distinct labels and useful actions instead of an endless loading screen. Visible history refreshes every 15 seconds and on focus. Browser API requests time out after 25 seconds; inconclusive result screens replace their spinner after 20 seconds while automatic status checks continue.

An immutable `payment_expires_at` is persisted before provider creation. A separate `provider_expires_at` can shorten the displayed window but cannot alter a retry's request. No session is exposed after expiry, replacement, closure or verified payment. Refresh and retries preserve the deadline. QR regeneration checks the old payment first. Paid webhook races during creation/status refresh return the stored paid result, never another payable QR.

Signed webhooks and owner-scoped status checks verify order, owner, amount, INR and a successful provider payment before the atomic activation RPC. Repeated confirmation cannot extend access twice. A delayed success on the latest un-replaced checkout can activate after the UI deadline. A payment for an explicitly closed/superseded checkout, or one older than the current subscription, is recorded as paid with activation review and does not overwrite the newer plan. This preserves the payment for support reconciliation without claiming access is active.

Checkout retains its staged layout, card dimensions and lavender/violet/mint splash palette with larger text. Billing plan cards remain unchanged.

Validation: 34 billing API tests, 60 UI regression checks, TypeScript and production build passed. Local React interactions with mocked Cashfree for Starter/Pro/Business, QR expiry, refresh, UPI app/net banking, closed history, delayed confirmation and verified activation/congratulations. `tests/billing-checkout-database.sql` runs with assertions enabled in a rolled-back database transaction and checks independent reservations, immutable retries, late-payment review, delayed current-order activation, duplicate confirmation and service-only RPC privileges. No real bank debit or bank authorization was performed in these checks; live merchant acceptance requires an authenticated purchase on the whitelisted domain.
