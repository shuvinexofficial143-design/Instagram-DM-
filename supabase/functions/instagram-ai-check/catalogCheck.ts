import {generateCatalogReply,type RuntimeCatalog} from '../instagram-live-webhook/catalogRuntime.ts';
import {catalogFixtures as images} from './catalogFixtures.ts';
export async function checkCatalogProvider(key:string){
 const product=(id:string,style_number:string,image:string,position:number)=>({id,name:id+' photo frame',style_number,price:'₹250',description:'Custom gift frame',url:'',images:[image],cod:'Available',delivery_time:'5–7 days',post_refs:[{post_id:'synthetic-post',position}]});
 const catalog:RuntimeCatalog={id:'synthetic',name:'Synthetic frames',delivery_style:'photos_details',products:[product('heart','07',images.heart,7),product('round','08',images.round,8)]};
 const cases=[{id:'style',text:'Style 07 दिखाओ',expected:'heart'}, {id:'post-order',text:'सातवाँ फ्रेम दिखाओ',expected:'heart',postId:'synthetic-post'}, {id:'screenshot',text:'इस डिज़ाइन की एक फोटो दिखाओ',images:[images.screenshot],expected:'heart'}, {id:'blur',text:'यह डिज़ाइन चाहिए',images:[images.blur],expected:''}, {id:'multiple-images',text:'इन दोनों डिज़ाइन की एक-एक फोटो दिखाओ',images:[images.screenshot,images.roundScreenshot],expected:'heart,round'}, {id:'returning-customer',text:'hi',history:[{role:'user',content:'I want Style 07. My name is Arun.'},{role:'assistant',content:'आपका heart frame का order request मिला है। राज्य बाकी है।'}],expected:''}];
 const results=[];
 for(const scenario of cases){
  const started=Date.now();let calls=0;
  const result=await generateCatalogReply({key,catalog,systemPrompt:'Help the customer choose a saved design. Answer in Hindi. Reuse the existing conversation. Ask only the missing detail. Never confirm placement or invent policies.',history:scenario.history||[],text:scenario.text,images:scenario.images,postId:scenario.postId,timeoutMs:12000,onUsage:usage=>{calls+=usage.calls||0;}});
  const selected=(result.catalog?.products||[]).map(p=>p.id).sort().join(',');
  results.push({id:scenario.id,passed:selected===scenario.expected,selected,photo_count:result.catalog?.elements?.length||0,calls,ms:Date.now()-started,reply:result.text,warning:result.warning||''});
 }
 return {ok:results.every(r=>r.passed),synthetic:true,no_customer_messages_sent:true,results};
}
