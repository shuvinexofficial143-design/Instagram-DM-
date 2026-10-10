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
- Pending checkout reused per login and environment. Provider Create Order uses the reserved ID and UUID idempotency key on retries. Bank debit without PAID + SUCCESS verification does not grant access.
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

A chargeable order is created only when the customer starts a payment method. New orders send `order_expiry_time` five minutes in the future. The UI displays the provider deadline, removes the QR at expiry and checks server status before starting another order. Resuming a session preserves its existing deadline and never creates another provider order. Historical orders retain their provider expiry.

Pending payments are reconciled automatically every four seconds while visible and on browser focus. Successful SDK callbacks and redirects trigger verification but never grant access themselves. A verified production payment activates the subscription; the success page then reloads billing to refresh the account's entitlement. Signed webhooks remain active when the customer closes the page.

Validation: all paid plans passed authoritative-price and activation API tests, and reservation, activation, entitlement and idempotency checks ran inside a rolled-back production database transaction. No live bank payment was made. Merchant acceptance of real QR, card and bank payments still requires an authenticated checkout/payment test on the whitelisted domain.


## Selected-plan checkout revision (2026-10-10)

The Billing & Usage current-plan card is white again. Its plan cards and usage cards retain their existing styling. Manage subscription now lives in Settings.

A plan URL always opens that plan's details directly. No pending-plan interstitial is fetched or displayed. When the customer starts a new payment, the API reconciles any previous unpaid order, terminates it at Cashfree and verifies termination before reserving the selected plan. A successful payment that races termination is confirmed instead; no second payable order is created. Retries with the same request ID retain the same session and deadline. Orders and payment history are retained for verification; removing the pending screen does not delete financial records.

Checkout now uses a centered white layout with orange actions, compact progress steps and no dashboard sidebar. Only the plan-details screen lists features; order confirmation and method selection are separate screens. Merchant-enabled methods and banks are obtained from Cashfree eligibility using authoritative plan prices. QR expiry is read from the provider, preserved on refresh and checked before regeneration. Verified active plans show a short check/confetti animation and return to fresh Billing data after four seconds. Receipt views do not redirect. New provider order IDs use short environment prefixes to stay within the 45-character limit; legacy references remain readable. Provider failures return safe error codes and merchant-authentication messages without exposing secrets.

Latest validation: 25 API unit tests and 54 UI regression checks; local React interaction tests cover all three paid-plan paths, expiry/unmount, and paid-but-activating transition to congratulations. These tests mock Cashfree; an authenticated real payment remains required to prove live merchant acceptance.
