# Auto Replys — smart multi-product ad / Reel routing

## Safe rollout

This change is additive. It does **not** delete or migrate catalog products, contacts, inbox messages, customer memory, automations or orders. It does not change subscription limits, Instagram sending logic or human handoff. It must be validated before merging or deploying. The existing AI automation still selects **one Catalog**; put the products for that automation in the selected Catalog.

## Configuration (business owner)

1. In **Catalogs**, create/edit each distinct product. Save its current price, details, pictures, delivery/COD/availability facts and optional Style Number.
2. In that Product Editor, under **Instagram Ad / Reel source**, add each **Meta Ad ID** and the associated Instagram **Reel URL / media ID**. A single product can have several ads. Leave unknown IDs blank.
3. Map every promoted product. If an Ad ID or Reel is intentionally shared among multiple products, the assistant asks which one the customer means; a source does not prove a unique product.
4. In **Automations**, select the Catalog for the active AI DM automation and keep one ordinary business **Master System Prompt**. Do not duplicate every product/price inside the prompt.
5. Confirm the Meta App is subscribed to the appropriate Instagram messaging fields, including **messages** and, when available for the app, **messaging_referral**. Permissions, app mode and connection must allow signed webhook delivery.
6. Test with an actual **Click-to-Instagram-DM** ad. Check the Inbox message attribution, contact Last source and the AI's first product response. A person who merely views a Reel and later DMs from the profile cannot be reliably attributed.

## Runtime and data guarantees

- Signed webhook event transport is verified by the existing HMAC gate *before* the new source handling. Only data from signed Meta events is considered.
- An inbound referral (when supplied) may contain `ad_id` and/or a linked media ID. An optional separate `messaging_referral` event is stored without creating a fake DM or AI reply; a later message from the same account/sender can reuse it for seven days.
- Per-product mapping prefers an exact **Ad ID**, then a saved Reel/media reference. The saved post-reference map is considered only when it uniquely identifies a product. There is no inference from viewing counts, filenames, the order of products in the database or similarity of product photos.
- An explicit customer request for another product, a confirmed previous order, conversation history and human takeover requirements take precedence over the ad's suggested first product.
- A unique match is sent as *data* to the existing catalog AI engine, alongside current saved facts; the normal business prompt, history, customer memory, photo selection and staff handoff paths remain active.
- Inbox messages store `ad_source` and contact records store `first_ad_source`/`last_ad_source`. A separate small `customer_ad_sources` record holds a standalone referral until the message arrives. Existing records remain untouched when a referral is absent.
- Catalog media and Ad IDs are normalized/validated. Duplicated/conflicting mappings are marked ambiguous instead of selecting a product at random.
- No actual sale or payment is marked confirmed by the new feature. Order placement and delivery status must remain backed by a real order integration.

## Testing and deployment

Run `bun run lint`, `bun run test:connections`, `bun run test:automations`, `bun run test:dm` and `bun run build`. Inspect pull request CI, then deploy both the website and `instagram-live-webhook` Supabase Edge Function from the **same commit**; shipping only the website will display fields without changing live auto-routing. Validate signed live referral payloads and confirm that unrelated or untracked DMs do not inherit invented ad IDs.

## Current limitations

- Multi-catalog discovery across separate AI automations is not included; selection remains the existing one-active-catalog configuration.
- Meta does not promise an Ad ID or media reference on every inbound DM. No attribution should be shown when the webhook supplied none.
- Contact source is the most recent **Meta-reported referral**, not the customer's current product of interest or proof they watched a video.
- A future order dashboard requires a verified order state machine and carrier/merchant integration rather than parsing AI chat text.
