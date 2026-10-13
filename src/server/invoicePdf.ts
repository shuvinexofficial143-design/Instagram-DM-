/** Creates a printable A4 customer payment invoice without browser exposure or extra dependencies.
 * NOTE: This is a non-GST payment document. Statutory GST tax invoicing requires
 * business GSTIN, SAC, place-of-supply and tax determination and is not implied.
 */
import { businessDetails } from './cashfree.js';

export type PaidInvoice={
  serial_number:number;order_id:string;customer_name:string;customer_email:string;
  plan_id:string;billing_days:number;amount_inr:number;paid_at:string;
  issued_at:string;payment_id:string;
};
export function invoiceLabel(row:PaidInvoice){
  const dt=new Date(row.paid_at);
  const year=dt.getUTCFullYear(),month=dt.getUTCMonth()+1;
  const fy=month>=4?year:year-1;
  return 'AR'+String(fy).slice(-2)+'-'+String(fy+1).slice(-2)+'-'+String(row.serial_number).padStart(6,'0');
}
function plain(value:unknown,max=96){
  return String(value??'').replace(/\r|\n|\t/g,' ').replace(/[^\x20-\x7E]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function pdfText(value:unknown,max=96){return plain(value,max).replace(/[\\()]/g,ch=>'\\'+ch);}
function formatDate(value:string){
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleDateString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}):'Not available';
}
function addressForPdf(value:string){
  if(value.includes('ग्राम बघेरा'))return 'Gram Baghera, Tehsil Tarana, District Ujjain, Madhya Pradesh, India';
  const str=plain(value,110);
  return str||'Billing address available from support';
}
/** Small server-generated vector PDF, no fonts fetched at runtime, no external asset URLs. */
export function generateInvoicePdf(invoice:PaidInvoice):Buffer{
  const business=businessDetails(),number=invoiceLabel(invoice);
  const commands:string[]=[];
  const color=(hex:string)=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n.toFixed(3)).join(' ');
  function text(x:number,y:number,value:unknown,size=11,bold=false,tint='172033',max=105){
    commands.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+color(tint)+' rg 1 0 0 1 '+x+' '+y+' Tm ('+pdfText(value,max)+') Tj ET');
  }
  function box(x:number,y:number,w:number,h:number,hex:string){
    commands.push(color(hex)+' rg '+x+' '+y+' '+w+' '+h+' re f');
  }
  function rule(y:number){box(46,y,503,1,'e2e8f0')}
  box(0,740,595,102,'fff7ed');
  box(46,765,43,43,'c2410c');text(55,781,'AR',19,true,'ffffff');
  text(101,790,plain(business.legalName,54)||'Auto Replies',22,true,'0f172a');
  text(101,770,'INSTAGRAM AUTOMATION',9,false,'9a3412');
  text(46,710,'PAYMENT INVOICE',25,true,'0f172a');
  text(46,689,'Verified one-time plan purchase / payment receipt',10,false,'64748b');
  text(395,708,number,12,true,'c2410c');
  rule(670);
  text(46,648,'ISSUED BY',10,true,'c2410c');
  text(46,625,business.legalName,12,true);
  const address=addressForPdf(business.address);
  text(46,603,address.slice(0,70),9,false,'475569');
  if(address.length>70)text(46,589,address.slice(70),9,false,'475569');
  text(46,572,business.email,10,false,'475569');
  text(46,556,business.phone,10,false,'475569');
  text(324,648,'BILLED TO',10,true,'c2410c');
  text(324,625,invoice.customer_name||'Customer',12,true);
  text(324,606,invoice.customer_email,10,false,'475569');
  text(324,580,'Invoice date: '+formatDate(invoice.issued_at),10);
  text(324,563,'Payment date: '+formatDate(invoice.paid_at),10);
  rule(540);
  text(46,517,'PAYMENT INFORMATION',10,true,'c2410c');
  text(46,495,'Order reference',10,false,'64748b');
  text(190,495,invoice.order_id,10,true,'334155',50);
  text(46,474,'Cashfree payment ID',10,false,'64748b');
  text(190,474,invoice.payment_id,10,true,'334155',50);
  text(46,453,'Payment status',10,false,'64748b');
  text(190,453,'PAID - VERIFIED',10,true,'15803d');
  box(46,392,503,37,'f1f5f9');
  text(60,406,'SERVICE / PLAN',11,true);
  text(418,406,'AMOUNT',11,true);
  text(60,369,invoice.plan_id.toUpperCase()+' plan - '+invoice.billing_days+' days',12,true);
  text(433,369,'INR '+Number(invoice.amount_inr).toLocaleString('en-IN'),12,true);
  rule(350);
  text(290,323,'TOTAL COLLECTED',12,true,'334155');
  text(432,323,'INR '+Number(invoice.amount_inr).toLocaleString('en-IN'),15,true,'c2410c');
  box(46,218,503,76,'fff7ed');
  text(60,272,'IMPORTANT TAX NOTE',10,true,'9a3412');
  text(60,253,'Payment record only; not a GST tax invoice.',10,false,'7c2d12');
  text(60,236,'For a statutory GST tax invoice, contact support with billing details.',9,false,'7c2d12');
  rule(170);
  text(46,148,'This invoice confirms a successful payment, not automatic future renewal.',9,false,'64748b');
  text(46,132,'Payments and refunds are governed by the published billing terms.',9,false,'64748b');
  text(46,104,'Support: '+plain(business.email,75),9,false,'475569');
  text(46,72,'Auto Replies  |  Securely issued for '+number,9,false,'94a3b8');

  const stream=commands.join('\n')+'\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Length '+Buffer.byteLength(stream,'utf8')+' >>\nstream\n'+stream+'endstream'
  ];
  let pdf='%PDF-1.4\n%AutoReplies\n';const positions=[0];
  for(let i=0;i<objects.length;i++){
    positions.push(Buffer.byteLength(pdf,'utf8'));
    pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const start=Buffer.byteLength(pdf,'utf8');
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<positions.length;i++)pdf+=String(positions[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
  return Buffer.from(pdf,'utf8');
}
