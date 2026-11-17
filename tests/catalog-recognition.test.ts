import assert from 'node:assert/strict';
import test from 'node:test';
import {generateCatalogReply,resolveCatalogReference,catalogStyleKey,catalogContext,catalogDeliveryParts,catalogProductMetadata,expandCatalogProduct,recognizeCatalogImages,recognizePrintedCatalogStyles,type RuntimeCatalog} from '../supabase/functions/instagram-live-webhook/catalogRuntime';
import {normalizeInstagramAdSource,matchInstagramAdProduct,mediaReferenceKey,extractInstagramSharedMedia,matchSharedInstagramMedia} from '../supabase/functions/instagram-live-webhook/adAttribution';
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
 assert.equal(calls,0);assert.equal(result.catalog?.elements?.length,1);assert.equal(result.catalog?.products[0].id,'heart');
 const parts=catalogDeliveryParts(result.catalog!);assert.equal(parts[0].message.attachment.payload.url,catalog.products[0].images[0]);assert.match(parts.at(-1)?.text||'',/₹250/);assert.match(parts.at(-1)?.text||'',/COD|Cash on Delivery/);assert.match(parts.at(-1)?.text||'',/5–7 days/);
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
 }});assert.equal(calls,5);assert.equal(seen.size,31);assert.equal(result.catalog?.elements?.length,1);assert.equal(result.catalog?.elements?.[0].image_url,large.products[14].images[1]);
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
 assert.equal(mediaReferenceKey('https://www.instagram.com/reel/AbCdEf/?utm_source=test'),'AbCdEf');
});
test('source mapping prefers exact Ad ID, handles Reel links and rejects ambiguous products',()=>{
 const products=[{id:'frame',ad_refs:['12001'],reel_refs:['https://www.instagram.com/reel/FrameOne/']},
  {id:'necklace',ad_refs:['12002'],reel_refs:['https://www.instagram.com/reel/NecklaceTwo/']}];
 assert.equal(matchInstagramAdProduct(products,{ad_id:'12002',media_id:'https://www.instagram.com/reel/FrameOne/'}).product?.id,'necklace');
 assert.equal(matchInstagramAdProduct(products,{media_id:'FrameOne'}).product?.id,'frame');
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

test('a parent product expands into variant SKUs without changing legacy items',()=>{
 const source={...frame('family','20'),id:'family',name:'Photo Frame',price:'₹249',required_customer_fields:['Custom name'],
  customer_photo_min:15,customer_photo_max:20,sales_notes:'Great for gifts',variants:[
  {id:'heart',name:'Heart Design',style_number:'FR-01',price:'₹299',color:'Red',size:'6x8',images:['https://images.example/heart.jpg'],required_customer_fields:['Gift message'],customer_photo_min:18,ad_refs:['12000000001']},
  {id:'round',name:'Round Design',style_number:'FR-02',price:'₹349',images:['https://images.example/round.jpg'],reel_refs:['https://www.instagram.com/reel/round1/']}
 ]};
 const normalized={...source,...catalogProductMetadata(source)};
 const expanded=expandCatalogProduct(normalized);
 assert.deepEqual(expanded.map(p=>p.id),['family','family--heart','family--round']);
 assert.equal(expanded[1].price,'₹299');
 assert.equal(expanded[2].price,'₹349');
 assert.equal(expanded[1].images[0],'https://images.example/heart.jpg');
 assert.equal(expanded[1].customer_photo_min,18);
 assert.equal(expanded[2].customer_photo_min,15);
 assert.deepEqual(expanded[1].required_customer_fields,['Custom name','Gift message']);
 assert.equal(matchInstagramAdProduct(expanded,{ad_id:'12000000001'}).product?.id,'family--heart');
 assert.equal(matchInstagramAdProduct(expanded,{media_id:'round1'}).product?.id,'family--round');
 assert.equal(resolveCatalogReference({id:'master',name:'Master',products:expanded},'Style FR-02').products[0].id,'family--round');
 assert.equal(expandCatalogProduct({...frame('old','01'),name:'Legacy product'})[0].id,'old');
});
test('variant normalization ignores duplicate identifiers and unsafe photos or references',()=>{
 const normalized=catalogProductMetadata({variants:[
  {id:'x',name:'Heart',price:'₹250',images:['javascript:bad','https://images.example/ok.jpg'],ad_refs:['unsafe!!','12000001111']},
  {id:'x',name:'duplicate'},
  {id:'bad!',name:'invalid'}
 ]});
 assert.equal(normalized.variants?.length,1);
 assert.deepEqual(normalized.variants?.[0].images,['https://images.example/ok.jpg']);
 assert.deepEqual(normalized.variants?.[0].ad_refs,['12000001111']);
});

test('Instagram Reel and Post shares are extracted without accepting video CDN URLs',()=>{
 const reel='https://www.instagram.com/reel/AbCdEf/?igsh=abc';
 const fromAttachment=extractInstagramSharedMedia({attachments:[{type:'share',payload:{url:reel}}]});
 assert.equal(fromAttachment.hasSharedMedia,true);
 assert.deepEqual(fromAttachment.references,[reel]);
 assert.deepEqual(extractInstagramSharedMedia({text:'Please check https://www.instagram.com/p/PostABC/ and tell price'}).references,['https://www.instagram.com/p/PostABC/']);
 assert.deepEqual(extractInstagramSharedMedia({attachments:[{type:'ig_post',payload:{media:{id:'180222333'}}}]}).references,['180222333']);
 assert.deepEqual(extractInstagramSharedMedia({attachments:[{type:'share',payload:{url:'https://instagram.fcdn.net/video.mp4'}}]}),{references:[],hasSharedMedia:true});
 assert.equal(extractInstagramSharedMedia({attachments:[{type:'image',payload:{url:'https://example.com/image.jpg'}}]}).hasSharedMedia,false);
 assert.equal(mediaReferenceKey('https://www.instagram.com/reel/AbC/'), 'AbC');
 assert.notEqual(mediaReferenceKey('https://www.instagram.com/reel/AbC/'),mediaReferenceKey('https://www.instagram.com/reel/abc/'));
});
test('multiple shared media references must all map to the SAME product',()=>{
 const products=[{id:'photo',reel_refs:['https://www.instagram.com/reel/AbCd/','180333']},{id:'pendant',reel_refs:['https://www.instagram.com/p/ZyX/']}];
 assert.equal(matchSharedInstagramMedia(products,['180333','https://www.instagram.com/reel/AbCd/']).product?.id,'photo');
 assert.equal(matchSharedInstagramMedia(products,['180333','https://www.instagram.com/p/ZyX/']).status,'ambiguous');
 assert.equal(matchSharedInstagramMedia(products,['180333','https://www.instagram.com/p/Unknown/']).status,'ambiguous');
 assert.equal(matchSharedInstagramMedia(products,['https://www.instagram.com/p/Unknown/']).status,'none');
});
test('exact shared Post opens correct product photos and saved price without AI guessing',async()=>{
 const products=[{...frame('heart','07'),reel_refs:['https://www.instagram.com/p/MappedPost/'],customer_photo_min:15,customer_photo_max:20},
 { ...frame('round','08'),reel_refs:['https://www.instagram.com/reel/Other/']}];
 let aiCalls=0;
 const result=await generateCatalogReply({...base,catalog:{...catalog,products},text:'[Customer shared an Instagram Reel/Post]',sharedMediaRefs:['https://www.instagram.com/p/MappedPost/'],
  fetcher:async()=>{aiCalls++;throw Error('Explicit share must resolve deterministically');}});
 assert.equal(aiCalls,0);
 assert.equal(result.catalog?.products.length,1);
 assert.equal(result.catalog?.products[0].id,'heart');
 assert.equal(result.catalog?.elements?.[0]?.image_url,products[0].images[0]);
 assert.match(result.text||'',/₹250/);
 assert.match(result.text||'',/15–20/);
});
test('unmapped or opaque shares ask for clarification instead of guessing another product',async()=>{
 const offer={...catalog,products:[{...frame('heart','07'),reel_refs:['https://www.instagram.com/reel/Known/']}]};
 const opts={...base,catalog:offer,text:'[Customer shared an Instagram Reel/Post]',fetcher:async()=>{throw Error('No guessing');}};
 assert.equal((await generateCatalogReply({...opts,sharedMediaUnknown:true})).catalog,undefined);
 assert.equal((await generateCatalogReply({...opts,sharedMediaRefs:['https://www.instagram.com/reel/Unknown/']})).catalog,undefined);
});


test('printed STYLE 03 and FR-03 labels resolve to different approved designs',async()=>{
 const regular={...frame('regular','Style 3'),post_refs:[]};
 const variant={...frame('variant','FR-03'),post_refs:[]};
 const both={...catalog,products:[regular,variant]};
 const recognize=(number:string)=>recognizePrintedCatalogStyles(both,['https://images.example/user.jpg'],async()=>({content:JSON.stringify({styles:[{input_index:0,style_number:number,visible:true,confidence:0.99}]})}));
 assert.equal((await recognize('STYLE 03')).matches[0].product_id,'regular');
 assert.equal((await recognize('FR-03')).matches[0].product_id,'variant');
 assert.equal((await recognize('03')).matches[0].product_id,'regular');
 const uncertain=await recognizePrintedCatalogStyles(both,['https://images.example/user.jpg'],async()=>({content:JSON.stringify({styles:[{input_index:0,style_number:'STYLE 03',visible:true,confidence:0.6}]})}));
 assert.equal(uncertain.certain,false);
});

test('bare "2" chooses the style mentioned last, not an unrelated catalog variant',async()=>{
 const regular={...frame('regular','Style 2'),post_refs:[]};
 const variant={...frame('variant','FR-02'),post_refs:[]};
 const both={...catalog,products:[regular,variant],delivery_style:'photos_ai' as const};
 const history=[{role:'user',content:'Product ki phot'},{role:'assistant',content:'✨ Style FR-02 — Sister Floral Memory Frame | ₹250'}];
 assert.equal(resolveCatalogReference(both,'2','',history).products[0]?.id,'variant');
 assert.equal(resolveCatalogReference(both,'2').requested,false);
 assert.equal(resolveCatalogReference(both,'2','',[{role:'user',content:'Choose a style please'}]).ambiguous,true);
 const result=await generateCatalogReply({...base,catalog:both,text:'2',history,recentPhotoUrls:[variant.images[0]],fetcher:async()=>photoTool()});
 assert.equal(result.catalog?.products[0].id,'variant');
 assert.equal(result.catalog?.elements?.[0].image_url,variant.images[0]);
 assert.match(result.catalog?.reply_language||'','hi');
});

test('a screenshot with verified printed Style 03 sends the matching photo without asking again',async()=>{
 const regular={...frame('regular','Style 3'),post_refs:[]};
 const variant={...frame('variant','FR-03'),post_refs:[]};
 const both={...catalog,id:'workspace_active_catalogs',products:[regular,variant],delivery_style:'photos_ai' as const};
 let calls=0;
 const result=await generateCatalogReply({...base,catalog:both,text:'[Customer sent an image]',history:[{role:'user',content:'Photo ki pic'}],images:['https://images.example/customer-style03.jpg'],fetcher:async(_url,init)=>{
  calls++;
  const request=JSON.parse(String(init?.body));
  assert.ok(request.response_format,'Visual recognition must not invoke regular sales AI for a confident match');
  return answer(request.messages[0].content.includes('Read ONLY visibly printed')?{styles:[{input_index:0,style_number:'STYLE 03',visible:true,confidence:0.99}]}:{matches:[]});
 }});
 assert.equal(result.catalog?.products[0].id,'regular');
 assert.equal(result.catalog?.elements?.[0].image_url,regular.images[0]);
 assert.equal(result.catalog?.reply_language,'hi');
 assert.ok(calls>0);
});


test('bare Style 04 after a customer picture selects its printed SKU, not the unrelated FR-04 variant',async()=>{
 const ordinary={...frame('style04','Style 4'),post_refs:[]};
 const fr={...frame('fr04','FR-04'),post_refs:[]};
 const combined={...catalog,id:'workspace_active_catalogs',delivery_style:'premium_cards' as const,products:[ordinary,fr]};
 const history=[{role:'user',content:'[Customer sent an image]'},{role:'assistant',content:'यह फोटो पहचान नहीं पा रहा हूँ। Style FR-04 नंबर बताइए।'}];
 let visionCalls=0;
 const result=await generateCatalogReply({...base,catalog:combined,text:'4',history,previousCustomerImages:['https://images.example/customer.jpg'],fetcher:async(_url,init)=>{
  visionCalls++;
  const payload=JSON.parse(String(init?.body));
  assert.ok(payload.response_format,'Only the screenshot label reader should need AI');
  return answer({styles:[{input_index:0,style_number:'STYLE 04',visible:true,confidence:0.99}]});
 }});
 assert.equal(visionCalls,1);
 assert.equal(result.catalog?.products[0].id,'style04');
 assert.equal(result.catalog?.elements?.[0].image_url,ordinary.images[0]);
 assert.doesNotMatch(result.text||'',/2 फ्रेम|2 frames?/iu);
 const cards=catalogDeliveryParts(result.catalog!);
 assert.equal(cards[0].kind,'cards');
 assert.equal(cards[0].catalog.elements[0].image_url,ordinary.images[0]);
});

test('explicit FR-04 stays separate from printed Style 04; gallery URL disambiguates bare number',()=>{
 const first={...frame('style04','Style 4'),post_refs:[]};
 const other={...frame('fr04','FR-04'),post_refs:[]};
 const selected={...catalog,products:[first,other]};
 assert.equal(resolveCatalogReference(selected,'Style 04').products[0].id,'style04');
 assert.equal(resolveCatalogReference(selected,'FR-04').products[0].id,'fr04');
 assert.equal(resolveCatalogReference(selected,'4','',[{role:'assistant',content:'Choose a style'}],[first.images[0]]).products[0].id,'style04');
 assert.equal(resolveCatalogReference(selected,'4','',[{role:'assistant',content:'Choose a style'}],[other.images[0]]).products[0].id,'fr04');
});


test('Style 08 and Style 03 printed on real product screenshots select only the matching catalog SKU',async()=>{
 const eight={...frame('style08','Style 08'),name:'Pink Birthday Memory Frame'};
 const three={...frame('style03','Style 03'),name:'Midnight Birthday Collage Frame'};
 const fr={...frame('fr08','FR-08'),name:'Different FR-08 variant'};
 const all={...catalog,id:'workspace_active_catalogs',products:[eight,three,fr],delivery_style:'premium_cards' as const};
 for(const [label,expected] of [['STYLE 08','style08'],['Style-03','style03'],['FR-08','fr08']] as const){
  let visionCalls=0;
  const result=await generateCatalogReply({...base,catalog:all,text:'[Customer sent an image]',images:['https://images.example/customer-screen.jpg'],fetcher:async(_url,init)=>{
   const body=JSON.parse(String(init?.body));visionCalls++;
   assert.equal(body.model,'gpt-4o-mini');
   assert.equal(body.reasoning_effort,undefined);
   return answer({styles:[{input_index:0,style_number:label,confidence:0.9,visible:true}]});
  }});
  assert.equal(result.catalog?.products[0].id,expected);
  assert.equal(result.catalog?.elements?.length,1);
  assert.equal(result.catalog?.reply_language,'hi');
  assert.equal(visionCalls,1);
 }
 assert.equal(catalogStyleKey('STYLE-08'),'8');
 assert.equal(catalogStyleKey('Style: 03'),'3');
 assert.equal(catalogStyleKey('FR-08'),catalogStyleKey('FR 8'));
});

test('if screenshot vision remains unavailable the bot sends a real labeled style gallery, not a guessed match',async()=>{
 const frames=Array.from({length:8},(_,i)=>({...frame('frame'+(i+1),'Style '+(i+1)),collection_name:'Photo Frame'}));
 const fr={...frame('fr04','FR-04'),collection_name:'All products'};
 const all={...catalog,id:'workspace_active_catalogs',products:[...frames,fr],delivery_style:'premium_cards' as const};
 const result=await generateCatalogReply({...base,catalog:all,text:'[Customer sent an image]',images:['https://images.example/customer-screen.jpg'],
  fetcher:async()=>answer({styles:[]})});
 assert.equal(result.catalog?.products.length,8);
 assert.equal(result.catalog?.elements?.length,8);
 assert.deepEqual(result.catalog?.products.map(p=>p.id),frames.map(p=>p.id));
 const parts=catalogDeliveryParts(result.catalog!);
 assert.equal(parts[0].kind,'cards');
 assert.equal(parts[0].message.attachment.payload.elements.length,8);
 assert.ok(parts.slice(1).some(p=>p.kind==='text'));
 assert.equal((await generateCatalogReply({...base,catalog:all,text:'[Customer sent an image]',images:['https://images.example/customer-screen.jpg'],
  recentPhotoUrls:frames.map(p=>p.images[0]),fetcher:async()=>answer({styles:[]})})).catalog,undefined);
});


test('selecting 8 after an eight-card FR gallery sends exactly the real FR-08 image without AI',async()=>{
 const parent={...frame('parent',''),name:'Personalized Photo Frame',style_number:'',images:[],
  variants:Array.from({length:8},(_,i)=>({id:'v'+(i+1),name:'Design '+(i+1),
    style_number:'FR-'+String(i+1).padStart(2,'0'),
    images:['https://images.example/fr-'+(i+1)+'.jpg'],price:''}))};
 const expanded=expandCatalogProduct(parent);
 const all:RuntimeCatalog={id:'all',name:'All products',delivery_style:'premium_cards',products:expanded};
 const photos=expanded.filter(p=>p.images.length).map(p=>p.images[0]);
 const result=await generateCatalogReply({...base,catalog:all,text:'8',recentPhotoUrls:photos,
  systemPrompt:'Sell photo frames; handoff to staff is available for customer support only.',
  history:[{role:'user',content:'photo Frame'},{role:'assistant',content:'[Product cards: All products]'},
   {role:'assistant',content:'✨ अपना पसंदीदा डिज़ाइन चुनिए!'}],
  fetcher:async()=>{throw Error('Selecting a saved style must not invoke another model')}});
 assert.equal(result.catalog?.products.length,1);
 assert.equal(result.catalog?.products[0].style_number,'FR-08');
 assert.equal(result.catalog?.elements?.length,1);
 assert.equal(result.catalog?.elements?.[0].image_url,'https://images.example/fr-8.jpg');
 assert.equal(catalogDeliveryParts(result.catalog!)[0].kind,'cards');
});

test('No after a design offer must not ask for phone or insist on old Style 04',async()=>{
 const result=await generateCatalogReply({...base,text:'No',
  history:[{role:'user',content:'4'},{role:'assistant',content:'✨ आपका चुना हुआ डिज़ाइन!'},
    {role:'assistant',content:'🎁 ऑर्डर करने के लिए नंबर बताइए।'}],
  fetcher:async()=>{throw Error('A clear refusal should not invoke the sales AI')}});
 assert.equal(result.catalog,undefined);
 assert.match(result.text||'',/ऑर्डर आगे नहीं|order/i);
 assert.doesNotMatch(result.text||'',/मोबाइल नंबर|10 अंकों|FR-04|डिज़ाइन 4/i);
});

test('internal Product cards sentinel from an AI draft is never a customer-facing text reply',async()=>{
 const result=await generateCatalogReply({...base,text:'okay',history:[],
  fetcher:async()=>Response.json({choices:[{message:{content:'[Product cards: All products]'}}]})});
 assert.equal(result.catalog,undefined);
 assert.doesNotMatch(result.text||'',/\[Product cards:/i);
 assert.match(result.text||'',/Style|स्टाइल|डिज़ाइन/);
});
