import React, { useEffect, useState } from "react";
import { billingRequest, BillingOrder } from "../../lib/billing";
export function paymentLabel(o: BillingOrder) {
  if (o.status === "paid")
    return o.activationStatus === "active"
      ? "Paid · active"
      : o.activationStatus === "test"
        ? "Test confirmed"
        : o.activationStatus === "review"
          ? "Paid · needs review"
          : "Paid · activating";
  if (o.checkoutState === "superseded") return "Closed · plan changed";
  if (o.checkoutState === "closed") return "Checkout closed";
  if (
    o.status === "expired" ||
    o.checkoutState === "expired" ||
    (o.paymentExpiresAt && Date.parse(o.paymentExpiresAt) <= Date.now())
  )
    return "Payment window expired";
  if (
    ["TERMINATION_REQUESTED", "TERMINATION_REQ"].includes(
      o.providerStatus || "",
    )
  )
    return "Checkout closing";
  if (o.lastAttempt === "PENDING") return "Bank confirmation pending";
  if (["FAILED", "USER_DROPPED", "CANCELLED"].includes(o.lastAttempt || ""))
    return o.lastAttempt === "FAILED" ? "Failed attempt" : "Cancelled attempt";
  return o.status === "creating" ? "Preparing checkout" : "Awaiting payment";
}
export const BillingHistory: React.FC = () => {
  const [orders, setOrders] = useState<BillingOrder[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true,
      fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const p = await billingRequest("history");
        if (live) {
          setOrders(p.orders);
          setError("");
        }
      } catch (e: any) {
        if (live) setError(e.message);
      } finally {
        fetching = false;
        if (live) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <div
      className="mt-5 overflow-x-auto rounded-xl border border-slate-200"
      tabIndex={0}
      role="region"
      aria-label="Billing history table"
    >
      <table className="billing-comparison w-full text-left text-sm">
        <caption className="sr-only">
          Verified payment and checkout history
        </caption>
        <thead>
          <tr>
            {["Date", "Description", "Amount", "Status", "Details"].map((x) => (
              <th key={x} scope="col">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading || (!orders.length && error) || !orders.length ? (
            <tr>
              <td colSpan={5} className="text-center">
                {loading
                  ? "Loading payment history…"
                  : error ||
                    "No payments yet. Your payment records will appear here."}
              </td>
            </tr>
          ) : (
            orders.map((o) => (
              <tr key={o.orderId}>
                <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="capitalize">
                  {o.planId} plan
                  {o.environment === "sandbox" && (
                    <small className="ml-2 text-amber-700">Test</small>
                  )}
                </td>
                <td>₹{o.amount.toLocaleString("en-IN")}</td>
                <td>
                  <span
                    className={
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                      (o.status === "paid"
                        ? o.activationStatus === "review"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-emerald-50 text-emerald-800"
                        : "bg-slate-100 text-slate-700")
                    }
                  >
                    {paymentLabel(o)}
                  </span>
                </td>
                <td>
                  <a
                    className="font-semibold text-indigo-600"
                    href={
                      "/billing/checkout?order_id=" +
                      encodeURIComponent(o.orderId) +
                      (o.status === "paid" ? "&receipt=1" : "")
                    }
                  >
                    {o.status === "paid" ? "View receipt" : "View details"}
                  </a>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {error && orders.length > 0 && (
        <p className="p-3 text-sm text-amber-800" role="status">
          History refresh is delayed. Showing the last saved records.
        </p>
      )}
    </div>
  );
};
