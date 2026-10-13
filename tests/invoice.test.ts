import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateInvoicePdf,invoiceLabel,type PaidInvoice} from '../src/server/invoicePdf.js';
const source=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const invoice:PaidInvoice={serial_number:26,order_id:'ar_p_00000000-0000-4000-8000-000000000001',
 customer_name:'Alice (North) \\ Customer',customer_email:'alice@example.test',
 plan_id:'pro',billing_days:30,amount_inr:499,paid_at:'2026-10-13T08:00:00Z',
 issued_at:'2026-10-13T08:01:00Z',payment_id:'cf_pmt_12345'};
test('payment invoice creates a valid vector PDF with customer and order details',()=>{
 const pdf=generateInvoicePdf(invoice),raw=pdf.toString('latin1');
 assert.ok(pdf.length>1200);assert.match(raw,/^%PDF-1\.4/);
 assert.match(raw,/\/Type \/Catalog/);assert.match(raw,/xref\n0 7/);assert.match(raw,/%%EOF/);
 assert.match(raw,/PAYMENT INVOICE/);assert.match(raw,/ar_p_00000000-0000-4000-8000-000000000001/);
 assert.ok(raw.includes("Alice " + String.fromCharCode(92) + "(North" + String.fromCharCode(92) + ")"));assert.match(raw,/INR 499/);
 assert.match(raw,/not a GST tax invoice/);
 const off=Number(raw.match(/startxref\n(\d+)/)?.[1]||-1);
 assert.equal(raw.slice(off,off+4),'xref');
});
test('invoice numbering is stable and includes Indian financial year',()=>{
 assert.equal(invoiceLabel(invoice),'AR26-27-000026');
 assert.equal(invoiceLabel({...invoice,paid_at:'2027-02-14T01:00:00Z'}),'AR26-27-000026');
 assert.equal(invoiceLabel({...invoice,paid_at:'2027-04-01T01:00:00Z'}),'AR27-28-000026');
});
test('PDF text is escaped so customer input cannot inject PDF commands',()=>{
 const raw=generateInvoicePdf({...invoice,customer_name:'(q) \\ endobj'}).toString('latin1');
 assert.match(raw,/\\\(q\\\)/);assert.match(raw,/\\\\ endobj/);
});
test('invoices are owner-verified, server-generated and never issued on pending payments',()=>{
 const api=source('api/billing.ts'),svc=source('src/server/invoiceService.ts');
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/owner_user_id=eq\./);
 assert.match(svc,/order\.status!=='paid'/);
 assert.match(svc,/order\.environment!=='production'/);
 assert.match(svc,/order\.cf_payment_id/);
 assert.match(svc,/billing-invoice\//);
 assert.match(source('supabase/migrations/20261013_paid_order_invoices.sql'),/enable row level security/);
 assert.match(source('supabase/migrations/20261013_paid_order_invoices.sql'),/revoke all on public\.autoreply_billing_invoices from public,anon,authenticated/);
});
test('invoice appears below billing history and email is optional',()=>{
 const p=source('src/components/Billing/BillingUsagePage.tsx');
 assert.ok(p.indexOf('<InvoiceCenter />')>p.indexOf('<BillingHistory />'));
 const ui=source('src/components/Billing/InvoiceCenter.tsx');
 assert.match(ui,/Download PDF/);assert.match(ui,/Email invoice/);
 assert.match(source('src/server/invoiceService.ts'),/RESEND_FROM_EMAIL/);
});
test('typography raises old fixed sizes as well as rem and arbitrary sizes',()=>{
 const css=source('src/crisp-ui.css');
 assert.match(css,/html \{ font-size:18px/);
 assert.match(css,/\.text-xs \{ font-size:16px/);
 assert.match(css,/\.text-sm \{ font-size:17px/);
 assert.match(css,/\[class~="text-\[11px\]"\] \{font-size:13px!important;/);
 assert.match(css,/\.app-unified-theme \.text-xs \{ font-size:16px!important;/);
 assert.match(css,/\[class~="text-base"\]\{font-size:18px!important;/);
 assert.match(css,/@media\(min-width:640px\)\{/);
 assert.match(css,/\[class~="sm:text-\[38px\]"\]\{font-size:40px!important;/);
 assert.match(css,/\[class~="md:text-lg"\]\{font-size:20px!important;/);

});
