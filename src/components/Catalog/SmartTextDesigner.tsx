import React,{useState} from 'react';
import { BadgeCheck, MessageCircle, Palette, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import {renderSalesTemplate,type SalesLayout,type SalesProduct} from '../../../supabase/functions/instagram-live-webhook/salesPresentation';

/** Visual styling only: the literal message text is the source of truth.
 * No HTML from customers or the AI is interpreted as markup.
 */
export function SmartMessageRenderer({text,compact=false}:{text:string;compact?:boolean}){
 const lines=String(text||'').split(/\r?\n/u).map(value=>value.trim()).filter(Boolean);
 if(!lines.length)return null;
 const styled=lines.some(value=>/^[✨📸💰📦🚚💖💝🎁🧾✅🌟😊]/u.test(value));
 if(!styled)return <p className="max-w-full whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{text}</p>;
 return <div className={'min-w-0 max-w-full space-y-1.5 break-words [overflow-wrap:anywhere] '+(compact?'text-sm':'text-sm')} aria-label="Formatted business reply">
  {lines.map((line,i)=>{
   const isHeading=i===0||/^[✨📸💝✅]/u.test(line);
   const isPrice=/^[💰]/u.test(line);
   const isPolicy=/^[📦🚚]/u.test(line);
   const isAction=/^[🎁😊]/u.test(line);
   return <p key={i} className={
     'whitespace-pre-wrap break-words leading-[1.5] '+
     (isHeading?'font-semibold text-slate-900 ':isPrice?'font-extrabold text-base sm:text-lg text-slate-950 ':
      isPolicy?'rounded-lg bg-slate-100/80 px-2.5 py-1.5 text-slate-700 ':
      isAction?'rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 font-medium text-indigo-900 ':'text-slate-700 ')
   }>{line}</p>;
  })}
 </div>;
}
const names:{id:SalesLayout;name:string;emoji:string;helper:string}[]=[
 {id:'price',name:'Price',emoji:'💰',helper:'Price, delivery & COD'},
 {id:'photo',name:'Photo',emoji:'📸',helper:'Style with short caption'},
 {id:'gallery',name:'Gallery',emoji:'🎨',helper:'Numbered choices'},
 {id:'buying',name:'Buying',emoji:'🎁',helper:'Helpful purchase invitation'},
 {id:'order',name:'Order',emoji:'✅',helper:'Verified orders only'},
 {id:'support',name:'Support',emoji:'💬',helper:'Help without a sales pitch'},
];
export function SmartTextDesigner({products}:{products:SalesProduct[]}){
 const [chosen,setChosen]=useState<SalesLayout>('price');
 const [language,setLanguage]=useState<'hi'|'en'>('hi');
 const product=products.find(p=>Boolean(p.name))||null;
 const order=chosen==='order'?{verified:true as const,product_name:product?.name||'Your selected product',
  total:product?.price||'',quantity:1}:null;
 const draft=chosen==='support'?(language==='hi'?'💬 आपके सवाल को समझ रहा हूँ। ऑर्डर की जानकारी जाँचने के लिए आपकी मदद करेंगे।':'💬 We can help with your request. We will check the available order details.'):
  'Your product details will appear here.';
 const presentation=renderSalesTemplate({
  layout:chosen,product,products:products.filter(p=>Boolean(p.name)).slice(0,10),
  order,language,draft
 });
 return <section className="space-y-3 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3.5 sm:p-4" aria-label="Smart text designer preview">
   <header className="flex items-start gap-2.5">
     <span className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><Palette className="h-4 w-4"/></span>
     <div className="min-w-0">
       <h3 className="text-sm font-bold text-slate-950">Smart Text Designer</h3>
       <p className="mt-1 text-xs leading-5 text-slate-500">Secondary AI chooses a sales layout in the live chat. Templates use saved catalog facts.</p>
     </div>
   </header>
   <div role="group" aria-label="Message template" className="flex snap-x gap-2 overflow-x-auto pb-1">
    {names.map(item=><button key={item.id} type="button" aria-pressed={chosen===item.id} onClick={()=>setChosen(item.id)}
     className={'shrink-0 snap-start rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors '+
       (chosen===item.id?'border-indigo-500 bg-indigo-600 text-white shadow-sm':'border-slate-200 bg-white text-slate-700 hover:border-indigo-300')}>
     <span className="mr-1">{item.emoji}</span>{item.name}
    </button>)}
   </div>
   <div className="flex items-center justify-between gap-3">
    <p className="text-xs text-slate-500">{names.find(item=>item.id===chosen)?.helper}</p>
    <div className="flex gap-1" role="group" aria-label="Preview language">
      {(['hi','en'] as const).map(lang=><button key={lang} type="button" onClick={()=>setLanguage(lang)}
       aria-pressed={language===lang}
       className={'rounded-lg border px-2 py-1 text-xs font-semibold '+(language===lang?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 bg-white text-slate-500')}>
        {lang==='hi'?'हिंदी':'English'}
      </button>)}
    </div>
   </div>
   <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
     <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 text-[11px] font-semibold text-slate-500">
       <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5"/>Instagram message preview</span>
       <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5"/>Dynamic layout</span>
     </div>
     {chosen==='order'&&<p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
       Demo only. A live order-confirmation template is allowed only after a verified saved order.
     </p>}
     <SmartMessageRenderer text={presentation}/>
   </div>
   <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
    <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5"/>Facts from your catalog</span>
    <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5"/>No invented order</span>
    <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5"/>Only saved delivery promises</span>
   </div>
 </section>;
}
