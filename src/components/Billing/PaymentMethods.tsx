import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  getCashfreeElements,
  mountPaymentElement,
  payWithElement,
  PaymentElement,
  PaymentMethod,
  PaymentSession,
} from "../../lib/cashfreeElements";
import "./checkout.css";
const BANKS = [
  ["HDFCR", "HDFC Bank"],
  ["SBINR", "State Bank of India"],
  ["ICICR", "ICICI Bank"],
  ["UTIBR", "Axis Bank"],
  ["KKBKR", "Kotak Mahindra Bank"],
  ["PUNBR", "Punjab National Bank"],
  ["CNRBR", "Canara Bank"],
  ["UBINR", "Union Bank of India"],
  ["BARBR", "Bank of Baroda"],
  ["IDFBR", "IDFC FIRST Bank"],
  ["YESBR", "Yes Bank"],
  ["BKIDR", "Bank of India"],
  ["MAHBR", "Bank of Maharashtra"],
  ["IBKLR", "IDBI Bank"],
  ["INDBR", "IndusInd Bank"],
  ["FDRLR", "Federal Bank"],
  ["CBINR", "Central Bank of India"],
  ["IDIBR", "Indian Bank"],
  ["IOBAR", "Indian Overseas Bank"],
  ["RATNR", "RBL Bank"],
  ["SIBLR", "South Indian Bank"],
  ["KARBR", "Karnataka Bank"],
  ["KVBLR", "Karur Vysya Bank"],
  ["UCBAR", "UCO Bank"],
];
export type EligibleMethod = {
  type: string;
  banks: { name: string; nick: string }[];
};
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const availableBanks = (eligible: EligibleMethod[]) => {
  const net = eligible.find((m) => m.type === "netbanking");
  return BANKS.filter(([id, name]) =>
    net?.banks.some(
      (b) =>
        normalize(b.name) === normalize(name) ||
        normalize(b.nick) === normalize(name) ||
        b.nick === id,
    ),
  );
};
export function PaymentMethodPicker({
  eligible,
  method,
  onChange,
  onContinue,
  busy,
}: {
  eligible: EligibleMethod[];
  method: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  onContinue: () => void;
  busy: boolean;
}) {
  const mobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad/i.test(navigator.userAgent);
  const upi = eligible.some((m) => m.type === "upi");
  const choices = [
    ...(upi
      ? [
          {
            id: "qr" as const,
            Icon: QrCode,
            name: "UPI QR",
            note: "Scan with any UPI app",
          },
          ...(mobile
            ? [
                {
                  id: "app" as const,
                  Icon: Smartphone,
                  name: "UPI app",
                  note: "Open your UPI app on this device",
                },
              ]
            : []),
        ]
      : []),
    ...(availableBanks(eligible).length
      ? [
          {
            id: "netbanking" as const,
            Icon: Landmark,
            name: "Net banking",
            note: "Continue securely to your bank",
          },
        ]
      : []),
    ...(eligible.some((m) =>
      ["card", "credit_card", "debit_card"].includes(m.type),
    )
      ? [
          {
            id: "card" as const,
            Icon: CreditCard,
            name: "Debit / credit card",
            note: "Pay using secure card fields",
          },
        ]
      : []),
  ];
  return (
    <>
      <h2 className="ar-method-heading">Choose a payment method</h2>
      <div className="ar-methods" role="group" aria-label="Payment method">
        {choices.map(({ id, Icon, name, note }) => (
          <button
            key={id}
            className={"ar-method " + (method === id ? "selected" : "")}
            disabled={busy}
            onClick={() => onChange(id)}
            aria-pressed={method === id}
          >
            <span className="ar-method-icon">
              <Icon size={23} />
            </span>
            <span>
              <strong>{name}</strong>
              <small>{note}</small>
            </span>
            <span className="ar-radio">
              {method === id && <Check size={12} />}
            </span>
          </button>
        ))}
      </div>
      {!choices.length && (
        <div className="ar-alert">
          No supported payment method is currently available. Please contact
          support.
        </div>
      )}
      <button
        className="ar-primary ar-full"
        disabled={busy || !choices.some((c) => c.id === method)}
        onClick={onContinue}
      >
        {busy ? "Preparing payment…" : "Continue"}
        <ArrowRight size={17} />
      </button>
    </>
  );
}
export function PaymentMethods({
  prepare,
  check,
  restart,
  existingSession,
  returnUrl,
  amount,
  merchant,
  method,
  eligible,
  changeMethod,
  lastAttempt,
}: {
  prepare: () => Promise<PaymentSession | null>;
  check: () => Promise<void>;
  restart: () => Promise<void>;
  existingSession?: PaymentSession;
  returnUrl: string;
  amount: string;
  merchant: string;
  method: PaymentMethod;
  eligible: EligibleMethod[];
  changeMethod: () => void;
  lastAttempt?: string;
}) {
  const banks = availableBanks(eligible);
  const [bank, setBank] = useState(banks[0]?.[0] || ""),
    [app, setApp] = useState("gpay");
  const [session, setSession] = useState<PaymentSession | null>(
      existingSession || null,
    ),
    [loading, setLoading] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [now, setNow] = useState(Date.now()),
    [qrRequested, setQrRequested] = useState(false);
  const handle = useRef<{
    sdk: Awaited<ReturnType<typeof getCashfreeElements>>;
    element: PaymentElement;
    fields: PaymentElement[];
  } | null>(null);
  const payAction = useRef<() => void>(() => {});
  const callbacks = useRef({ check });
  callbacks.current = { check };
  const mobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad/i.test(navigator.userAgent);
  const deadline = Date.parse(
    session?.paymentExpiresAt || existingSession?.paymentExpiresAt || "",
  );
  const seconds = Number.isFinite(deadline)
    ? Math.max(0, Math.ceil((deadline - now) / 1000))
    : null;
  const timedOut = seconds === 0;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!session || timedOut || !Number.isFinite(deadline)) return;
    let live = true;
    const fields: PaymentElement[] = [];
    setLoading(true);
    setReady(false);
    setError("");
    setQrRequested(false);
    const setup = async () => {
      const sdk = await getCashfreeElements(session.mode);
      if (!live) return;
      const mount = (
        kind: string,
        id: string,
        values: Record<string, unknown>,
      ) => {
        const mounted = mountPaymentElement(sdk, kind, id, values);
        fields.push(mounted.element);
        return mounted;
      };
      let payable: PaymentElement;
      if (method === "card") {
        const entries = [
          "cardNumber",
          "cardExpiry",
          "cardCvv",
          "cardHolder",
        ].map((kind) => mount(kind, "#ar-" + kind, {}));
        await Promise.all(entries.map((entry) => entry.ready));
        payable = entries[0].element;
      } else {
        const kind =
          method === "qr"
            ? "upiQr"
            : method === "app"
              ? "upiApp"
              : "netbanking";
        const values =
          method === "qr"
            ? { size: "224px" }
            : method === "app"
              ? {
                  upiApp: app,
                  buttonText:
                    "Open " +
                    (app === "gpay"
                      ? "Google Pay"
                      : app === "phonepe"
                        ? "PhonePe"
                        : "Paytm"),
                  buttonIcon: true,
                }
              : {
                  netbankingBankName: bank,
                  buttonText:
                    BANKS.find((b) => b[0] === bank)?.[1] || "Your bank",
                  buttonIcon: true,
                };
        const mounted = mount(kind, "#ar-payment-element", values);
        mounted.element.on("paymentrequested", () => {
          if (live) setQrRequested(true);
        });
        if (method === "app" || method === "netbanking")
          mounted.element.on("click", () => payAction.current());
        await mounted.ready;
        payable = mounted.element;
      }
      if (!live) return;
      handle.current = { sdk, element: payable, fields };
      setLoading(false);
      setReady(true);
      if (method === "qr") {
        setSubmitting(true);
        try {
          await payWithElement(sdk, payable, session, returnUrl);
          if (live) await callbacks.current.check();
        } catch (e: any) {
          if (live) {
            setError(e.message);
            void callbacks.current.check();
          }
        } finally {
          if (live) setSubmitting(false);
        }
      }
    };
    void setup().catch((e: any) => {
      if (live) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      live = false;
      handle.current = null;
      fields.forEach((field) => {
        try {
          field.unmount();
        } catch {}
      });
    };
  }, [session, method, bank, app, timedOut, returnUrl]);
  useEffect(() => {
    if (timedOut) {
      setSubmitting(false);
      void callbacks.current.check();
    }
  }, [timedOut]);
  const start = async () => {
    if (loading || submitting) return;
    setLoading(true);
    setError("");
    try {
      const payment = await prepare();
      if (payment) setSession(payment);
      else setLoading(false);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };
  const pay = async () => {
    const current = handle.current;
    if (!current || !session || submitting || timedOut) return;
    if (
      current.fields.some(
        (field) => !(field.isComplete?.() ?? field.data()?.complete),
      )
    ) {
      setError("Please complete all payment details.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await payWithElement(current.sdk, current.element, session, returnUrl);
      await check();
    } catch (e: any) {
      setError(e.message);
      void check();
    } finally {
      setSubmitting(false);
    }
  };
  payAction.current = () => void pay();
  return (
    <section className="ar-checkout-card ar-payment-card">
      <div className="ar-payment-layout">
        <div className="ar-method-content">
          {timedOut || !Number.isFinite(deadline) ? (
            <div className="ar-empty-payment">
              <Clock3 size={34} />
              <h3>Payment session expired</h3>
              <p>
                This QR is no longer available. We still record delayed payment
                confirmations. Check your bank before starting another payment.
              </p>
              <button
                className="ar-primary"
                onClick={() => void restart().catch((e) => setError(e.message))}
              >
                <RefreshCw size={17} />
                Generate new QR
              </button>
            </div>
          ) : (
            <>
              {method === "netbanking" && (
                <>
                  <label className="ar-label" htmlFor="ar-bank">
                    Select your bank
                  </label>
                  <select
                    id="ar-bank"
                    className="ar-input"
                    disabled={loading || submitting}
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                  >
                    {banks.map(([id, name]) => (
                      <option value={id} key={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <p className="ar-note">
                    Continue to your bank to authorize the payment. You'll
                    return here for confirmation.
                  </p>
                </>
              )}
              {method === "app" && (
                <>
                  <label className="ar-label" htmlFor="ar-app">
                    Choose your UPI app
                  </label>
                  <select
                    id="ar-app"
                    className="ar-input"
                    value={app}
                    disabled={loading || submitting}
                    onChange={(e) => setApp(e.target.value)}
                  >
                    <option value="gpay">Google Pay</option>
                    <option value="phonepe">PhonePe</option>
                    <option value="paytm">Paytm</option>
                  </select>
                </>
              )}
              {method === "qr" && (
                <div className="ar-qr-panel">
                  <span className="ar-qr-label">PAYING {merchant}</span>
                  <strong className="ar-payment-amount">{amount}</strong>
                  {session ? (
                    <div className="ar-qr-frame">
                      <div
                        id="ar-payment-element"
                        aria-label="Secure UPI QR code"
                      />
                      {loading && (
                        <div className="ar-qr-loader">
                          <Loader2 className="animate-spin" size={28} />
                          <span>Generating your secure QR…</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="ar-qr-placeholder">
                      <QrCode size={58} />
                      <p>Your secure QR appears here</p>
                    </div>
                  )}
                  <h3>किसी भी UPI ऐप से स्कैन करके भुगतान करें।</h3>
                  <p>Google Pay, PhonePe, Paytm, BHIM and other UPI apps</p>
                  {mobile && (
                    <small>
                      Scan using another device, or choose “UPI app” to pay on
                      this phone.
                    </small>
                  )}
                </div>
              )}
              {!session && method === "card" && (
                <div className="ar-empty-payment ar-card-intro">
                  <CreditCard size={32} />
                  <h3>Pay by debit or credit card</h3>
                  <p>
                    Continue to enter your card details in secure payment
                    fields.
                  </p>
                </div>
              )}
              {session && method === "card" && (
                <div className="ar-card-fields">
                  {[
                    ["cardNumber", "Card number"],
                    ["cardExpiry", "Expiry date"],
                    ["cardCvv", "CVV"],
                    ["cardHolder", "Name on card"],
                  ].map(([id, label]) => (
                    <div key={id}>
                      <span className="ar-label">{label}</span>
                      <div id={"ar-" + id} aria-label={label} />
                    </div>
                  ))}
                </div>
              )}
              {session && (method === "netbanking" || method === "app") && (
                <div
                  id="ar-payment-element"
                  className="ar-bank-element"
                  aria-label="Secure payment provider component"
                />
              )}
              {!session ? (
                <button
                  type="button"
                  className="ar-primary ar-full"
                  disabled={loading}
                  onClick={() => void start()}
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : method === "qr" ? (
                    <QrCode size={18} />
                  ) : (
                    <LockKeyhole size={17} />
                  )}{" "}
                  {loading
                    ? "Preparing payment…"
                    : method === "qr"
                      ? "Generate QR code"
                      : method === "card"
                        ? "Continue with card"
                        : "Continue securely"}
                  <ArrowRight size={17} />
                </button>
              ) : (
                method !== "qr" && (
                  <button
                    type="button"
                    className="ar-primary ar-full"
                    disabled={!ready || submitting || loading}
                    onClick={() => void pay()}
                  >
                    {loading || submitting ? (
                      <Loader2 className="animate-spin" size={17} />
                    ) : (
                      <LockKeyhole size={17} />
                    )}{" "}
                    {loading
                      ? "Loading secure fields…"
                      : submitting
                        ? "Waiting for confirmation…"
                        : "Pay " + amount}
                    <ArrowRight size={17} />
                  </button>
                )
              )}
              {session && seconds !== null && (
                <div className="ar-countdown">
                  <Clock3 size={16} />
                  <span>Session expires in</span>
                  <strong>
                    {Math.floor(seconds / 60)}:
                    {String(seconds % 60).padStart(2, "0")}
                  </strong>
                </div>
              )}
              {session && method === "qr" && !error && (
                <div className="ar-waiting" role="status">
                  <span />
                  Waiting for payment confirmation
                </div>
              )}
            </>
          )}
          {["FAILED", "USER_DROPPED", "CANCELLED"].includes(
            lastAttempt || "",
          ) && (
            <div className="ar-alert" role="status">
              {lastAttempt === "FAILED"
                ? "The last payment attempt failed. No successful payment has been confirmed."
                : "The last payment attempt was cancelled."}{" "}
              Choose another method or check this order before retrying.
            </div>
          )}
          {error && (
            <div className="ar-alert" role="alert">
              {error}
            </div>
          )}
          {(session || existingSession) && (
            <button
              type="button"
              className="ar-status-link"
              onClick={() => void check()}
            >
              <RefreshCw size={15} />
              Check payment status
            </button>
          )}
        </div>
      </div>
      <button
        className="ar-text-link ar-centered"
        type="button"
        onClick={changeMethod}
      >
        Change payment method
      </button>
      <div className="ar-security-foot">
        <ShieldCheck size={17} />
        <span>Secure payment processing by Cashfree</span>
        <LockKeyhole size={15} />
      </div>
    </section>
  );
}
