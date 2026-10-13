import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {generateReceiptPng} from '../src/server/receiptImage.js';
import {invoiceLabel,type PaidInvoice} from '../src/server/invoicePdf.js';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const invoice:PaidInvoice={serial_number:2,order_id:'ar_p_11111111-2222-4333-8444-555555555555',customer_name:'Example Buyer',customer_email:'buyer@example.test',plan_id:'pro',billing_days:30,amount_inr:499,paid_at:'2026-10-13T00:00:00Z',issued_at:'2026-10-13T00:00:00Z',payment_id:'cf_123'};
test('receipt image is a decodable truecolor 900x510 PNG with real pixels',()=>{
 const png=generateReceiptPng(invoice,'2026-11-12T00:00:00Z');
 assert.ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 assert.equal(png.readUInt32BE(16),900);assert.equal(png.readUInt32BE(20),510);
 assert.equal(png[25],2); // RGB
 let offset=8,compressed=[];
 while(offset<png.length){
  const len=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);
  if(type==='IDAT')compressed.push(png.subarray(offset+8,offset+8+len));
  offset+=12+len;if(type==='IEND')break;
 }
 const data=inflateSync(Buffer.concat(compressed));
 assert.equal(data.length,510*(1+900*3));
 assert.ok(png.length<2_000_000);
});
test('receipt delivery includes inline PNG and PDF and authoritative paid plan expiry',()=>{
 const src=read('src/server/invoiceService.ts');
 assert.match(src,/generateReceiptPng\(invoice,expiry\)/);
 assert.match(src,/content_id:'autoreply-receipt'/);
 assert.match(src,/cid:autoreply-receipt/);
 assert.match(src,/\.pdf',content:pdf\.toString\('base64'\)/);
 assert.match(src,/access_expires_at/);
 assert.match(src,/autoreply_plans\?select/);
 assert.match(src,/emailInvoiceIfConfigured/);
});
test('welcome email is first-login-only and not a marketing opt-in',()=>{
 const logic=read('src/server/customerLifecycle.ts');
 const sql=read('supabase/migrations/20261013_customer_email_lifecycle.sql');
 assert.match(logic,/action==='mail-activity'/);
 assert.match(logic,/autoreply_claim_welcome_email/);
 assert.match(sql,/welcome_sent_at is null/);
 assert.match(sql,/marketing_opt_in boolean not null default false/);
 assert.match(logic,/marketingOptIn:'?boolean/);
 assert.match(logic,/action==='mail-unsubscribe'/);
 assert.match(logic,/marketing_opt_in:false/);
});
test('four onboarding reminders require opt-in and inactivity, with retry and dedupe locks',()=>{
 const logic=read('src/server/customerLifecycle.ts');
 const sql=read('supabase/migrations/20261013_customer_email_lifecycle.sql');
 assert.match(sql,/onboarding_stage<4/);
 assert.match(sql,/3\*\(l\.onboarding_stage\+1\)/);
 assert.match(sql,/l\.marketing_opt_in/);
 assert.match(sql,/for update skip locked/);
 assert.match(logic,/autoreply_claim_onboarding_emails/);
 assert.match(logic,/autoreply_complete_onboarding_email/);
 assert.match(logic,/Idempotency-Key/);
 assert.match(logic,/last_seen_at/);
});
test('subscription reminders include real plan and expiry; settings offer consent control',()=>{
 const logic=read('src/server/customerLifecycle.ts');
 const settings=read('src/components/Settings/SettingsPage.tsx');
 const app=read('src/context/AppContext.tsx');
 assert.match(logic,/autoreply_billing_subscriptions\?select=plan_id,expires_at/);
 assert.match(settings,/Send me helpful tips if I haven't visited/);
 assert.match(settings,/marketingOptIn:checked/);
 assert.match(app,/action=mail-activity/);
 assert.match(read('api/workspace-data.ts'),/startsWith\('mail-'\)/);
});
test('private email lifecycle data cannot be queried using customer JWT',()=>{
 const sql=read('supabase/migrations/20261013_customer_email_lifecycle.sql');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.autoreply_customer_email_lifecycle from public,anon,authenticated/);
 assert.match(sql,/grant select,insert,update,delete on public\.autoreply_customer_email_lifecycle to service_role/);
});
