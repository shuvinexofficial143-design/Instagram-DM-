import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = p => readFileSync(new URL('../'+p, import.meta.url),'utf8');
const api=read('src/server/support.ts');
const sql=read('supabase/migrations/20261012_customer_support_tickets.sql');
const ui=read('src/components/Support/SupportDesk.tsx');
const help=read('src/components/Support/SupportPage.tsx');
const billing=read('src/components/Billing/BillingUsagePage.tsx');
const admin=read('src/components/Admin/AdminPage.tsx');

test('support table is closed to public and logged-in Data API clients',()=>{
  for(const table of ['autoreply_support_tickets','autoreply_support_messages']){
    assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security','i'));
    assert.match(sql,new RegExp('revoke all on public\\.'+table+' from public, anon, authenticated','i'));
    assert.match(sql,new RegExp('grant select, insert, update, delete on public\\.'+table+' to service_role','i'));
  }
});
test('server verifies identity, ownership, admin and linked payments',()=>{
  assert.match(api,/authenticatedUser\(req\)/);
  assert.match(api,/verifiedAdmin\(req,user\.id\)/);
  assert.match(api,/owner_user_id=eq\./);
  assert.match(api,/owned\[0\]\.status!=='paid'/);
  assert.match(api,/owned\[0\]\.environment!=='production'/);
  assert.match(api,/Duplicate|An active request for this payment already exists/);
  assert.match(api,/refund_initiated','refunded/);
  // Cashfree may only be contacted by explicitly authorized refund actions.\n  assert.match(api,/if\(action==='admin-refund'\)/);\n  assert.match(api,/CASHFREE_REFUNDS_ENABLED/);
  assert.doesNotMatch(api,/payment_session_id/);
});
test('support UI includes customer conversations, request tracking and an admin inbox',()=>{
  for(const term of ['New support request','Submit request','Your support tickets','Support conversation','Request cancellation','Refund request']) assert.ok(ui.includes(term),term);
  assert.match(help,/<SupportDesk/);
  assert.match(admin,/<AdminSupportDesk/);
  assert.match(billing,/\/contact\?type=refund/);
  assert.match(billing,/\/contact\?type=cancellation/);
});
test('no promises of instant refund or automatic cancellation',()=>{
  assert.match(ui,/does not automatically/);
  assert.match(help,/no automatic renewal/);
  assert.match(api,/Never change billing entitlement/);
});

test('support reuses the existing workspace-data Vercel function',()=>{
  const route=read('api/workspace-data.ts');
  assert.match(route,/supportHandler\(req, res\)/);
  assert.match(ui,/\/api\/workspace-data\?action=support-/);
});

test('private screenshots enforce ticket access and binary type validation',()=>{
  const source=read('src/server/support.ts');
  const migration=read('supabase/migrations/20261013_private_support_attachments.sql');
  assert.match(source,/action==='attachment-upload'/);
  assert.match(source,/getTicket\(ticketId,user\.id,admin\)/);
  assert.match(source,/imageType==='image\/png'&&isPng/);
  assert.match(source,/imageType==='image\/jpeg'&&isJpeg/);
  assert.match(source,/imageType==='image\/webp'&&isWebp/);
  assert.match(source,/action==='attachment-link'/);
  assert.match(migration,/public=false/);
  assert.match(migration,/autoreply_support_attachments enable row level security/);
  assert.match(migration,/revoke all on public\.autoreply_support_attachments from public,anon,authenticated/);
  assert.match(ui,/EvidencePanel/);
});
test('optional alerts never include message contents or payment information',()=>{
  const source=read('src/server/supportNotify.ts');
  assert.match(source,/SUPPORT_NOTIFICATION_EMAIL/);
  assert.match(source,/RESEND_API_KEY/);
  assert.match(source,/SUPPORT_TELEGRAM_BOT_TOKEN/);
  assert.doesNotMatch(source,/JSON\.stringify\(ticket\)/);
});

test('Cashfree refund is admin-only, approved, full-amount and idempotent',()=>{
 const src=read('src/server/support.ts');
 const migration=read('supabase/migrations/20261013_support_refunds.sql');
 assert.match(src,/action==='admin-refund'/);
 assert.match(src,/verifiedAdmin\(req,user\.id\)/);
 assert.match(src,/ticket\.status!=='approved'/);
 assert.match(src,/CASHFREE_REFUNDS_ENABLED/);
 assert.match(src,/confirmRefund/);
 assert.match(src,/refund_amount:order\.amount_inr/);
 assert.match(src,/refundId/);
 assert.match(src,/refund_initiated/);
 assert.match(migration,/autoreply_support_refunds_one_per_order/);
 assert.match(migration,/revoke all on public\.autoreply_support_refunds from public,anon,authenticated/);
});
