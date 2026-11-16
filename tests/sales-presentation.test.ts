import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSalesLayout,renderSalesTemplate,formatMobileSalesText,selectSalesLayoutAI,customerLanguage,type SalesProduct} from '../supabase/functions/instagram-live-webhook/salesPresentation';

const frame:SalesProduct={id:'frame02',name:'Floral Birthday Frame',style_number:'Style 02',price:'₹250',
 cod:'Available',delivery_time:'5–6 days • free delivery',customization:'Use your photos',
 description:'A floral birthday frame featuring your favourite memories.'};

test('all six smart text templates are selected from the correct customer intent',()=>{
 assert.equal(defaultSalesLayout('price kitna hai'),'price');
 assert.equal(defaultSalesLayout('Product ki photo'),'photo');
 assert.equal(defaultSalesLayout('all designs bhejo'),'gallery');
 assert.equal(defaultSalesLayout('मुझे ऑर्डर करना है'),'buying');
 assert.equal(defaultSalesLayout('Where is my order?'),'support');
 assert.equal(defaultSalesLayout('यह मेरा ऑर्डर कन्फर्म है?'),'general');
 assert.equal(defaultSalesLayout('Order confirmed',{verified:true,id:'ord-01'}),'order');
 assert.equal(customerLanguage('Product ki photo'),'hi');
});

test('price template uses saved facts and remains short, readable, and safe',()=>{
 const reply=renderSalesTemplate({layout:'price',product:frame,customerText:'kitna hai'});
 assert.match(reply,/₹250/);assert.match(reply,/Style 02/);
 assert.match(reply,/COD/);assert.match(reply,/5–6 days/);
 assert.doesNotMatch(reply,/Notes:|Customer photos needed|Extra order details/);
 assert.ok(new TextEncoder().encode(reply).length<900);
});

test('photo template does not hallucinate shipping, COD, stock, or discounts',()=>{
 const result=renderSalesTemplate({layout:'photo',product:{name:'Unknown Gift',price:'₹320'},language:'hi'});
 assert.match(result,/₹320/);
 assert.doesNotMatch(result,/COD|free delivery|फ्री डिलीवरी|available|in stock|10%/iu);
});

test('gallery template numbers different styles with each saved price',()=>{
 const products=Array.from({length:8},(_,i)=>({...frame,id:'style'+(i+1),style_number:'Style '+(i+1),price:'₹250'}));
 const msg=renderSalesTemplate({layout:'gallery',products,language:'hi'});
 for(let n=1;n<=8;n++)assert.ok(msg.includes(n+'. Style '+n));
 assert.equal((msg.match(/₹250/g)||[]).length,8);
 assert.doesNotMatch(msg,/staff notes|system prompt|Extra order details/);
});

test('buying template encourages gently and never claims an order is confirmed',()=>{
 const reply=renderSalesTemplate({layout:'buying',product:frame,language:'hi'});
 assert.match(reply,/ऑर्डर शुरू करें/);
 assert.doesNotMatch(reply,/ऑर्डर कन्फर्म हो गया|order confirmed|नाम,.*पता/i);
});

test('confirmed order layout requires an actual verified saved record',()=>{
 const unverified=renderSalesTemplate({layout:'order',product:frame,draft:'ऑर्डर की स्थिति जाँच रहे हैं।'});
 assert.equal(unverified,'ऑर्डर की स्थिति जाँच रहे हैं।');
 const verified=renderSalesTemplate({layout:'order',product:frame,language:'hi',order:{verified:true,id:'ORD-28',product_name:'Floral Birthday Frame',quantity:1,total:'₹250'}});
 assert.match(verified,/ORD-28/);
 assert.match(verified,/₹250/);
 assert.match(verified,/कन्फर्म/);
});

test('support template preserves useful actual AI reply without adding a sales pitch',()=>{
 assert.equal(renderSalesTemplate({layout:'support',draft:'We will check your existing order status.'}),'We will check your existing order status.');
});

test('secondary AI returns an enum only, never generated facts',async()=>{
 let calls=0;
 const result=await selectSalesLayoutAI({key:'test',customerText:'Does it make a nice present?',draft:'A thoughtful gift.',
  fetcher:async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.model,'gpt-4o-mini');
   assert.equal(body.response_format.type,'json_object');
   return Response.json({choices:[{message:{content:JSON.stringify({layout:'buying',price:'₹1',stock:999})}}]});
  }});
 assert.deepEqual(result,{layout:'buying',source:'secondary_ai'});assert.equal(calls,1);
});

test('secondary AI cannot override explicit price request and falls back on provider errors',async()=>{
 const price=await selectSalesLayoutAI({key:'test',customerText:'What is the price?',draft:'Price ₹250.',
  fetcher:async()=>Response.json({choices:[{message:{content:'{"layout":"general"}'}}]})});
 assert.equal(price.layout,'price');
 const fallback=await selectSalesLayoutAI({key:'test',customerText:'I might get a present',draft:'A nice gift',
  fetcher:async()=>Response.json({error:{message:'unavailable'}},{status:503})});
 assert.equal(fallback.source,'rules');assert.equal(fallback.layout,'general');
});

test('support requests are not sent to another AI or converted into sales templates',async()=>{
 let calls=0;
 const selection=await selectSalesLayoutAI({key:'test',customerText:'refund status',draft:'Checking.',
  fetcher:async()=>{calls++;throw Error('should not call');}});
 assert.equal(selection.layout,'support');assert.equal(calls,0);
});


test('mobile layout keeps facts intact and wraps only at word boundaries',()=>{
 const long='✨ Floral Birthday Frame with many lovely memories for a special occasion\n💰 कीमत: ₹250\n📦 COD उपलब्ध';
 const formatted=formatMobileSalesText(long,36);
 assert.ok(formatted.split('\n').filter(Boolean).every(line=>[...line].length<=36));
 assert.match(formatted,/Floral Birthday Frame/);
 assert.match(formatted,/₹250/);
 assert.match(formatted,/COD/);
 assert.doesNotMatch(formatted,/<br|<strong|\*\*/iu);
 const product=renderSalesTemplate({layout:'photo',product:frame,language:'hi'});
 assert.ok(product.split('\n').filter(Boolean).every(line=>[...line].length<=48));
});
test('explicit price and purchase requests skip expensive secondary model, while ambiguous intent can use it',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('secondary call not needed');};
 const price=await selectSalesLayoutAI({key:'fake',customerText:'price kitna hai',draft:'₹250',fetcher});
 const buying=await selectSalesLayoutAI({key:'fake',customerText:'I want to buy',draft:'Yes',fetcher});
 assert.deepEqual(price,{layout:'price',source:'rules'});
 assert.deepEqual(buying,{layout:'buying',source:'rules'});
 assert.equal(calls,0);
});
