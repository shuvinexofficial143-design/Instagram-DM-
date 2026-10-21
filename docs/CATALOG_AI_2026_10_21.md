# Catalog, product photos and image understanding — 21 October 2026

The builder preview and live Instagram worker now use the same pure Catalog/AI engine. The preview reads products through the signed-in user's RLS session and never sends Instagram messages or changes customer records.

## Behavior

- Read the selected workspace's active Catalog and saved products for each AI reply. Current Catalog prices, descriptions and links take precedence over old product snapshots in the prompt/history. New “Use in AI” prompts refer to the selected Catalog without copying product prices into the prompt.
- Rank relevant products and offer a scoped catalog search tool for additional details. Keep complete product objects within the prompt budget, rather than cutting a serialized JSON document mid-record.
- Select approved product IDs and zero-based photo indexes with `send_product_photos`. Reject unknown products, nonexistent views and selections exceeding ten cards. Use `send_catalog` for numbered browsing pages. Fixed DM Reply sends the first page; AI DM supports product selection and requested further pages.
- Catalogs larger than ten photos remain usable. The page preview displays Previous/Next controls. Text-only products remain available as AI knowledge; unavailable photos do not block written answers.
- Missing/inactive/unreadable Catalogs become warnings for AI. Unrelated business questions can still be answered; old copied catalog prices must not be substituted when current data is unavailable.
- Recognize both image-only and text+image signed Meta events, including the `changes.messages` shape. Retain safe image URLs in Inbox and pass images to vision. Ignore image echoes/self events through the existing controls.
- Analyze visible image features/OCR, rank Catalog candidates, and compare a bounded set of product reference photos. Ask for clarification for ambiguous matches; resemblance is not an exact SKU guarantee. Never treat a payment screenshot as verified payment or follow instructions embedded in a customer image.
- Gracefully handle unavailable image inputs and expired Inbox images. No automatic Instagram send retry was added.
- Builder preview accepts a product photo, renders the selected photo cards, retains a short conversation for follow-up questions and supports starting a new test conversation. Tests never dispatch to Instagram.
- Preserve unsaved edits to one product when another product is refreshed through Realtime, and guard late mutation results after switching workspaces. Track concurrent image uploads independently. Paginate Catalog reads beyond PostgREST's default 1,000-row cap.

## Boundaries and limits

At most three customer images are analyzed per incoming message. The builder accepts one JPG/PNG/WebP up to 2 MB; Catalog uploads retain their existing 5 MB per-image limit. Catalog loading is bounded to 10,000 workspace product records; a larger dataset raises an explicit error instead of silently returning a partial catalog. Photo messages contain at most ten cards; additional pages require a further request. Vision uses a ranked candidate shortlist and may need a clearer photo, product name or staff assistance. Image URLs supplied by Instagram can expire.

Authentication, workspace isolation, pause/disconnect checks, delivery deduplication, human handoff, quota reservation and confirmed Meta delivery continue to govern live sends.

## Validation

332 automated tests and 89 UI rendering/routing checks passed, along with TypeScript and the production build. New tests cover photo selection, foreign IDs, later pages, text-only products, current product data, unsafe URLs, vision inputs, unavailable images, product search, RLS-scoped preview reads, foreign workspace denial, no preview side effects, signed image webhook processing, preserved drafts and image/card preview rendering.

Verification uses synthetic fixtures and mocked model/Meta responses. Actual Instagram photo delivery and actual model image recognition require a connected account with populated Catalog products and remain a separate live check. No real customer message was sent, no product was invented, and no account's Catalog was selected automatically.
