import assert from 'node:assert/strict';
import test from 'node:test';
import {generateCatalogReply,resolveCatalogReference,catalogContext,catalogDeliveryParts,catalogProductMetadata,recognizeCatalogImages,type RuntimeCatalog} from '../supabase/functions/instagram-live-webhook/catalogRuntime';
import {normalizeInstagramAdSource,matchInstagramAdProduct,mediaReferenceKey} from '../supabase/functions/instagram-live-webhook/adAttribution';
const frame=(id:string,style_number:string)=>({id,name:id+' frame',style_number,price:'₹250',description:'Custom photo frame',url:'',images:['https://images.example/'+id+'.jpg','https://images.example/'+id+'-side.jpg'],cod:'Available',delivery_time:'5–7 days',customization:'Customer photo',availability:'White only',post_refs:[{post_id:'post-a',position:7}]});
const catalog:RuntimeCatalog={id:'frames',name:'Frames',delivery_style:'photos_details',products:[frame('heart','07'),{...frame('round','08'),post_refs:[{post_id:'post-b',position:7}]}]};
const answer=(content:any)=>Response.json({choices:[{message:typeof content==='string'?{content}:{content:JSON.stringify(content)}}]});
const match=(product_id='heart',image_index=0,input_index=0,confidence=0.99)=>({product_id,image_index,input_index,confidence,distinctive:true,ambiguous:false});
const photoTool=()=>Response.json({choices:[{message:{tool_calls:[{id:'photos',function:{name:'send_product_photos',arguments:JSON.stringify({selections:[{product_id:'heart',image_indexes:[0]}]})}}]}}]});
const visionAnswer=(init:any,content:any)=>JSON.parse(String(init?.body)).response_format?answer(content):photoTool();
const base={fetcher:async()=>photoTool(),key:'test',catalog,systemPrompt:'Sell frames',history:[],text:'Style 07 दिखाओ'};
test('Style Numbers normalize leading zeroes and Hindi digits without using product order',()=>{
 for(const text of ['Style 07 दिखाओ','style #7','स्टाइल ०७ चाहिए'])assert.equal(resolveCatalogReference(catalog,text).products[0].id,'heart');
 assert.equal(resolveCatalogReference(catalog,'Style 999').ambiguous,true);
 assert.equal(resolveCatalogReference({...catalog,products:[...catalog.products,frame('duplicate','007')]},'Style 07').ambiguous,true);
 assert.equal(resolveCatalogReference(catalog,'I want 2 frames').requested,false);
});
test('seventh frame uses saved post mappings and asks when multiple posts disagree',()=>{
 assert.equal(resolveCatalogReference(catalog,'सातवाँ फ्रेम चाहिए').ambiguous,true);
 assert.equal(resolveCatalogReference(catalog,'सातवाँ फ्रेम चाहिए','post-a').products[0].id,'heart');
 assert.equal(resolveCatalogReference(catalog,'show seventh frame','post-b').products[0].id,'round');
 const byURL={...catalog,products:[{...frame('heart','07'),post_refs:[{post_id:'https://www.instagram.com/p/abc/',position:7}]}]};
 assert.equal(resolveCatalogReference(byURL,'7th frame https://instagram.com/p/abc/').products[0].id,'heart');
 assert.equal(resolveCatalogReference({...catalog,products:[{...frame('heart','07'),post_refs:[]}]},'seventh frame').ambiguous,true);
});
test('explicit Style Number sends one photo with authoritative details and no vision call',async()=>{
 let calls=0;const result=await generateCatalogReply({...base,fetcher:async(_url,init)=>{calls++;assert.equal(JSON.parse(String(init?.body)).response_format,undefined);return photoTool();}});
 assert.equal(calls,1);assert.equal(result.catalog?.elements?.length,1);assert.equal(result.catalog?.products[0].id,'heart');
 const parts=catalogDeliveryParts(result.catalog!);assert.equal(parts[0].message.attachment.payload.url,catalog.products[0].images[0]);assert.match(parts.at(-1)?.text||'',/₹250/);assert.match(parts.at(-1)?.text||'',/COD: Available/);assert.match(parts.at(-1)?.text||'',/5–7 days/);
});
test('ambiguous Style Number and post order never send guessed catalog photos',async()=>{
 for(const text of ['Style 99 दिखाओ','सातवाँ फ्रेम चाहिए']){
  const result=await generateCatalogReply({...base,text,fetcher:async()=>{throw Error('Unexpected call');}});assert.equal(result.catalog,undefined);assert.match(result.text||'',/स्पष्ट|Style/);
 }
});
test('blurred or low confidence photos require confirmation even when the model proposes a product',async()=>{
 for(const item of [{...match(),confidence:0.7},{...match(),ambiguous:true},{...match(),distinctive:false}]){
  const result=await generateCatalogReply({...base,text:'यह चाहिए',images:['https://images.example/blur.jpg'],fetcher:async()=>answer({matches:[item]})});assert.equal(result.catalog,undefined);assert.match(result.text||'',/स्पष्ट/);
 }
});
test('near identical designs are ambiguous and duplicate reference photos cannot prove a unique product',async()=>{
 const run=(c:RuntimeCatalog,matches:any[])=>generateCatalogReply({...base,catalog:c,text:'यह चाहिए',images:['https://images.example/customer.jpg'],fetcher:async()=>answer({matches})});
 assert.equal((await run(catalog,[match(),match('round',0,0,0.96)])).catalog,undefined);
 assert.equal((await run({...catalog,products:[catalog.products[0],{...catalog.products[1],images:[catalog.products[0].images[0]]}]},[match()])).catalog,undefined);
});
test('every catalog photo is compared, including alternate views beyond the first six products',async()=>{
 const large={...catalog,products:Array.from({length:15},(_,i)=>({...frame('p'+i,String(i)),post_refs:[]}))};const seen=new Set<string>();let calls=0;
 const result=await generateCatalogReply({...base,catalog:large,text:'यह चाहिए',images:['https://images.example/customer.jpg'],fetcher:async(_url,init)=>{
  calls++;const request=JSON.parse(String(init?.body));if(!request.response_format)return photoTool();const content=request.messages[1].content;for(const item of content)if(item.image_url)seen.add(item.image_url.url);
  return answer({matches:content.some((item:any)=>item.image_url?.url===large.products[14].images[1])?[match('p14',1)]:[]});
 }});assert.equal(calls,4);assert.equal(seen.size,31);assert.equal(result.catalog?.elements?.length,1);assert.equal(result.catalog?.elements?.[0].image_url,large.products[14].images[1]);
});
test('a failed comparison batch or excessive gallery never reports a completed unique match',async()=>{
 const large={...catalog,products:Array.from({length:7},(_,i)=>frame('p'+i,String(i)))};let calls=0;
 const result=await generateCatalogReply({...base,catalog:large,text:'यह चाहिए',images:['https://images.example/customer.jpg'],fetcher:async()=>++calls===1?answer({matches:[match('p0')]}):Response.json({error:{}},{status:503})});assert.equal(result.catalog,undefined);
 const tooLarge={...catalog,products:Array.from({length:61},(_,i)=>frame('p'+i,String(i)))};
 assert.equal((await recognizeCatalogImages(tooLarge,['https://images.example/customer.jpg'],async()=>{throw Error('Do not call');})).certain,false);
});
test('multiple customer photos identify each requested product once and keep one image per design',async()=>{
 const result=await generateCatalogReply({...base,text:'ये दोनों चाहिए',images:['https://images.example/a.jpg','https://images.example/b.jpg'],fetcher:async(_url,init)=>visionAnswer(init,{matches:[match('heart'),match('round',1,1)]})});
 assert.equal(result.catalog?.products.length,2);assert.equal(result.catalog?.elements?.length,2);
});
test('a screenshot contradicting a typed Style Number requires confirmation',async()=>{
 const result=await generateCatalogReply({...base,images:['https://images.example/customer.jpg'],fetcher:async()=>answer({matches:[match('round')]})});assert.equal(result.catalog,undefined);assert.match(result.text||'',/अलग/);
});
test('recent confirmed photos are not sent twice, but an explicit resend is honored',async()=>{
 const recentPhotoUrls=[catalog.products[0].images[0]];
 const result=await generateCatalogReply({...base,recentPhotoUrls});assert.equal(result.catalog,undefined);assert.match(result.text||'',/ऊपर/);assert.match(result.text||'',/₹250/);
 assert.equal((await generateCatalogReply({...base,text:'Style 07 फिर से भेजो',recentPhotoUrls})).catalog?.elements?.length,1);
});
test('returning customer greeting keeps conversation continuity and cannot send a catalog',async()=>{
 const result=await generateCatalogReply({...base,text:'hi',history:[{role:'user',content:'Style 07 चाहिए'},{role:'assistant',content:'आपका order request मिल गया है, राज्य बाकी है।'}],fetcher:async()=>answer('आपकी पिछली जानकारी मिल गई है। कृपया राज्य बता दीजिए।')});assert.equal(result.catalog,undefined);assert.match(result.text||'',/राज्य/);
});
test('metadata exposes only saved policy facts and preserves legacy products',()=>{
 const legacy={id:'old',name:'Old',price:'',description:'',url:'',images:[]};const values=catalogContext({...catalog,products:[legacy]},'old').products[0];assert.equal(values.cod,'');assert.equal(values.delivery_time,'');assert.equal(values.style_number,'');
 assert.equal(catalogProductMetadata({post_refs:[{post_id:'post',position:0}]}).post_refs?.length,0);
});
test('unrequested extra photos in model tools are reduced to a single approved view',async()=>{
 const result=await generateCatalogReply({...base,text:'Show heart frame',fetcher:async()=>Response.json({choices:[{message:{tool_calls:[{id:'photo',function:{name:'send_product_photos',arguments:JSON.stringify({selections:[{product_id:'heart',image_indexes:[0,1]},{product_id:'round',image_indexes:[0]}]})}}]}}]})});assert.equal(result.catalog?.elements?.length,1);assert.equal(result.catalog?.products.length,1);
});

test('more than five customer images asks for a smaller batch without silently dropping images',async()=>{
 let calls=0;const result=await generateCatalogReply({...base,images:Array.from({length:6},(_,i)=>'https://images.example/input'+i+'.jpg'),fetcher:async()=>{calls++;throw Error('Unexpected call');}});assert.equal(calls,0);assert.equal(result.catalog,undefined);assert.match(result.text||'',/पाँच/);
});

test('resolved designs still respect business prompt human handoff decisions',async()=>{
 const result=await generateCatalogReply({...base,systemPrompt:'Hand off photo requests to staff.',fetcher:async(_url,init)=>{assert.match(JSON.parse(String(init?.body)).messages[0].content,/Hand off photo requests/);return Response.json({choices:[{message:{tool_calls:[{id:'staff',function:{name:'handoff_to_human',arguments:'{"reason":"prompt_rule","summary":"Staff handles design requests"}'}}]}}]});}});assert.equal(result.handoff?.reason,'prompt_rule');assert.equal(result.catalog,undefined);
});
test('explicit front and back requests retain the requested views of the resolved product',async()=>{
 const result=await generateCatalogReply({...base,text:'Show Style 07 front and back photos',fetcher:async()=>Response.json({choices:[{message:{tool_calls:[{id:'photos',function:{name:'send_product_photos',arguments:JSON.stringify({selections:[{product_id:'heart',image_indexes:[0,1]}]})}}]}}]})});assert.equal(result.catalog?.elements?.length,2);assert.equal(result.catalog?.products.length,1);
});

test('signed Meta referral fields are sanitized; a mere view is never attributed',()=>{
 assert.equal(normalizeInstagramAdSource(null),null);
 assert.equal(normalizeInstagramAdSource({source:'ADS'}),null);
 assert.deepEqual(normalizeInstagramAdSource({ad_id:'1200123456789',ads_context_data:{post_id:'18001234'},source:'ADS'}),{ad_id:'1200123456789',media_id:'18001234',source:'ADS'});
 assert.equal(normalizeInstagramAdSource({ad_id:'unsafe!!'}),null);
 assert.equal(mediaReferenceKey('https://www.instagram.com/reel/AbCdEf/?utm_source=test'),'abcdef');
});
test('source mapping prefers exact Ad ID, handles Reel links and rejects ambiguous products',()=>{
 const products=[{id:'frame',ad_refs:['12001'],reel_refs:['https://www.instagram.com/reel/FrameOne/']},
  {id:'necklace',ad_refs:['12002'],reel_refs:['https://www.instagram.com/reel/NecklaceTwo/']}];
 assert.equal(matchInstagramAdProduct(products,{ad_id:'12002',media_id:'https://www.instagram.com/reel/FrameOne/'}).product?.id,'necklace');
 assert.equal(matchInstagramAdProduct(products,{media_id:'frameone'}).product?.id,'frame');
 assert.equal(matchInstagramAdProduct(products,{ad_id:'9999'}).status,'none');
 assert.equal(matchInstagramAdProduct([...products,{id:'duplicate',ad_refs:['12001']}],{ad_id:'12001'}).status,'ambiguous');
 assert.equal(matchInstagramAdProduct(products,null).status,'none');
});
test('catalog metadata retains safe ad mapping and remains backward compatible',()=>{
 const saved=catalogProductMetadata({ad_refs:['12000123','12000123','bad!'],reel_refs:['https://www.instagram.com/reel/AbC/','javascript:bad'],name:'Frame'});
 assert.deepEqual(saved.ad_refs,['12000123']);
 assert.deepEqual(saved.reel_refs,['https://www.instagram.com/reel/AbC/']);
 assert.deepEqual(catalogProductMetadata({}).ad_refs,[]);
});
test('a unique ad referral prioritizes its product in AI context without replacing the master prompt',async()=>{
 const products=[...catalog.products.map((p,i)=>({...p,ad_refs:[i===0?'12001':'12002']}))];
 let calls=0;
 const result=await generateCatalogReply({...base,catalog:{...catalog,products},text:'Hi',adSource:{ad_id:'12002',source:'ADS'},fetcher:async(_url,init)=>{
  calls++;const payload=JSON.parse(String(init?.body));
  assert.match(payload.messages[0].content,/Sell frames/);
  assert.match(payload.messages[0].content,/Meta-reported product source DATA/);
  assert.match(payload.messages[0].content,/"ad_id":"12002"/);
  const data=payload.messages[0].content.match(/Current approved catalog DATA: (\{[^\n]+\})/);
  assert.equal(JSON.parse(data?.[1]||'{}').products[0].id,'round');
  return answer('Hello! Are you interested in the round frame?');
 }});
 assert.equal(calls,1);
 assert.match(result.text||'',/round frame/);
});
test('an ambiguous ad mapping is never presented as a unique product attribution',async()=>{
 const products=catalog.products.map(p=>({...p,ad_refs:['12001']}));
 await generateCatalogReply({...base,catalog:{...catalog,products},text:'Price?',adSource:{ad_id:'12001'},fetcher:async(_url,init)=>{
  const instructions=JSON.parse(String(init?.body)).messages[0].content;
  assert.match(instructions,/mapped to more than one product/);
  assert.doesNotMatch(instructions,/Meta-reported product source DATA:/);
  return answer('Which product are you interested in?');
 }});
});
