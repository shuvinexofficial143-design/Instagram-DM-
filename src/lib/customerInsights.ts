export type CustomerStage='new'|'ready'|'interested'|'low'|'customer'|'repeat'|'support';
export type CustomerInsight={id?:string;stage:CustomerStage;priority:'high'|'normal'|'low';reason:string;summary?:string;next_step?:string;source:'automatic'|'manual';updated_at?:string;fields?:Record<string,string>};
export const customerStages:Record<CustomerStage,{label:string;color:string}>={
 new:{label:'New lead',color:'bg-slate-100 text-slate-600'},ready:{label:'Ready to buy',color:'bg-orange-100 text-orange-800'},interested:{label:'Interested',color:'bg-blue-100 text-blue-800'},low:{label:'Low interest',color:'bg-slate-100 text-slate-600'},customer:{label:'Confirmed customer',color:'bg-emerald-100 text-emerald-800'},repeat:{label:'Repeat customer',color:'bg-green-100 text-green-800'},support:{label:'Needs support',color:'bg-rose-100 text-rose-800'}};
export function inferCustomerInsight(text:string,previous?:CustomerInsight):CustomerInsight {
 if(previous?.source==='manual')return previous;
 const value=text.toLowerCase();let stage:CustomerStage=previous?.stage || 'new',priority:CustomerInsight['priority']=previous?.priority || 'normal',reason=previous?.reason || 'No clear purchase intent yet';
 if(/refund|complaint|not delivered|wrong product|bad service|disappointed|शिकायत|रिफंड|खराब|नहीं मिला/.test(value)){stage='support';priority='high';reason='Customer mentioned a complaint or refund';}
 else if(/not interested|no thanks|too expensive|नहीं चाहिए|नहीं खरीद|महंगा|महँगा/.test(value)){stage='low';priority='low';reason='Customer declined or raised a price objection';}
 else if(/payment link|how to pay|place (?:an )?order|want to buy|buy now|ऑर्डर करना|खरीदना है|पेमेंट लिंक|भुगतान कैसे/.test(value)){stage='ready';priority='high';reason='Customer asked about ordering or payment';}
 else if(/price|cost|available|details|delivery|कीमत|प्राइस|उपलब्ध|जानकारी|डिलीवरी/.test(value) && stage!=='support' && stage!=='ready'){stage='interested';priority='normal';reason='Customer asked for product or service details';}
 return {stage,priority,reason,source:'automatic',summary:text.slice(0,240),next_step:stage==='support'?'Review and resolve the complaint':stage==='ready'?'Help the customer complete the order':stage==='low'?'Address the concern without pushing': 'Answer questions and follow up',updated_at:new Date().toISOString()};
}
