import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Headphones,
  Instagram,
  Loader2,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Zap,
  Bot,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { getPlanConfig } from "../../lib/planUsage";
import { usePlanCatalog } from "../../hooks/usePlanCatalog";
import {
  billingRequest,
  BillingConfiguration,
  BillingOrder,
} from "../../lib/billing";
import { PaymentSession } from "../../lib/cashfreeElements";
import { PaymentMethods } from "./PaymentMethods";
import "./checkout.css";
const fmt = (value: number) => Number(value || 0).toLocaleString("en-IN");
export const CheckoutPage: React.FC = () => {
  const { user, firebaseUser, setActiveTab } = useApp();
  // Capture the entry URL once. Remembering an order must not restart initialization
  // or cancel the SDK's payment promise halfway through the checkout.
  const [entry] = useState(() => new URLSearchParams(window.location.search));
  const requested = entry.get("plan") || "starter",
    initialOrderId = entry.get("order_id") || "";
  const catalog = usePlanCatalog();
  const [cfg, setCfg] = useState<BillingConfiguration | null>(null),
    [order, setOrder] = useState<BillingOrder | null>(null);
  const [session, setSession] = useState<PaymentSession | undefined>(),
    [stage, setStage] = useState<"details" | "payment" | "result">(
      initialOrderId ? "result" : "details",
    );
  const [initializing, setInitializing] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [name, setName] = useState(user.name || ""),
    [email, setEmail] = useState(firebaseUser?.email || user.email || ""),
    [phone, setPhone] = useState(""),
    [agreed, setAgreed] = useState(false);
  const requestId = useRef(crypto.randomUUID()),
    refreshing = useRef(false),
    prepareLock = useRef(false);
  const plan = getPlanConfig(order?.planId || requested, catalog.plans);
  const planAvailable =
    catalog.synced &&
    catalog.plans.some((p) => p.id === requested && p.id !== "free");
  const paid = order?.status === "paid",
    active = paid && order.activationStatus === "active",
    test = paid && order.activationStatus === "test",
    expired = order?.status === "expired";
  const otherDomain = Boolean(
    cfg?.appUrl && new URL(cfg.appUrl).origin !== window.location.origin,
  );
  const amount = order ? "₹" + fmt(order.amount) : plan.price;
  const sessionFrom = (p: any): PaymentSession | undefined =>
    p.paymentSessionId
      ? {
          paymentSessionId: p.paymentSessionId,
          mode: p.mode || p.order.environment,
          orderId: p.order.orderId,
          paymentExpiresAt: p.order.paymentExpiresAt,
        }
      : undefined;
  const acceptStatus = (p: any) => {
    setOrder(p.order);
    if (p.order.status === "paid" || p.order.status === "expired") {
      setStage("result");
      setSession(undefined);
    } else {
      setSession(sessionFrom(p));
      if (p.paymentSessionId) setStage("payment");
    }
  };
  const remember = (o: BillingOrder) => {
    window.history.replaceState(
      null,
      "",
      "/billing/checkout?order_id=" + encodeURIComponent(o.orderId),
    );
    setOrder(o);
  };
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const config = await billingRequest("config");
        if (!live) return;
        setCfg(config);
        if (initialOrderId) {
          const status = await billingRequest(
            "status",
            undefined,
            initialOrderId,
          );
          if (live) acceptStatus(status);
        }
      } catch (e: any) {
        if (live) setError(e.message || "Could not load checkout.");
      } finally {
        if (live) setInitializing(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [initialOrderId]);
  const refresh = async () => {
    const id = order?.orderId || initialOrderId;
    if (!id || refreshing.current) return;
    refreshing.current = true;
    try {
      acceptStatus(await billingRequest("status", undefined, id));
      setError("");
    } catch (e: any) {
      setError(
        e.message || "Payment confirmation is delayed. Please check again.",
      );
    } finally {
      refreshing.current = false;
    }
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!order || paid || expired) return;
    let live = true;
    let timer: number;
    const poll = async () => {
      await refreshRef.current();
      if (live)
        timer = window.setTimeout(
          () => void poll(),
          document.hidden ? 15000 : 4000,
        );
    };
    timer = window.setTimeout(() => void poll(), 4000);
    const focus = () => void refreshRef.current();
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [order?.orderId, paid, expired]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(
      () => window.location.assign("/billing"),
      2500,
    );
    return () => window.clearTimeout(timer);
  }, [active]);
  const prepare = async (): Promise<PaymentSession | null> => {
    if (prepareLock.current)
      throw new Error("Your payment is already being prepared.");
    if (session) return session;
    if (!cfg?.configured || !planAvailable || !agreed || otherDomain)
      throw new Error("Review your billing details before starting payment.");
    prepareLock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await billingRequest("create", {
        planId: requested,
        name,
        email,
        phone,
        requestId: requestId.current,
      });
      remember(response.order);
      if (["paid", "expired"].includes(response.order.status)) {
        acceptStatus(response);
        return null;
      }
      const next = sessionFrom(response);
      if (!next)
        throw new Error(
          "Your order is being prepared. Check payment status before retrying.",
        );
      setSession(next);
      return next;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      prepareLock.current = false;
      setBusy(false);
    }
  };
  const cancel = async (o: BillingOrder) => {
    if (busy) throw new Error("Please wait for the current payment request.");
    setBusy(true);
    setError("");
    try {
      await billingRequest("cancel", { orderId: o.orderId });
      requestId.current = crypto.randomUUID();
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const restart = async () => {
    if (!order) return;
    await cancel(order);
    window.location.assign(
      "/billing/checkout?plan=" + encodeURIComponent(order.planId),
    );
  };
  const heading = active
    ? "Your plan is active."
    : test
      ? "Test payment complete."
      : paid
        ? "Payment received."
        : expired
          ? "Your checkout expired."
          : stage === "result"
            ? "Confirming your payment."
            : stage === "payment"
              ? "Complete your payment"
              : "Review your subscription";
  const included = [
    {
      Icon: MessageCircle,
      label: "Standard replies",
      value: fmt(plan.messages),
      note: "DM, comment & story automation",
    },
    {
      Icon: Bot,
      label: "AI replies",
      value: fmt(plan.ai),
      note: "A separate AI reply allowance",
    },
    {
      Icon: Instagram,
      label: "Instagram accounts",
      value: String(plan.accounts),
      note: "Connected professional accounts",
    },
    {
      Icon: Zap,
      label: "Automations",
      value: plan.automations === null ? "Unlimited" : fmt(plan.automations),
      note: "Build your customer journeys",
    },
  ];
  return (
    <div className={"ar-checkout ar-stage-" + stage}>
      <div className="ar-checkout-shell">
        <header className="ar-checkout-nav">
          <button onClick={() => setActiveTab("billing")} className="ar-back">
            <ArrowLeft size={17} />
            Back to billing
          </button>
          <span className="ar-brand">
            <span>
              <MessageCircle size={20} />
            </span>
            Auto Replies
          </span>
          <span className="ar-secure">
            <LockKeyhole size={14} />
            Secure checkout
          </span>
        </header>
        <div className="ar-checkout-title">
          <span className="ar-eyebrow">SUBSCRIPTION CHECKOUT</span>
          <h1>{heading}</h1>
          <p>
            {stage === "details"
              ? "Confirm your plan and receipt details before payment."
              : stage === "payment"
                ? "Pay securely with UPI, your bank or a card."
                : "Your payment and plan details, all in one place."}
          </p>
        </div>
        <ol className="ar-steps" aria-label="Checkout progress">
          {["Plan & details", "Payment", "Activation"].map((label, i) => {
            const current =
              stage === "details" ? 0 : stage === "payment" ? 1 : 2;
            return (
              <li
                key={label}
                aria-current={i === current ? "step" : undefined}
                className={
                  i === current ? "current" : i < current ? "complete" : ""
                }
              >
                <span>{i < current ? <Check size={14} /> : i + 1}</span>
                {label}
              </li>
            );
          })}
        </ol>
        {cfg?.mode === "sandbox" && (
          <div className="ar-notice">
            Test environment: sandbox payments do not activate live
            subscriptions.
          </div>
        )}
        {error && (
          <div className="ar-alert" role="alert">
            <TriangleAlert size={18} />
            {error}
          </div>
        )}
        <div className="ar-checkout-grid">
          <main className="ar-checkout-main">
            {initializing ? (
              <section className="ar-checkout-card ar-loading">
                <Loader2 className="animate-spin" />
                <p>Preparing your checkout…</p>
              </section>
            ) : stage === "details" ? (
              <section className="ar-checkout-card">
                <div className="ar-section-heading">
                  <span className="ar-eyebrow">YOUR SUBSCRIPTION</span>
                  <h2>Choose your plan</h2>
                  <p>Choose the capacity your business needs.</p>
                </div>
                <div className="ar-plan-choices">
                  {catalog.plans
                    .filter((p) => p.id !== "free")
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={requested === p.id}
                        className={
                          "ar-plan-choice " +
                          (requested === p.id ? "selected" : "")
                        }
                        onClick={() => {
                          if (requested !== p.id)
                            window.location.assign(
                              "/billing/checkout?plan=" +
                                encodeURIComponent(p.id),
                            );
                        }}
                      >
                        <span>
                          {p.name}
                          {requested === p.id && <Check size={14} />}
                        </span>
                        <strong>{p.price}</strong>
                        <small>for {p.billingDays || 30} days</small>
                      </button>
                    ))}
                </div>
                <div className="ar-form-heading">
                  <ReceiptText size={20} />
                  <div>
                    <h3>Billing information</h3>
                    <p>Used for your payment receipt.</p>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      planAvailable &&
                      cfg?.configured &&
                      agreed &&
                      !otherDomain
                    )
                      setStage("payment");
                  }}
                  className="ar-checkout-form"
                >
                  <label className="ar-label">
                    Full name
                    <input
                      className="ar-input"
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                    />
                  </label>
                  <label className="ar-label">
                    Email address
                    <input
                      className="ar-input"
                      required
                      type="email"
                      maxLength={200}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="ar-label">
                    Mobile number
                    <div className="ar-phone-input">
                      <span>+91</span>
                      <input
                        required
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        pattern="[6-9][0-9]{9}"
                        maxLength={10}
                        value={phone}
                        onChange={(e) =>
                          setPhone(
                            e.target.value.replace(/\D/g, "").slice(0, 10),
                          )
                        }
                        placeholder="10-digit mobile number"
                      />
                    </div>
                  </label>
                  <label className="ar-agreement">
                    <input
                      required
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                      I agree to the{" "}
                      <a href="/terms" target="_blank" rel="noreferrer">
                        Terms
                      </a>
                      ,{" "}
                      <a href="/privacy" target="_blank" rel="noreferrer">
                        Privacy Policy
                      </a>{" "}
                      and{" "}
                      <a href="/refunds" target="_blank" rel="noreferrer">
                        Refund Policy
                      </a>
                      . This is a one-time payment with no automatic renewal.
                    </span>
                  </label>
                  {otherDomain && (
                    <div className="ar-notice">
                      Please continue from{" "}
                      <a
                        href={
                          cfg!.appUrl +
                          "/billing/checkout?plan=" +
                          encodeURIComponent(requested)
                        }
                      >
                        your payment domain
                      </a>
                      .
                    </div>
                  )}
                  <button
                    className="ar-primary ar-full"
                    disabled={
                      !agreed ||
                      !planAvailable ||
                      !cfg?.configured ||
                      otherDomain
                    }
                  >
                    Continue to payment
                    <ArrowRight size={17} />
                  </button>
                  {!catalog.synced && (
                    <p className="ar-note">
                      {catalog.error || "Confirming live plan prices…"}
                    </p>
                  )}
                  {catalog.synced && !planAvailable && (
                    <p className="ar-note">
                      Select an available paid plan above.
                    </p>
                  )}
                  {!cfg?.configured && (
                    <p className="ar-note">
                      Payments are temporarily unavailable. Please try again
                      later.
                    </p>
                  )}
                  <p className="ar-form-foot">
                    <LockKeyhole size={13} />
                    Encrypted payment · No automatic charges
                  </p>
                </form>
              </section>
            ) : stage === "payment" ? (
              <>
                <PaymentMethods
                  prepare={prepare}
                  check={refresh}
                  restart={restart}
                  existingSession={session}
                  returnUrl={
                    (cfg?.appUrl || window.location.origin) +
                    "/billing/checkout?order_id=" +
                    encodeURIComponent(order?.orderId || "")
                  }
                  amount={amount}
                />
                {!order && (
                  <button
                    className="ar-edit-details"
                    onClick={() => setStage("details")}
                  >
                    <ArrowLeft size={14} />
                    Edit billing details
                  </button>
                )}
              </>
            ) : (
              <section className="ar-checkout-card ar-result">
                <div
                  className={
                    "ar-result-icon " +
                    (paid ? "success" : expired ? "expired" : "")
                  }
                >
                  {paid ? (
                    <CheckCircle2 size={38} />
                  ) : expired ? (
                    <Clock3 size={38} />
                  ) : (
                    <Loader2 className="animate-spin" size={38} />
                  )}
                </div>
                <span className="ar-eyebrow">
                  {active
                    ? "PAYMENT SUCCESSFUL"
                    : paid
                      ? "PAYMENT CONFIRMED"
                      : "PAYMENT STATUS"}
                </span>
                <h2>{heading}</h2>
                <p>
                  {active
                    ? "Your " +
                      plan.name +
                      " plan is ready. Returning to your billing dashboard…"
                    : test
                      ? "Your test payment was confirmed. Live subscriptions are unchanged."
                      : paid
                        ? "Your payment is confirmed and is being reviewed. Please contact support."
                        : expired
                          ? "This session can no longer accept payment. Start a fresh checkout when you’re ready."
                          : "We’re checking your payment securely. This page updates automatically."}
                </p>
                {order && (
                  <div className="ar-receipt">
                    <span>{paid ? "Amount paid" : "Order amount"}</span>
                    <strong>{amount}</strong>
                    <span>Plan</span>
                    <strong>
                      {plan.name} · {plan.billingDays || 30} days
                    </strong>
                    <span>Order reference</span>
                    <small>{order.orderId}</small>
                  </div>
                )}
                {!paid && !expired && (
                  <button
                    className="ar-primary ar-full"
                    onClick={() => void refresh()}
                  >
                    <RefreshIcon />
                    Check payment status
                  </button>
                )}
                {expired && (
                  <button
                    className="ar-primary ar-full"
                    onClick={() =>
                      window.location.assign(
                        "/billing/checkout?plan=" + encodeURIComponent(plan.id),
                      )
                    }
                  >
                    Start a new checkout
                    <ArrowRight size={17} />
                  </button>
                )}
                <button
                  className="ar-secondary ar-full"
                  onClick={() => {
                    if (active) window.location.assign("/billing");
                    else setActiveTab("billing");
                  }}
                >
                  Back to billing
                  <ArrowRight size={17} />
                </button>
              </section>
            )}
          </main>
          <aside className="ar-order-summary">
            <section className="ar-summary-card">
              <div className="ar-summary-head">
                <div className="ar-summary-mark">
                  <Sparkles size={24} />
                </div>
                <span className="ar-eyebrow">YOUR PLAN</span>
                <h2>{plan.name}</h2>
                <p>Subscription access for {plan.billingDays || 30} days</p>
                <div className="ar-summary-price">
                  {amount}
                  <span>/ {plan.billingDays || 30} days</span>
                </div>
                <div className="ar-summary-badge">
                  <Check size={13} />
                  One-time payment
                </div>
              </div>
              <div className="ar-summary-body">
                <h3>Included in your plan</h3>
                {included.map(({ Icon, label, value, note }) => (
                  <div className="ar-included" key={label}>
                    <span>
                      <Icon size={18} />
                    </span>
                    <div>
                      <strong>
                        {value} {label.toLowerCase()}
                      </strong>
                      <small>{note}</small>
                    </div>
                    <Check size={15} />
                  </div>
                ))}
                <div className="ar-summary-total">
                  <span>Total due today</span>
                  <strong>
                    {amount}
                    <small> INR</small>
                  </strong>
                </div>
                <p className="ar-summary-note">
                  Your plan activates after payment confirmation. Standard and
                  AI reply allowances are counted separately.
                </p>
              </div>
            </section>
            <div className="ar-trust">
              <ShieldCheck size={20} />
              <div>
                <strong>Protected by Cashfree</strong>
                <p>
                  Your payment details are encrypted and processed securely.
                </p>
              </div>
            </div>
            <a className="ar-support" href="/contact">
              <Headphones size={16} />
              Need a hand? Contact support
              <ArrowRight size={14} />
            </a>
          </aside>
        </div>
        <footer className="ar-checkout-footer">
          <span>© {new Date().getFullYear()} Auto Replies</span>
          <nav>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/refunds">Refunds</a>
          </nav>
        </footer>
      </div>
    </div>
  );
};
const RefreshIcon = () => <ReceiptText size={16} />;
