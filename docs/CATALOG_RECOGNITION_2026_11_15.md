# Catalog design selection and visual matching

Products retain existing IDs, photos, catalog membership, sending style and data.
Optional JSON document fields now add `style_number`, `post_refs` (post URL/ID and
one-based photo position), `cod`, `delivery_time`, `availability`, and
`customization`. No table migration or existing-record rewrite is needed.
The product editor supports these fields and rejects duplicate Style Numbers
within a catalog. One design should be one product; its extra images are views
of that design. Style Number is separate from Instagram photo order.

The live runtime and authenticated preview share the same selection pipeline:

1. Resolve explicit Style Numbers, including leading zeros and Hindi digits.
   Numbered photo references require saved post mappings; database order is
   never treated as Instagram post order. Ambiguous/missing mappings ask for
   clarification. Quantity requests such as “2 frames” are not ordinals.
2. Compare customer images against all active saved product photos in batches
   of 12, at most two concurrent calls. Reference labels are untrusted data.
   Require a distinctive match, no ambiguity, comparison estimate >=0.93 and
   separation >=0.12 from another proposed product. Duplicate image URLs across
   products cannot establish unique identity. These estimates are model scores,
   not calibrated probabilities or a guarantee of physical product identity.
3. Keep the normal business prompt and human-handoff tool decision for resolved
   designs. A requested single design is constrained to its approved product
   and one selected image. Explicit front/back or multi-design requests can
   retain their requested views. Whole-catalog browsing and all four saved
   delivery styles retain their existing behavior.
4. Use current saved product facts for photo details and model context. Unknown
   price, stock, COD, delivery and customization must remain unknown. A listing
   is not proof of stock, payment or order fulfillment.
5. Read only confirmed outbound photos from this workspace and customer aliases.
   Suppress exact photo URLs repeated within 15 minutes unless the customer
   explicitly asks for them again. No customer-specific reply cache is shared.
   Rapid separate image messages use the existing durable DM turn coordinator
   and all pending source images before a single reply.

The live comparison budget is five customer images and 120 reference photos per
turn, with a 25-second generation deadline. Over-budget/incomplete/unreadable
comparisons ask for a Style Number or clearer/smaller batch; they never assert a
unique match based on a partial gallery. Each saved product still supports ten
photos. Exact style resolution avoids vision calls but retains the ordinary
conversation model call so business rules are not bypassed.

## Verification

`test:connections` includes catalog recognition tests for screenshots, blur,
near-identical designs, invalid IDs, styles, post mappings, foreign products,
alternate views beyond the first six products, multiple customer images,
returning conversations, photo suppression, explicit resend and business handoff.
Automation tests exercise signed webhooks, same-burst images, scoped delivery
history, one-photo sends, typing ownership, quota and human takeover.

The existing protected `instagram-ai-check` endpoint accepts `action: catalog`
for synthetic provider tests. Drawn reference images, Instagram-like screenshot
layouts, an indistinct image and two-image inputs exercise the real Luna model.
This endpoint never sends Meta messages or writes customer/catalog records.
These synthetic checks do not replace a customer-by-customer production accuracy
assessment. Signed-in mobile visual QA is unavailable in the current browser.

Deploy the shared runtime to `instagram-live-webhook`,
`instagram-memory-worker` and `instagram-ai-check`, and deploy the website/API
from the same commit. Existing catalog documents remain backward compatible.
