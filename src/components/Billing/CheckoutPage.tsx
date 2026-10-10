import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { getPlanConfig } from "../../lib/planUsage";
import { usePlanCatalog } from "../../hooks/usePlanCatalog";
import {
  billingRequest,
  BillingConfiguration,
  BillingOrder,
} from "../../lib/billing";
import { PaymentSession, PaymentMethod } from "../../lib/cashfreeElements";
import {
  PaymentMethods,
  PaymentMethodPicker,
  EligibleMethod,
} from "./PaymentMethods";
import "./checkout.css";
type Stage = "plan" | "confirm" | "methods" | "pay" | "result";
const fmt = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
export const CheckoutPage: React.FC = () => {
  const { user, firebaseUser } = useApp();
  const [entry] = useState(() => new URLSearchParams(window.location.search));
  const [requested, setRequested] = useState(entry.get("plan") || "starter");
  const initialId = entry.get("order_id") || "";
  const receipt = entry.get("receipt") === "1";
  const catalog = usePlanCatalog();
  const [cfg, setCfg] = useState<BillingConfiguration | null>(null),
    [order, setOrder] = useState<BillingOrder | null>(null);
  const [session, setSession] = useState<PaymentSession>(),
    [stage, setStage] = useState<Stage>(initialId ? "result" : "plan");
  const [method, setMethod] = useState<PaymentMethod>(
    ["qr", "app", "netbanking", "card"].includes(entry.get("method") || "")
      ? (entry.get("method") as PaymentMethod)
      : "qr",
  );
  const [eligible, setEligible] = useState<EligibleMethod[]>([]),
    [quote, setQuote] = useState<number>();
  const [initializing, setInitializing] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [name, setName] = useState(user.name || ""),
    [email, setEmail] = useState(firebaseUser?.email || user.email || ""),
    [phone, setPhone] = useState(""),
    [agreed, setAgreed] = useState(false);
  const requestId = useRef(crypto.randomUUID()),
    lock = useRef(false),
    refreshing = useRef(false);
  const plan = getPlanConfig(order?.planId || requested, catalog.plans),
    days = order?.billingDays || plan.billingDays || 30;
  const available =
    catalog.synced &&
    catalog.plans.some((p) => p.id === requested && p.id !== "free");
  const paid = order?.status === "paid",
    active = paid && order.activationStatus === "active",
    test = paid && order.activationStatus === "test",
    expired = order?.status === "expired";
  const amount = order
    ? fmt(order.amount)
    : quote !== undefined
      ? fmt(quote)
      : plan.price;
  const blocked = Boolean(
    cfg?.appUrl && new URL(cfg.appUrl).origin !== window.location.origin,
  );
  const from = (p: any): PaymentSession | undefined =>
    p.paymentSessionId
      ? {
          paymentSessionId: p.paymentSessionId,
          mode: p.mode || p.order.environment,
          orderId: p.order.orderId,
          paymentExpiresAt: p.order.paymentExpiresAt,
        }
      : undefined;
  const accept = (p: any, initial = false) => {
    setOrder(p.order);
    if (initial) setRequested(p.order.planId);
    if (p.order.status === "paid" || p.order.status === "expired") {
      setSession(undefined);
      setStage("result");
    } else if (p.paymentSessionId) {
      setSession((previous) =>
        previous?.paymentSessionId === p.paymentSessionId &&
        previous.paymentExpiresAt === p.order.paymentExpiresAt
          ? previous
          : from(p),
      );
      setStage((previous) =>
        initial || previous === "result" ? "pay" : previous,
      );
    }
  };
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const c = await billingRequest("config");
        if (!live) return;
        setCfg(c);
        if (initialId) {
          const p = await billingRequest("status", undefined, initialId);
          if (live) {
            if (p.order.status === "pending") {
              const methods = await billingRequest("methods", {
                planId: p.order.planId,
              });
              if (live) setEligible(methods.methods);
            }
            if (live) accept(p, true);
          }
        }
      } catch (e: any) {
        if (live) setError(e.message);
      } finally {
        if (live) setInitializing(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [initialId]);
  const refresh = async () => {
    const id = order?.orderId || initialId;
    if (!id || refreshing.current) return;
    refreshing.current = true;
    try {
      const p = await billingRequest("status", undefined, id);
      accept(p);
      setError("");
      return p;
    } catch (e: any) {
      setError(
        e.message ||
          "Confirmation is delayed. We will keep checking; please do not pay again.",
      );
    } finally {
      refreshing.current = false;
    }
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (
      !order ||
      active ||
      test ||
      order.activationStatus === "review"
    )
      return;
    let live = true,
      timer: number;
    const poll = async () => {
      await refreshRef.current();
      if (live)
        timer = window.setTimeout(
          () => void poll(),
          document.hidden || expired ? 15000 : 4000,
        );
    };
    timer = window.setTimeout(() => void poll(), 4000);
    const focus = () => void refreshRef.current();
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [order?.orderId, active, test, expired, order?.activationStatus]);
  useEffect(() => {
    if (!active || receipt) return;
    const t = window.setTimeout(() => window.location.assign("/billing"), 4000);
    return () => clearTimeout(t);
  }, [active, receipt]);
  const loadMethods = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const p = await billingRequest("methods", {
        planId: order?.planId || requested,
      });
      setEligible(p.methods);
      setQuote(p.amount);
      if ((quote ?? Number(plan.price.replace(/[^0-9.]/g, ""))) !== p.amount) {
        setStage("confirm");
        setError(
          "The plan price has changed. Please review the updated total.",
        );
      } else setStage("methods");
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (session) {
        window.history.replaceState(
          null,
          "",
          "/billing/checkout?order_id=" +
            encodeURIComponent(session.orderId) +
            "&method=" +
            method,
        );
        setStage("pay");
        return;
      }
      const p = await billingRequest("create", {
        planId: requested,
        name,
        email,
        phone,
        requestId: requestId.current,
      });
      window.history.replaceState(
        null,
        "",
        "/billing/checkout?order_id=" +
          encodeURIComponent(p.order.orderId) +
          "&method=" +
          method,
      );
      accept(p);
      if (p.order.status === "pending" && p.paymentSessionId) setStage("pay");
      else if (p.order.status === "creating") {
        setStage("result");
        setError(
          "Your order is being prepared. We are checking its status before any retry.",
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const regenerate = async () => {
    if (lock.current || !order) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const p = await billingRequest("status", undefined, order.orderId);
      accept(p);
      if (p.order.status === "paid") return;
      const closed = await billingRequest("cancel", { orderId: order.orderId });
      if (closed.order.status !== "expired")
        throw new Error(
          "The previous payment is still being checked. Please wait.",
        );
      requestId.current = crypto.randomUUID();
      setOrder(null);
      setSession(undefined);
      window.history.replaceState(
        null,
        "",
        "/billing/checkout?plan=" + requested,
      );
      if (!/^[6-9]\d{9}$/.test(phone)) {
        setStage("confirm");
        return;
      }
      const next = await billingRequest("create", {
        planId: requested,
        name,
        email,
        phone,
        requestId: requestId.current,
      });
      window.history.replaceState(
        null,
        "",
        "/billing/checkout?order_id=" +
          encodeURIComponent(next.order.orderId) +
          "&method=" +
          method,
      );
      accept(next);
      if (next.order.status === "pending" && next.paymentSessionId)
        setStage("pay");
    } catch (e: any) {
      await refreshRef.current();
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const changeMethod = async () => {
    const p = await refresh();
    if (p && p.order.status !== "paid" && p.order.status !== "expired")
      await loadMethods();
  };
  const features = [
    `${plan.messages.toLocaleString("en-IN")} standard replies / calendar month`,
    `${plan.ai.toLocaleString("en-IN")} AI replies / calendar month`,
    `${plan.accounts} Instagram ${plan.accounts === 1 ? "account" : "accounts"}`,
    plan.automations === null
      ? "Unlimited automations"
      : `${plan.automations} automations`,
  ];
  const step =
    stage === "plan" ? 0 : stage === "confirm" ? 1 : stage === "result" ? 3 : 2;
  const heading =
    stage === "plan"
      ? "A little more possibility."
      : stage === "confirm"
        ? "Review your order"
        : stage === "methods"
          ? "How would you like to pay?"
          : stage === "pay"
            ? method === "qr"
              ? "Scan. Pay. You’re ready."
              : "Complete your payment"
            : active
              ? "Congratulations! Your plan is active."
              : test
                ? "Test payment complete."
                : paid
                  ? "Activating your plan…"
                  : expired
                    ? "Payment session expired"
                    : "Checking your payment…";
  return (
    <div className="ar-checkout">
      <header className="ar-checkout-nav">
        <a className="ar-back" href="/billing">
          <ArrowLeft size={16} />
          <span>Back to billing</span>
        </a>
        <a href="/billing" className="ar-brand">
          <span>
            <MessageCircle size={19} />
          </span>
          Auto Replies
        </a>
        <span className="ar-secure">
          <LockKeyhole size={13} />
          Secure checkout
        </span>
      </header>
      <main className="ar-checkout-shell">
        <ol className="ar-steps" aria-label="Checkout progress">
          {["Plan", "Order", "Payment", "Done"].map((label, i) => (
            <li
              key={label}
              className={i === step ? "current" : i < step ? "complete" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              <span>{i < step ? <Check size={12} /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="ar-checkout-title">
          <span className="ar-eyebrow">
            {stage === "result" ? "YOUR SUBSCRIPTION" : "AUTO REPLIES CHECKOUT"}
          </span>
          <h1>{heading}</h1>
          <p>
            {stage === "plan"
              ? "More room for conversations that matter."
              : stage === "confirm"
                ? "One payment. A clear total. No automatic renewal."
                : stage === "methods"
                  ? "Choose a secure payment option to continue."
                  : stage === "pay"
                    ? "Your plan activates after verified payment confirmation."
                    : active
                      ? "Your workspace is ready for its next chapter."
                      : paid
                        ? "Payment received. Please do not pay again."
                        : "We verify every payment before updating your plan."}
          </p>
        </div>
        {cfg?.mode === "sandbox" && (
          <div className="ar-notice">
            Sandbox checkout · Test payments do not activate a live plan.
          </div>
        )}
        {error && (
          <div className="ar-alert" role="alert">
            {error}
          </div>
        )}
        {initializing ? (
          <section className="ar-checkout-card ar-loading">
            <Loader2 className="animate-spin" />
            <p>Loading your checkout…</p>
          </section>
        ) : stage === "plan" ? (
          <section className="ar-checkout-card">
            <div className="ar-plan-heading">
              <div>
                <span className="ar-eyebrow">YOUR SELECTED PLAN</span>
                <h2>{plan.name}</h2>
              </div>
              <a href="/billing#plans" className="ar-text-link">
                Change plan
              </a>
            </div>
            <div className="ar-price">
              {plan.price}
              <span>/ {days} days</span>
            </div>
            <p className="ar-note">
              {plan.name === "Starter"
                ? "Everything you need to build your first customer journeys."
                : plan.name === "Pro"
                  ? "Room to grow your conversations with smarter automation."
                  : "Greater capacity for a growing team and multiple accounts."}
            </p>
            <ul className="ar-features">
              {features.map((f) => (
                <li key={f}>
                  <span>
                    <Check size={14} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <details className="ar-details">
              <summary>View all features</summary>
              <p>
                DM, comment and story reply automation. Standard replies and AI
                replies have independent monthly allowances. Access lasts {days}{" "}
                days from successful activation.
              </p>
            </details>
            <button
              className="ar-primary ar-full"
              disabled={!available || !cfg?.configured || blocked}
              onClick={() => {
                setError("");
                setStage("confirm");
              }}
            >
              Continue
              <ArrowRight size={17} />
            </button>
            {(!cfg?.configured || blocked) && (
              <p className="ar-note">
                {blocked
                  ? "Continue on the official website to make a payment."
                  : "Payments are currently unavailable. Please try again later."}
              </p>
            )}
          </section>
        ) : stage === "confirm" ? (
          <section className="ar-checkout-card">
            <div className="ar-plan-heading">
              <h2>Order summary</h2>
              <button className="ar-text-link" onClick={() => setStage("plan")}>
                Back to plan
              </button>
            </div>
            <dl className="ar-order-lines">
              <div>
                <dt>Plan</dt>
                <dd>{plan.name}</dd>
              </div>
              <div>
                <dt>Billing period</dt>
                <dd>One-time · {days} days</dd>
              </div>
              <div>
                <dt>Membership</dt>
                <dd>{days} days of access</dd>
              </div>
              <div>
                <dt>Plan amount</dt>
                <dd>{amount}</dd>
              </div>
            </dl>
            <div className="ar-total">
              <span>
                Total payable{" "}
                <small>INR · No additional checkout charges</small>
              </span>
              <strong>{amount}</strong>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadMethods();
              }}
            >
              <div className="ar-billing-details">
                <h3>Receipt details</h3>
                <p className="ar-note">
                  Use your account details for the payment receipt.
                </p>
                <label className="ar-label">
                  Name
                  <input
                    className="ar-input"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    readOnly={Boolean(user.name && user.name.length >= 2)}
                  />
                </label>
                <label className="ar-label">
                  Email
                  <input
                    className="ar-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={Boolean(firebaseUser?.email || user.email)}
                  />
                </label>
                <label className="ar-label">
                  Mobile number
                  <input
                    className="ar-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="10-digit Indian mobile number"
                    required
                    pattern="[6-9][0-9]{9}"
                    maxLength={10}
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, ""))
                    }
                  />
                </label>
                <p className="ar-note">
                  Cashfree needs your mobile number to process the payment.
                </p>
              </div>
              <label className="ar-agreement">
                <input
                  type="checkbox"
                  checked={agreed}
                  required
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noreferrer">
                    terms
                  </a>{" "}
                  and{" "}
                  <a href="/refunds" target="_blank" rel="noreferrer">
                    refund policy
                  </a>
                  .
                </span>
              </label>
              <button
                type="submit"
                className="ar-primary ar-full"
                disabled={busy}
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : null}
                Choose payment method
                <ArrowRight size={17} />
              </button>
            </form>
          </section>
        ) : stage === "methods" ? (
          <section className="ar-checkout-card">
            <div className="ar-mini-summary">
              <span>
                {plan.name} <small>{days} days</small>
              </span>
              <strong>{amount}</strong>
            </div>
            <PaymentMethodPicker
              eligible={eligible}
              method={method}
              onChange={setMethod}
              busy={busy}
              onContinue={() => void start()}
            />
            <button
              className="ar-text-link ar-centered"
              disabled={busy}
              onClick={() => {
                setError("");
                setStage("confirm");
              }}
            >
              Back to order summary
            </button>
          </section>
        ) : stage === "pay" && session ? (
          <PaymentMethods
            method={method}
            eligible={eligible}
            existingSession={session}
            prepare={async () => session}
            check={async () => {
              await refresh();
            }}
            restart={regenerate}
            changeMethod={() => void changeMethod()}
            returnUrl={
              window.location.origin +
              "/billing/checkout?order_id=" +
              encodeURIComponent(session.orderId) +
              "&method=" +
              method
            }
            amount={amount}
            merchant={cfg?.business?.legalName || "Auto Replies"}
          />
        ) : (
          <section className="ar-checkout-card ar-result">
            {active ? (
              <>
                <div className="ar-success-mark">
                  <Check size={38} />
                </div>
                {!receipt && (
                  <div className="ar-confetti" aria-hidden="true">
                    {Array.from({ length: 18 }, (_, i) => (
                      <i key={i} style={{ "--i": i } as React.CSSProperties} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ar-result-icon">
                {paid || !expired ? (
                  <Loader2 size={32} className="animate-spin" />
                ) : (
                  <ReceiptText size={32} />
                )}
              </div>
            )}
            <h2>
              {active
                ? plan.name + " is ready."
                : test
                  ? "Sandbox payment verified"
                  : paid
                    ? order.activationStatus === "review"
                      ? "Payment received — activation needs review"
                      : "Activating your plan…"
                    : expired
                      ? "This QR is no longer available"
                      : "Waiting for payment confirmation"}
            </h2>
            {paid ? (
              <>
                <dl className="ar-order-lines">
                  <div>
                    <dt>Plan</dt>
                    <dd>{plan.name}</dd>
                  </div>
                  <div>
                    <dt>Payment received</dt>
                    <dd>{amount}</dd>
                  </div>
                  <div>
                    <dt>Membership</dt>
                    <dd>
                      {days} days
                      {order.expiresAt
                        ? " · Until " + date(order.expiresAt)
                        : ""}
                    </dd>
                  </div>
                  {receipt && (
                    <>
                      <div>
                        <dt>Order reference</dt>
                        <dd className="ar-reference">{order.orderId}</dd>
                      </div>
                      <div>
                        <dt>Payment reference</dt>
                        <dd>{order.paymentId || "Verified payment"}</dd>
                      </div>
                      <div>
                        <dt>Payment date</dt>
                        <dd>{date(order.paidAt)}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {test && (
                  <p className="ar-note">
                    This was a test payment. Your live subscription has not
                    changed.
                  </p>
                )}
                {order.activationStatus === "review" && (
                  <p className="ar-note">
                    Contact support to activate this confirmed payment. Please
                    do not pay again.
                  </p>
                )}
                <a href="/billing" className="ar-primary ar-full">
                  Back to billing
                  <ArrowRight size={17} />
                </a>
                {!receipt && (
                  <a
                    className="ar-text-link ar-centered"
                    href={
                      "/billing/checkout?order_id=" +
                      encodeURIComponent(order.orderId) +
                      "&receipt=1"
                    }
                  >
                    View receipt
                  </a>
                )}
                {active && !receipt && (
                  <p className="ar-note">
                    Returning to billing in about 4 seconds…
                  </p>
                )}
              </>
            ) : expired ? (
              <>
                <p className="ar-note">
                  We check the previous payment before allowing a new QR.
                </p>
                <button
                  className="ar-primary ar-full"
                  disabled={busy}
                  onClick={() => void regenerate()}
                >
                  {busy ? "Checking previous payment…" : "Generate new QR"}
                </button>
              </>
            ) : (
              <>
                <p className="ar-note">
                  Confirmation can take a little longer. We are checking
                  automatically. Please do not pay again.
                </p>
                <button className="ar-text-link" onClick={() => void refresh()}>
                  Check status
                </button>
              </>
            )}
          </section>
        )}
        <footer className="ar-security-foot">
          <ShieldCheck size={15} />
          Secure payments by Cashfree<span>•</span>No automatic renewal
        </footer>
        <div className="ar-footer-links">
          <a href="/contact">Need help?</a>
          <a href="/privacy">Privacy</a>
          <a href="/refunds">Refunds</a>
        </div>
      </main>
    </div>
  );
};
