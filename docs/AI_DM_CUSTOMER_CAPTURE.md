# AI DM customer capture and Admin email preferences

Customer Data setup and review fields are available only on AI DM Conversation. Comment Automation, Story Reply and fixed DM Reply save capture as disabled and omit customer-data fields. The Admin automation editor applies the same restriction.

The live webhook refuses extraction for all non-AI trigger types even if old configuration still says enabled. The database normalizes non-AI automation writes, disables their capture collections, and checks the current rule type before accepting a customer capture. Existing customer records are retained. AI DM capture remains configurable and works as before.

Email notifications moved from workspace Settings to Admin panel → Settings. The preference endpoint verifies the administrator allowlist before reads or writes. Preferences are scoped to the signed-in administrator; customer activity, welcome emails, invoices and unsubscribe links retain their existing behavior.

Apply `20261020033442_ai_dm_only_customer_capture.sql`, deploy `instagram-live-webhook`, and deploy the website/API. The migration updates existing database functions without expanding their privileges. `tests/ai-only-customer-capture.integration.sql` exercises all four automation types, legacy enabled flags, AI capture, type changes, storage-level enforcement and history preservation in a rolled-back transaction. Runtime, API, UI, administrator and existing regression suites cover the associated changes. No customer message is sent during verification.
