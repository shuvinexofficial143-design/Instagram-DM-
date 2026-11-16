import test from 'node:test';
import assert from 'node:assert/strict';
import {proactiveCatalogSelection,cleanCatalogDisplayName,catalogMessage,generateCatalogReply,type RuntimeCatalog} from '../supabase/functions/instagram-live-webhook/catalogRuntime';

const frame=(i:number)=>({id:'frame-'+i,name:'Style-'+String(i).padStart(2,'0')+'-Birthday-Frame.png',style_number:'Style '+i,price:'₹250',description:'Custom photo frame',url:'',images:['https://example.com/frame-'+i+'.jpg'],collection_name:'Photo Frame',customization:'Add customer photo'});
const pearl={id:'pearl',name:'Love Pearl',style_number:'',price:'₹360',description:'Pendant',url:'',images:['https://example.com/pearl.jpg'],collection_name:'Love Pearl'};
const catalog:RuntimeCatalog={id:'all',name:'All products',products:[pearl,...[8,6,2,7,4,1,5,3].map(frame)],delivery_style:'cards'};

test('proactive sales gallery prioritizes saved product group, orders styles and cleans filenames',()=>{
 const selected=proactiveCatalogSelection(catalog,'Price please',[],[],'','Photo Frame');
 assert.ok(selected);
 assert.equal(selected.products.length,8);
 assert.deepEqual(selected.products.map(p=>p.style_number),[1,2,3,4,5,6,7,8].map(n=>'Style '+n));
 assert.equal(selected.elements?.length,8);
 assert.equal(selected.delivery_style,'photos_ai');
 assert.match(catalogMessage(selected),/Style 7 — Birthday Frame \| ₹250/);
 assert.doesNotMatch(catalogMessage(selected),/Style Style|\.png/i);
 assert.match(catalogMessage(selected),/कस्टमाइज/);
});
test('an Instagram ad reference limits proactive gallery to the relevant product',()=>{
 const selected=proactiveCatalogSelection(catalog,'price?',[],[],'pearl','Photo Frame');
 assert.deepEqual(selected?.products.map(p=>p.id),['pearl']);
});
test('recent photos, generic greetings, checkout, complaints and uninterested customers do not trigger repeats',()=>{
 assert.equal(proactiveCatalogSelection(catalog,'Price please',[],['https://example.com/frame-1.jpg']),null);
 for(const s of ['Hi','order status','not interested','रिफंड चाहिए','मत भेजो']) assert.equal(proactiveCatalogSelection(catalog,s),null);
 assert.equal(proactiveCatalogSelection(catalog,'Price?', [{role:'assistant',content:'Your order confirmed'}],[]),null);
});
test('specific design references remain with the AI instead of sending whole gallery',()=>{
 const two:RuntimeCatalog={...catalog,products:[{...frame(1),name:'Red Heart Frame'},{...frame(2),name:'Blue Round Frame'}]};
 assert.equal(proactiveCatalogSelection(two,'Show red frame photos'),null);
});
test('a buyer who says yes after a design offer receives pictures, while support stays text-only',()=>{
 const selection=proactiveCatalogSelection(catalog,'हाँ',[{role:'assistant',content:'आपको कौन-सा डिज़ाइन पसंद है?'}],[],'','Photo Frame');
 assert.equal(selection?.products.length,8);
 assert.equal(proactiveCatalogSelection(catalog,'my order is late'),null);
});
test('verified follow pricing is derived from approved saved price, not from customer claims',async()=>{
 const result=await generateCatalogReply({key:'test',systemPrompt:'Priority Product: Photo Frame',history:[],text:'Price?',catalog,
  followStatus:true,followDiscountPercent:10,fetcher:async()=>{throw Error('Proactive gallery must not need AI call')}});
 assert.match(result.catalog?.products[0].price||'',/₹225/);
 assert.match(result.catalog?.products[0].price||'',/₹250/);
 const unverified=await generateCatalogReply({key:'test',systemPrompt:'Priority Product: Photo Frame',history:[],text:'Price?',catalog,
  followStatus:null,followDiscountPercent:10,fetcher:async()=>{throw Error('No AI call')}});
 assert.equal(unverified.catalog?.products[0].price,'₹250');
});
test('blank variant price continues to inherit parent price',()=>{
 assert.equal(cleanCatalogDisplayName('Style-07-Fairy-Memories-Frame.png','Style 7'),'Fairy Memories Frame');
});
