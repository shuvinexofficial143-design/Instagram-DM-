import { createHmac, timingSafeEqual } from "node:crypto";
import {
  cleanEnvironment,
  normalizeAppUrl,
  SUPABASE_URL,
} from "./supabaseConfig.js";

export class BillingError extends Error {
  constructor(
    message: string,
    public status = 503,
    public code = "BILLING_UNAVAILABLE",
    public providerStatus?: number,
    public providerType?: string,
    public orderId?: string,
  ) {
    super(message);
  }
}
export function businessDetails() {
  // Public contact details supplied by the website owner; environment values can override them.
  return {
    legalName:
      cleanEnvironment(process.env.BUSINESS_LEGAL_NAME) || "Auto Replies",
    email:
      cleanEnvironment(process.env.BUSINESS_SUPPORT_EMAIL) ||
      "nazhalijing@gmail.com",
    phone: cleanEnvironment(process.env.BUSINESS_SUPPORT_PHONE) || "9589244427",
    address:
      cleanEnvironment(process.env.BUSINESS_ADDRESS) ||
      "ग्राम बघेरा, तहसील तराना, जिला उज्जैन, मध्य प्रदेश, भारत",
  };
}
export function billingConfig() {
  const mode = cleanEnvironment(process.env.CASHFREE_ENV) || "sandbox";
  if (!["sandbox", "production"].includes(mode))
    throw new BillingError("Payment environment is invalid.");
  const details = businessDetails();
  const appUrl = normalizeAppUrl(
    process.env.APP_URL || "https://autoreplys.vercel.app",
  );
  const ready = Boolean(
    cleanEnvironment(process.env.CASHFREE_CLIENT_ID) &&
    cleanEnvironment(process.env.CASHFREE_CLIENT_SECRET) &&
    cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  const legalReady = Boolean(
    details.legalName &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) &&
    details.phone &&
    details.address,
  );
  return {
    mode,
    appUrl,
    configured:
      ready &&
      (mode === "sandbox" ||
        (legalReady && process.env.CASHFREE_LIVE_ENABLED === "true")),
    legalReady,
    business: details,
  };
}
export function verifyCashfreeSignature(
  raw: Buffer,
  timestamp: string,
  signature: string,
  secret: string,
): boolean {
  if (
    !secret ||
    !/^\d{10,16}$/.test(timestamp) ||
    !/^[A-Za-z0-9+/]{43}=$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp)
    .update(raw)
    .digest();
  const actual = Buffer.from(signature, "base64");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function validatedCustomer(body: any) {
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  const phone = String(body?.phone || "")
    .replace(/[\s()-]/g, "")
    .replace(/^\+91/, "");
  if (
    name.length < 2 ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 200 ||
    !/^[6-9]\d{9}$/.test(phone)
  )
    throw new BillingError(
      "Enter your name, email and a valid 10-digit Indian mobile number.",
      400,
    );
  return { name, email, phone };
}
export async function billingDb(path: string, method = "GET", body?: any) {
  const secret = cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!secret) throw new BillingError("Payment storage is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    console.error("[BILLING_STORAGE_ERROR]", { status: response.status });
    throw new BillingError(
      "Payment storage is temporarily unavailable. Please check your existing order before retrying.",
    );
  }
  return response.status === 204 ? null : response.json();
}
export async function cashfreeRequest(
  path: string,
  method = "GET",
  body?: any,
  idempotencyKey?: string,
  clientHeaders: Record<string, string> = {},
) {
  const cfg = billingConfig();
  if (!cfg.configured)
    throw new BillingError(
      "Payments are being set up. No money has been taken. Please try again later.",
    );
  const base =
    cfg.mode === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";
  const response = await fetch(base + path, {
    method,
    headers: {
      "x-client-id": cleanEnvironment(process.env.CASHFREE_CLIENT_ID),
      "x-client-secret": cleanEnvironment(process.env.CASHFREE_CLIENT_SECRET),
      "x-api-version": "2025-01-01",
      "Content-Type": "application/json",
      ...clientHeaders,
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = String(payload?.code || "request_failed")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 80);
    const type = String(payload?.type || "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 80);
    console.error("[CASHFREE_REQUEST_FAILED]", {
      operation: method + " " + path.replace(/\/orders\/[^/]+/, "/orders/:id"),
      status: response.status,
      code,
      type,
    });
    const message =
      response.status === 404
        ? "Payment order is not available yet. Check again shortly."
        : response.status === 401 || response.status === 403
          ? "Cashfree merchant authentication failed. Contact support; do not retry payment."
          : response.status === 429
            ? "Cashfree is receiving too many requests. Wait a moment before checking again."
            : response.status < 500
              ? "Cashfree rejected the payment request (" +
                code +
                "). No new payment has been confirmed. Please contact support."
              : "Cashfree is temporarily unavailable. Your payment status will be checked before you can retry.";
    throw new BillingError(
      message,
      response.status === 404 ? 409 : 503,
      response.status === 404
        ? "CASHFREE_ORDER_NOT_FOUND"
        : "CASHFREE_" + code.toUpperCase(),
      response.status,
      type,
    );
  }
  return payload;
}
function validateProviderOrder(order: any, provider: any) {
  if (
    provider?.order_id !== order.order_id ||
    Number(provider.order_amount) !== Number(order.amount_inr) ||
    provider.order_currency !== "INR" ||
    provider.customer_details?.customer_id !== order.owner_user_id
  )
    throw new BillingError("Payment details could not be verified.", 409);
}
export function validateProviderPayment(
  order: any,
  provider: any,
  payments: any[],
) {
  validateProviderOrder(order, provider);
  if (provider.order_status !== "PAID") return null;
  const payment = payments.find(
    (p) =>
      p.payment_status === "SUCCESS" &&
      Number(p.payment_amount) === Number(order.amount_inr) &&
      p.payment_currency === "INR" &&
      /^\d+$/.test(String(p.cf_payment_id || "")),
  );
  if (!payment)
    throw new BillingError(
      "Payment confirmation is still processing. Your plan has not changed.",
      409,
    );
  return payment;
}
export async function reconcileOrder(order: any) {
  if (order.status === "paid") return order;
  if (order.environment !== billingConfig().mode)
    throw new BillingError(
      "This order belongs to another payment environment.",
      409,
    );
  let provider: any;
  try {
    provider = await cashfreeRequest(
      "/orders/" + encodeURIComponent(order.order_id),
    );
  } catch (error) {
    if (
      order.status === "creating" &&
      error instanceof BillingError &&
      error.code === "CASHFREE_ORDER_NOT_FOUND"
    )
      return order;
    throw error;
  }
  // Validate the authoritative order before consulting optional attempt history.
  // No-attempt/closed orders can reject the /payments lookup. Such a lookup
  // must not prevent reading or safely closing an otherwise verified order.
  validateProviderOrder(order, provider);
  let payments: any[] = [];
  if (provider.order_status === "PAID") {
    // This lookup is mandatory for activation; never ignore a failed verification.
    payments = await cashfreeRequest(
      "/orders/" + encodeURIComponent(order.order_id) + "/payments",
    );
  } else if (
    ![
      "EXPIRED",
      "TERMINATED",
      "TERMINATION_REQUESTED",
      "TERMINATION_REQ",
    ].includes(provider.order_status)
  ) {
    try {
      payments = await cashfreeRequest(
        "/orders/" + encodeURIComponent(order.order_id) + "/payments",
      );
    } catch (error) {
      if (
        !(error instanceof BillingError) ||
        ![400, 404, 422].includes(error.providerStatus || 0)
      )
        throw error;
    }
  }
  const payment = validateProviderPayment(
    order,
    provider,
    Array.isArray(payments) ? payments : [],
  );
  if (payment)
    return billingDb("rpc/autoreply_confirm_billing_order", "POST", {
      p_order_id: order.order_id,
      p_payment_id: String(payment.cf_payment_id),
      p_amount: Number(provider.order_amount),
      p_currency: provider.order_currency,
      p_environment: order.environment,
    });
  if (["EXPIRED", "TERMINATED"].includes(provider.order_status)) {
    const rows = await billingDb(
      `autoreply_billing_orders?order_id=eq.${encodeURIComponent(order.order_id)}&status=neq.paid`,
      "PATCH",
      {
        status: "expired",
        provider_status: provider.order_status,
        status_checked_at: new Date().toISOString(),
      },
    );
    if (rows?.[0]) return rows[0];
    const latest = await billingDb(
      `autoreply_billing_orders?order_id=eq.${encodeURIComponent(order.order_id)}&limit=1`,
    );
    return latest?.[0] || order;
  }
  const lastAttempt = Array.isArray(payments)
    ? payments
        .slice()
        .sort(
          (a, b) =>
            Date.parse(b.payment_time || "") - Date.parse(a.payment_time || ""),
        )[0]?.payment_status
    : undefined;
  const patch = {
    provider_status: provider.order_status,
    last_attempt: lastAttempt || null,
    status_checked_at: new Date().toISOString(),
    provider_expires_at: provider.order_expiry_time || null,
    status: "pending",
    ...(provider.payment_session_id
      ? { payment_session_id: provider.payment_session_id }
      : {}),
  };
  // Persist diagnostics while allowing financial confirmation to arrive after UI expiry.
  if (order.checkout_state) {
    const rows = await billingDb(
      `autoreply_billing_orders?order_id=eq.${encodeURIComponent(order.order_id)}&status=neq.paid`,
      "PATCH",
      patch,
    );
    const latest =
      rows?.[0] ||
      (
        await billingDb(
          `autoreply_billing_orders?order_id=eq.${encodeURIComponent(order.order_id)}&limit=1`,
        )
      )?.[0];
    if (!latest)
      throw new Error(
        "Payment record is unavailable. Check status before retrying.",
      );
    if (latest.status === "paid") return latest;
    order = { ...order, ...latest };
  }
  return {
    ...order,
    ...patch,
    status: order.status === "paid" ? "paid" : "pending",
    payment_session_id: provider.payment_session_id || order.payment_session_id,
  };
}
function paymentDeadline(order: any) {
  const saved = Date.parse(order.payment_expires_at || ""),
    provider = Date.parse(order.provider_expires_at || "");
  return Number.isFinite(saved)
    ? Number.isFinite(provider)
      ? Math.min(saved, provider)
      : saved
    : provider;
}
export function checkoutPayable(order: any) {
  const deadline = paymentDeadline(order);
  return (
    order.status === "pending" &&
    (!order.checkout_state || order.checkout_state === "active") &&
    Number.isFinite(deadline) &&
    deadline > Date.now() &&
    !isClosing(order.provider_status)
  );
}

export const isClosing = (status: string) =>
  ["TERMINATION_REQUESTED", "TERMINATION_REQ"].includes(status);

export function safeOrder(order: any) {
  return {
    orderId: order.order_id,
    planId: order.plan_id,
    amount: order.amount_inr,
    currency: order.currency,
    environment: order.environment,
    status: order.status,
    createdAt: order.created_at,
    billingDays: order.billing_days,
    paidAt: order.paid_at,
    activatedAt: order.activated_at,
    expiresAt: order.access_expires_at,
    paymentExpiresAt: Number.isFinite(paymentDeadline(order))
      ? new Date(paymentDeadline(order)).toISOString()
      : undefined,
    providerStatus: order.provider_status,
    checkoutState:
      order.status !== "paid" &&
      order.checkout_state === "active" &&
      paymentDeadline(order) <= Date.now()
        ? "expired"
        : order.checkout_state,
    statusCheckedAt: order.status_checked_at,
    activationStatus: order.activation_status,
    lastAttempt: order.last_attempt,
    paymentId: order.cf_payment_id,
  };
}
