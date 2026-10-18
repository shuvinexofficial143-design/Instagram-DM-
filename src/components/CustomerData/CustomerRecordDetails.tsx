import React from "react";
import { Clock3, Instagram, ShoppingBag, UserRound, X } from "lucide-react";
import { CustomerRecord, customerDisplayName } from "../../lib/customerData";
export const formatCustomerTime = (text?: string | null) => {
  if (!text) return "Not recorded";
  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
};
export function CustomerRecordDetails({
  record,
  fields,
  onClose,
}: {
  record: CustomerRecord;
  fields: string[];
  onClose: () => void;
}) {
  const r = record;
  return (
    <section className="cd-customer-detail" aria-label="Customer details">
      <header className="cd-detail-title">
        <div>
          <span className="cd-kicker">CUSTOMER PROFILE</span>
          <h3>{customerDisplayName(r)}</h3>
        </div>
        <button
          className="cd-icon-button"
          type="button"
          aria-label="Close customer details"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="cd-detail-grid">
        <section>
          <h4>
            <UserRound size={16} />
            Customer information
          </h4>
          <dl>
            {fields.map((field) => (
              <div key={field}>
                <dt>{field}</dt>
                <dd>{r.data?.[field] || "Not shared yet"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h4>
            <Instagram size={16} />
            Instagram source
          </h4>
          <dl>
            <div>
              <dt>Customer username</dt>
              <dd>
                {r.username && r.username !== r.customer_key
                  ? "@" + r.username
                  : "Username unavailable"}
              </dd>
            </div>
            <div>
              <dt>Customer Instagram ID</dt>
              <dd>{r.instagram_id || r.customer_key}</dd>
            </div>
            <div>
              <dt>Business account</dt>
              <dd>
                {r.source_instagram_username
                  ? "@" + r.source_instagram_username
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Business Instagram ID</dt>
              <dd>{r.source_instagram_id || "Not recorded"}</dd>
            </div>
          </dl>
        </section>
        <section className="cd-timeline-section">
          <h4>
            <Clock3 size={16} />
            Customer timeline
          </h4>
          <ol className="cd-timeline">
            <li>
              <i />
              <div>
                <strong>First message</strong>
                <time>
                  {formatCustomerTime(r.first_seen_at || r.created_at)}
                </time>
              </div>
            </li>
            <li>
              <i />
              <div>
                <strong>Latest message</strong>
                <time>
                  {formatCustomerTime(r.last_seen_at || r.updated_at)}
                </time>
              </div>
            </li>
            <li className={r.purchase_reported_at ? "has-purchase" : ""}>
              <i />
              <div>
                <strong>
                  <ShoppingBag size={13} />
                  Purchase reported
                </strong>
                <time>
                  {r.purchase_reported_at
                    ? formatCustomerTime(r.purchase_reported_at)
                    : "No purchase reported"}
                </time>
                {r.purchase_product && <span>{r.purchase_product}</span>}
              </div>
            </li>
          </ol>
          <p className="cd-fine-print">
            Purchase time records when the customer said they had bought or
            paid. A message alone does not verify payment.
          </p>
        </section>
      </div>
    </section>
  );
}
