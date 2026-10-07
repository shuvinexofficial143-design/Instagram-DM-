import { createHmac, timingSafeEqual } from 'node:crypto';
import { cleanEnvironment, normalizeAppUrl, SUPABASE_URL } from './supabaseConfig.js';

export class BillingError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export function businessDetails() {
  return { legalName: cleanEnvironment(process.env.BUSINESS_LEGAL_NAME), email: cleanEnvironment(process.env.BUSINESS_SUPPORT_EMAIL), phone: cleanEnvironment(process.env.BUSINESS_SUPPORT_PHONE), address: cleanEnvironment(process.env.BUSINESS_ADDRESS) };
}
export function billingConfig() {
  const mode = cleanEnvironment(process.env.CASHFREE_ENV) || 'sandbox';
  if (!['sandbox', 'production'].includes(mode)) throw new BillingError('Payment environment is invalid.');
  const details = businessDetails();
  const appUrl = normalizeAppUrl(process.env.APP_URL || 'https://www.autoreplys.in');
  const ready = Boolean(cleanEnvironment(process.env.CASHFREE_CLIENT_ID) && cleanEnvironment(process.env.CASHFREE_CLIENT_SECRET) && cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY));
  const legalReady = Boolean(details.legalName && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) && details.phone && details.address);
  return { mode, appUrl, configured: ready && (mode === 'sandbox' || (legalReady && process.env.CASHFREE_LIVE_ENABLED === 'true')), legalReady, business: details };
}
export function verifyCashfreeSignature(raw: Buffer, timestamp: string, signature: string, secret: string): boolean {
  if (!secret || !/^\d{10,16}$/.test(timestamp) || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(timestamp).update(raw).digest();
  const actual = Buffer.from(signature, 'base64');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function validatedCustomer(body: any) {
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const phone = String(body?.phone || '').replace(/[\s()-]/g, '').replace(/^\+91/, '');
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || !/^[6-9]\d{9}$/.test(phone)) throw new BillingError('Enter your name, email and a valid 10-digit Indian mobile number.', 400);
  return { name, email, phone };
}
export async function billingDb(path: string, method = 'GET', body?: any) {
  const secret = cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!secret) throw new BillingError('Payment storage is not configured.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) { console.error('[BILLING_STORAGE_ERROR]', { status: response.status }); throw new BillingError('Payment storage is temporarily unavailable. Please check your existing order before retrying.'); }
  return response.status === 204 ? null : response.json();
}
export async function cashfreeRequest(path: string, method = 'GET', body?: any, idempotencyKey?: string) {
  const cfg = billingConfig();
  if (!cfg.configured) throw new BillingError('Payments are being set up. No money has been taken. Please try again later.');
  const base = cfg.mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  const response = await fetch(base + path, { method, headers: { 'x-client-id': cleanEnvironment(process.env.CASHFREE_CLIENT_ID), 'x-client-secret': cleanEnvironment(process.env.CASHFREE_CLIENT_SECRET), 'x-api-version': '2025-01-01', 'Content-Type': 'application/json', ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new BillingError(response.status === 404 ? 'Payment order is not available yet. Check again shortly.' : 'The payment provider could not complete this request. Check your existing order before retrying.', response.status === 404 ? 409 : 503);
  return payload;
}
export function validateProviderPayment(order: any, provider: any, payments: any[]) {
  if (provider?.order_id !== order.order_id || Number(provider.order_amount) !== Number(order.amount_inr) || provider.order_currency !== 'INR') throw new BillingError('Payment details could not be verified.', 409);
  if (provider.order_status !== 'PAID') return null;
  const payment = payments.find(p => p.payment_status === 'SUCCESS' && Number(p.payment_amount) === Number(order.amount_inr) && p.payment_currency === 'INR' && /^\d+$/.test(String(p.cf_payment_id || '')));
  if (!payment) throw new BillingError('Payment confirmation is still processing. Your plan has not changed.', 409);
  return payment;
}
export async function reconcileOrder(order: any) {
  if (order.status === 'paid') return order;
  if (order.environment !== billingConfig().mode) throw new BillingError('This order belongs to another payment environment.', 409);
  let provider: any, payments: any;
  try { [provider, payments] = await Promise.all([cashfreeRequest('/orders/' + encodeURIComponent(order.order_id)), cashfreeRequest('/orders/' + encodeURIComponent(order.order_id) + '/payments')]); }
  catch (error) { if (order.status === 'creating' && error instanceof BillingError && error.status === 409) return order; throw error; }
  const payment = validateProviderPayment(order, provider, Array.isArray(payments) ? payments : []);
  if (payment) return billingDb('rpc/autoreply_confirm_billing_order', 'POST', { p_order_id: order.order_id, p_payment_id: String(payment.cf_payment_id), p_amount: Number(provider.order_amount), p_currency: provider.order_currency, p_environment: order.environment });
  if (['EXPIRED','TERMINATED'].includes(provider.order_status)) {
    const rows = await billingDb(`autoreply_billing_orders?order_id=eq.${encodeURIComponent(order.order_id)}&status=neq.paid`, 'PATCH', { status: 'expired' });
    return rows?.[0] || order;
  }
  return { ...order, status: 'pending', last_attempt: Array.isArray(payments) ? payments.slice().sort((a,b)=>Date.parse(b.payment_time||'')-Date.parse(a.payment_time||''))[0]?.payment_status : undefined, payment_session_id: provider.payment_session_id || order.payment_session_id };
}
export function safeOrder(order: any) {
  return { orderId: order.order_id, planId: order.plan_id, amount: order.amount_inr, currency: order.currency, environment: order.environment, status: order.status, createdAt: order.created_at, paidAt: order.paid_at, activatedAt: order.activated_at, expiresAt: order.access_expires_at, activationStatus: order.activation_status, lastAttempt: order.last_attempt, paymentId: order.cf_payment_id };
}
