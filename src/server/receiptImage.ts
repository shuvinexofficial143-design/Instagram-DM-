/** Dependency-free PNG receipt card for inline emails. All pixels are server-rendered. */
import {deflateSync} from 'node:zlib';
import {invoiceLabel,type PaidInvoice} from './invoicePdf.js';

const glyphs:Record<string,string[]>={
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
 G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
 I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],
 K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
 Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],
 S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
 U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],
 W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],
 Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10011','10101','10101','11001','10001','01110'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],
 '5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01111','10000','10000','11110','10001','10001','01110'],
 '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],
 '9':['01110','10001','10001','01111','00001','00001','11110'],
 ' ':['00000','00000','00000','00000','00000','00000','00000'],
 '-':['00000','00000','00000','11111','00000','00000','00000'],
 ':':['00000','00100','00100','00000','00100','00100','00000'],
 '.':['00000','00000','00000','00000','00000','01100','01100'],
 '/':['00001','00001','00010','00100','01000','10000','10000'],
 '+':['00000','00100','00100','11111','00100','00100','00000'],
 '(' : ['00010','00100','01000','01000','01000','00100','00010'],
 ')' : ['01000','00100','00010','00010','00010','00100','01000'],
 '#':['01010','01010','11111','01010','11111','01010','01010']
};
const W=900,H=510;type Color=[number,number,number];
function crc32(data:Buffer){let crc=0xffffffff;for(const n of data){crc^=n;for(let j=0;j<8;j++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return (crc^0xffffffff)>>>0;}
function chunk(tag:string,body:Buffer){const type=Buffer.from(tag);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,body])));const size=Buffer.alloc(4);size.writeUInt32BE(body.length);return Buffer.concat([size,type,body,crc]);}
function formatDate(s:string){const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).toUpperCase():'CHECK BILLING';}
export function generateReceiptPng(invoice:PaidInvoice,expiry?:string|null):Buffer{
 const pixels=Buffer.alloc(W*H*3,255);
 const ink:Color=[15,23,42],orange:Color=[194,65,12],muted:Color=[100,116,139],white:Color=[255,255,255];
 function rect(x:number,y:number,w:number,h:number,c:Color){for(let yy=Math.max(0,y);yy<Math.min(H,y+h);yy++){for(let xx=Math.max(0,x);xx<Math.min(W,x+w);xx++){const i=(yy*W+xx)*3;pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];}}}
 function label(x:number,y:number,value:string,size=3,c:Color=ink){
  let off=0;
  for(const ch of value.toUpperCase().slice(0,58)){
   const rows=glyphs[ch]||glyphs[' '];
   for(let row=0;row<rows.length;row++)for(let col=0;col<5;col++)if(rows[row][col]==='1')rect(x+off+col*size,y+row*size,size,size,c);
   off+=size*6;if(x+off>W-28)break;
  }
 }
 rect(0,0,W,126,[255,247,237]);rect(35,33,66,65,orange);
 label(43,49,'AR',5,white);
 label(128,40,'AUTO REPLIES',5,ink);
 label(129,84,'PAYMENT CONFIRMED',2,orange);
 label(40,157,'THANK YOU FOR YOUR PURCHASE',3,ink);
 rect(38,204,824,2,[226,232,240]);
 label(42,228,'PLAN',3,muted);
 label(42,265,invoice.plan_id+' - '+invoice.billing_days+' DAYS',4,ink);
 label(550,228,'AMOUNT PAID',3,muted);
 label(550,265,'INR '+invoice.amount_inr,5,orange);
 rect(38,322,824,2,[226,232,240]);
 label(42,346,'PAID ON: '+formatDate(invoice.paid_at),3,ink);
 label(42,377,'ACCESS UNTIL: '+(expiry?formatDate(expiry):'SEE BILLING'),3,ink);
 label(42,419,'INVOICE: '+invoiceLabel(invoice),3,orange);
 label(42,472,'AUTO REPLIES - SECURE PAYMENT RECEIPT',2,muted);
 const raw=Buffer.alloc(H*(1+W*3));
 for(let y=0;y<H;y++){raw[y*(1+W*3)]=0;pixels.copy(raw,y*(1+W*3)+1,y*W*3,(y+1)*W*3);}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
