import usageHandler from '../src/server/usage.js';
import { randomUUID } from 'node:crypto';
import { authenticatedUser, cleanEnvironment } from '../src/server/supabaseConfig.js';
import { enforceRateLimit } from './_auth.js';
import { BillingError, billingConfig, billingDb, cashfreeRequest, reconcileOrder, safeOrder, validatedCustomer, verifyCashfreeSignature } from '../src/server/cashfree.js';

// Cashfree signatures are over the ORIGINAL bytes, never parsed / re-serialized JSON.
// Vercel's req.body is a lazy JSON-parsing getter; reading it first consumes the stream
// and was also rejecting regular checkout JSON with "Raw payment request required".
export const config = { api: { bodyParser: false }, maxDuration: 60 };
export async function readBillingBody(req: any): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  if (typeof req?.[Symbol.asyncIterator] === 'function' && !req.readableEnded) {
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 65536) throw new BillingError('Request too large.', 413);
      chunks.push(bytes);
    }
    if (size > 0) return Buffer.concat(chunks);
  }
  // For adapter-level raw bodies only; do NOT accept parsed JSON as a signed webhook.
  const body = req.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  throw new BillingError('Raw payment request required.', 400);
}
const orderIdValid = (value: string) => /^ar_(sandbox|production)_[a-f0-9-]{36}$/.test(value);
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const action = String(req.query?.action || 'config');
    if (action === 'usage') return usageHandler(req, res);
    if (action === 'config' && req.method === 'GET') return res.status(200).json({ ok: true, ...billingConfig() });
    // Public, read-only catalog. Checkout always re-reads authoritative prices
    // from the database, never amounts submitted by a browser.
    if (action === 'plans' && req.method === 'GET') {
      const plans = await billingDb('autoreply_plans?select=id,name,price_inr,total_messages,ai_replies,instagram_accounts,automations_limit,billing_days,is_active,sort_order&is_active=eq.true&order=sort_order.asc');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
      return res.status(200).json({ ok: true, plans });
    }
    if (action === 'webhook') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false });
      const raw = await readBillingBody(req);
      if (!verifyCashfreeSignature(raw, String(req.headers['x-webhook-timestamp'] || ''), String(req.headers['x-webhook-signature'] || ''), cleanEnvironment(process.env.CASHFREE_CLIENT_SECRET))) return res.status(401).json({ ok: false, error: 'Invalid payment signature.' });
      const event = JSON.parse(raw.toString('utf8'));
      const id = String(event?.data?.order?.order_id || '');
      if (!orderIdValid(id)) return res.status(200).json({ ok: true, ignored: true });
      const orders = await billingDb(`autoreply_billing_orders?order_id=eq.${encodeURIComponent(id)}&limit=1`);
      // Unknown orders never grant entitlements. Failed attempts never downgrade an order.
      if (orders?.[0] && event.type === 'PAYMENT_SUCCESS_WEBHOOK') await reconcileOrder(orders[0]);
      return res.status(200).json({ ok: true });
    }
    if (!['create','status','history','subscription','pending','cancel'].includes(action)) return res.status(404).json({ ok: false, error: 'Unknown billing action.' });
    if (req.method !== (['create','cancel'].includes(action) ? 'POST' : 'GET')) return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Sign in to manage your payments.' });
    const rate = enforceRateLimit(`billing:${action}:${user.id}`, action === 'create' ? 10 : 90, 60000);
    if (!rate.allowed) { res.setHeader('Retry-After', String(rate.retryAfter)); return res.status(429).json({ ok: false, error: 'Too many payment requests. Please wait a moment.' }); }
    if (action === 'pending') {
      // A previous live checkout belongs to one owner and must be resolved
      // before a different plan can begin. Never silently charge twice.
      const env = billingConfig().mode;
      const pending = await billingDb(`autoreply_billing_orders?owner_user_id=eq.${encodeURIComponent(user.id)}&environment=eq.${env}&status=in.(creating,pending)&order=created_at.desc&limit=1`);
      const o = pending?.[0] ? await reconcileOrder(pending[0]) : null;
      return res.status(200).json({ok:true,order:o && !['expired','paid'].includes(o.status) ? safeOrder(o) : null});
    }
    if (action === 'cancel') {
      const data=JSON.parse((await readBillingBody(req)).toString('utf8'));
      const orderId=String(data?.orderId||'');
      if(!orderIdValid(orderId)) throw new BillingError('Invalid checkout reference.',400);
      const rows=await billingDb(`autoreply_billing_orders?order_id=eq.${encodeURIComponent(orderId)}&owner_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if(!rows?.length) throw new BillingError('Payment order not found.',404);
      const existing=await reconcileOrder(rows[0]);
      if(existing.status==='paid') throw new BillingError('This payment was received. Your plan has not been cancelled.',409);
      if(existing.status==='expired') return res.status(200).json({ok:true,order:safeOrder(existing)});
      // Provider termination is the ONLY safe way to release an existing
      // payable order. Do not release an active checkout by changing local DB.
      const provider=await cashfreeRequest('/orders/'+encodeURIComponent(orderId),'PATCH',{order_status:'TERMINATED'});
      if(provider.order_status!=='TERMINATED') throw new BillingError('Cashfree is still closing the earlier checkout. Check its status before switching plans.',409);
      const finalOrder=await reconcileOrder(existing);
      if(finalOrder.status==='paid') throw new BillingError('Your existing payment succeeded. Your plan has not been cancelled.',409);
      if(finalOrder.status!=='expired') throw new BillingError('Checkout termination has not been verified yet. Try again shortly.',409);
      return res.status(200).json({ok:true,order:safeOrder(finalOrder)});
    }
    if (action === 'history') {
      const rows = await billingDb(`autoreply_billing_orders?owner_user_id=eq.${user.id}&select=*&order=created_at.desc&limit=50`);
      return res.status(200).json({ ok: true, orders: rows.map(safeOrder) });
    }
    if (action === 'subscription') return res.status(200).json({ ok: true, subscription: await billingDb('rpc/autoreply_billing_entitlement', 'POST', { p_workspace_id: user.id }) });
    if (action === 'status') {
      const id = String(req.query?.order_id || '');
      if (!orderIdValid(id)) throw new BillingError('Invalid payment order.', 400);
      const rows = await billingDb(`autoreply_billing_orders?order_id=eq.${encodeURIComponent(id)}&owner_user_id=eq.${user.id}&limit=1`);
      if (!rows?.[0]) throw new BillingError('Payment order not found.', 404);
      const order = await reconcileOrder(rows[0]);
      return res.status(200).json({ ok: true, order: safeOrder(order), ...(order.status === 'pending' ? { paymentSessionId: order.payment_session_id, mode: order.environment } : {}) });
    }
    const cfg = billingConfig();
    if (!cfg.configured) throw new BillingError('Payments are being set up. No money has been taken. Please try again later.');
    const body = JSON.parse((await readBillingBody(req)).toString('utf8'));
    const customer = validatedCustomer(body);
    if (!['starter','pro','business'].includes(body.planId)) throw new BillingError('Select a paid plan.', 400);
    if (!/^[a-f0-9-]{36}$/i.test(String(body.requestId || ''))) throw new BillingError('Invalid checkout request.', 400);
    const current = await billingDb(`autoreply_billing_orders?owner_user_id=eq.${encodeURIComponent(user.id)}&environment=eq.${cfg.mode}&status=in.(creating,pending)&order=created_at.desc&limit=1`);
    if(current?.[0]) {
      const existing=await reconcileOrder(current[0]);
      if(['creating','pending'].includes(existing.status) && existing.plan_id!==body.planId) {
        res.setHeader('Cache-Control','private, no-store');
        return res.status(409).json({ok:false,code:'PENDING_OTHER_PLAN',error:'You already have an unfinished '+existing.plan_id+' checkout. Continue it or cancel it securely before choosing a different plan.',pendingOrder:safeOrder(existing)});
      }
    }
    const id = `ar_${cfg.mode}_${randomUUID()}`;
    // Reservation snapshots authoritative prices and serializes checkout per login.
    let order = await billingDb('rpc/autoreply_reserve_billing_order', 'POST', { p_order_id: id, p_request_id: body.requestId, p_owner_id: user.id, p_plan_id: body.planId, p_environment: cfg.mode });
    if (order.status === 'paid') return res.status(200).json({ ok: true, order: safeOrder(order) });
    // Retrying the same durable reservation uses the SAME provider id and key, never creates a second chargeable order.
    const provider = await cashfreeRequest('/orders', 'POST', {
      order_id: order.order_id, order_amount: Number(order.amount_inr), order_currency: 'INR',
      customer_details: { customer_id: user.id, customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone },
      order_meta: { return_url: cfg.appUrl + '/billing/checkout?order_id=' + encodeURIComponent(order.order_id), notify_url: cfg.appUrl + '/api/billing?action=webhook' },
      order_note: `${order.plan_id} plan · ${order.billing_days} days · one-time payment`,
    }, order.request_id);
    if (provider.order_id !== order.order_id || !provider.payment_session_id) throw new BillingError('Checkout could not be verified. Check the order before retrying.');
    await billingDb(`autoreply_billing_orders?order_id=eq.${encodeURIComponent(order.order_id)}&status=neq.paid`, 'PATCH', { status: 'pending', payment_session_id: provider.payment_session_id });
    return res.status(200).json({ ok: true, order: safeOrder(order), paymentSessionId: provider.payment_session_id, mode: cfg.mode });
  } catch (error: any) {
    console.error('[BILLING_REQUEST_FAILED]', { type: error?.name || 'Error', status: error?.status || 503 });
    return res.status(error instanceof BillingError ? error.status : 503).json({ ok: false, error: error instanceof BillingError ? error.message : 'Payment confirmation is temporarily unavailable. Check your existing order before paying again.' });
  }
}
