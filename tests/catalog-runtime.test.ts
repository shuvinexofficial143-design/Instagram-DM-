import {mergeCatalogProducts} from '../src/lib/catalogDrafts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCatalogPage,selectProductPhotos,rankCatalogProducts,catalogContext,safeImageUrl,extractImageAttachments,generateCatalogReply,loadCatalog} from '../supabase/functions/instagram-live-webhook/catalogRuntime';
const product=(id='red',images=['https://images.example/red-front.jpg','https://images.example/red-back.jpg'])=>({id,name:id==='red'?'Red heart frame':id,price:'₹499',description:'Red heart photo frame',url:'https://shop.example/'+id,images});
const catalog={id:'gifts',name:'Gifts',products:[product(),{...product('blue'),name:'Blue watch',description:'Blue wrist watch',price:'₹799'}]};
const answer=(message:any)=>Response.json({choices:[{message}]});
const base={key:'fixture',systemPrompt:'Old product price ₹99. Help customers buy gifts.',history:[],text:'Show red frame photos',catalog};
test('specific product selection sends only requested approved views',()=>{
 const result=selectProductPhotos(catalog,[{product_id:'red',image_indexes:[1]}]);assert.equal(result.elements?.length,1);assert.equal(result.elements?.[0].image_url,product().images[1]);assert.equal(result.products.length,1);
 assert.throws(()=>selectProductPhotos(catalog,[{product_id:'foreign',image_indexes:[0]}]),/not in/);
 assert.throws(()=>selectProductPhotos(catalog,[{product_id:'red',image_indexes:[99]}]),/does not exist/);
 assert.throws(()=>selectProductPhotos(catalog,[{product_id:'red',image_indexes:['0']}]),/does not exist/);
});
test('large catalogs paginate at ten cards without losing remaining photos',()=>{
 const big={...catalog,products:Array.from({length:23},(_,i)=>product('product_'+i,['https://images.example/'+i+'.jpg']))};
 const a=buildCatalogPage(big,1),b=buildCatalogPage(big,3);assert.equal(a.elements?.length,10);assert.equal(a.pages,3);assert.equal(b.elements?.length,3);assert.equal(b.elements?.[0].title,'product_20');assert.throws(()=>buildCatalogPage(big,4),/between/);
});
test('written-only products remain available for knowledge but cannot be sent as photos',()=>{
 const textOnly={...catalog,products:[product('text-only',[])]};assert.equal(catalogContext(textOnly,'text-only').products.length,1);assert.throws(()=>buildCatalogPage(textOnly),/No product photos/);assert.throws(()=>selectProductPhotos(textOnly,[{product_id:'text-only',image_indexes:[0]}]),/No photo/);
});
test('context includes current links and prices and ranks relevant products beyond the first page',()=>{
 const big={...catalog,products:[...Array.from({length:50},(_,i)=>product('unrelated_'+i)),{...product('special'),name:'Golden birthday lamp',description:'Golden lamp birthday present'}]};
 assert.equal(rankCatalogProducts(big,'golden birthday lamp')[0].id,'special');assert.equal(catalogContext(catalog,'red').products[0].price,'₹499');assert.equal(catalogContext(catalog,'red').products[0].url,'https://shop.example/red');
});
test('unsafe URLs and non-image attachments never become image inputs',()=>{
 for(const url of ['http://images.example/a.jpg','https://127.0.0.1/a','https://[::1]/a','https://localhost/a','https://user:password@images.example/a','file:///tmp/a','https://server.internal/a'])assert.equal(safeImageUrl(url),'');
 assert.deepEqual(extractImageAttachments({attachments:[{type:'video',payload:{url:'https://images.example/a.mp4'}},{type:'image',payload:{url:'https://images.example/a.jpg'}},{type:'image',payload:{url:'https://images.example/a.jpg'}}]}),['https://images.example/a.jpg']);
});
test('generation uses current catalog data and a specific product photo tool',async()=>{
 let requests=0;const result=await generateCatalogReply({...base,fetcher:async(_url,init)=>{requests++;const payload=JSON.parse(String(init?.body));assert.match(payload.messages[0].content,/override older/);assert.match(payload.messages[0].content,/₹499/);assert.ok(payload.tools.some((t:any)=>t.function.name==='send_product_photos'));return answer({tool_calls:[{id:'call1',type:'function',function:{name:'send_product_photos',arguments:JSON.stringify({selections:[{product_id:'red',image_indexes:[0]}]})}}]});}});
 assert.equal(requests,1);assert.equal(result.catalog?.elements?.[0].title,'Red heart frame');
});
test('customer image is analyzed and compared with catalog photos before selecting a product',async()=>{
 let requests=0;const result=await generateCatalogReply({...base,text:'Do you have this?',images:['https://images.example/customer.jpg'],fetcher:async(_url,init)=>{const p=JSON.parse(String(init?.body));requests++;if(p.response_format)return answer({content:JSON.stringify({description:'Red heart frame',uncertain:false})});assert.ok(Array.isArray(p.messages.at(-1).content));assert.ok(p.messages.at(-1).content.some((c:any)=>c.image_url?.url==='https://images.example/customer.jpg'));assert.ok(p.messages.at(-1).content.some((c:any)=>c.image_url?.url===product().images[0]));return answer({content:'This resembles the red heart frame. Can you confirm the design?'});}});
 assert.equal(requests,2);assert.match(result.text||'',/resembles/);
});
test('unreadable images ask for clarification without pretending visual recognition',async()=>{
 let calls=0;const result=await generateCatalogReply({...base,images:['https://images.example/expired.jpg'],fetcher:async(_url,init)=>{calls++;const p=JSON.parse(String(init?.body));if(p.response_format)return Response.json({error:{message:'Image expired'}},{status:400});assert.match(p.messages[0].content,/could not be inspected/);assert.equal(typeof p.messages.at(-1).content,'string');return answer({content:'Please send a clear photo or tell me the product name.'});}});
 assert.equal(calls,2);assert.ok(result.warning);assert.match(result.text||'',/clear photo/);
});
test('invalid product tool output cannot send foreign images and is returned for clarification',async()=>{
 let calls=0;const result=await generateCatalogReply({...base,fetcher:async(_url,init)=>{calls++;const p=JSON.parse(String(init?.body));if(calls===1)return answer({tool_calls:[{id:'invalid',type:'function',function:{name:'send_product_photos',arguments:'{"selections":[{"product_id":"foreign","image_indexes":[0]}]}'}}]});assert.match(p.messages.at(-1).content,/not in/);return answer({content:'Which frame would you like?'});}});
 assert.equal(calls,2);assert.equal(result.catalog,undefined);assert.match(result.text||'',/Which/);
});
test('catalog search can retrieve another shortlist without sending a message',async()=>{
 let calls=0;const result=await generateCatalogReply({...base,fetcher:async(_url,init)=>{calls++;const p=JSON.parse(String(init?.body));if(calls===1)return answer({tool_calls:[{id:'search',type:'function',function:{name:'search_catalog',arguments:'{"query":"blue watch"}'}}]});const data=JSON.parse(p.messages.at(-1).content);assert.equal(data.products[0].id,'blue');return answer({content:'The Blue watch is ₹799.'});}});assert.equal(result.catalog,undefined);assert.equal(calls,2);
});
test('a catalog outage leaves ordinary business questions answerable',async()=>{
 const result=await generateCatalogReply({...base,catalog:null,catalogWarning:'Selected catalog is inactive.',text:'Where is your shop?',fetcher:async(_url,init)=>{const p=JSON.parse(String(init?.body));assert.equal(p.tools.length,1);assert.match(p.messages[0].content,/Continue answering unrelated questions/);return answer({content:'Our shop is in Ujjain.'});}});assert.match(result.text||'',/Ujjain/);
});
test('database loading is scoped, paginated and preserves canonical row IDs',async()=>{
 const queries:any[]=[];const admin={from(){const q:any={filters:{},select(){return q;},eq(k:string,v:string){q.filters[k]=v;return q;},order(){return q;},async maybeSingle(){assert.equal(q.filters.user_id,'workspace-a');return {data:{data:{name:'Gifts',active:true}}};},async range(start:number,end:number){queries.push({...q.filters,start,end});const rows=Array.from({length:start===0?500:1},(_,i)=>({id:'real_'+(start+i),data:{...product('forged'),id:'forged',catalog_id:'gifts',active:true}}));return {data:rows};}};return q;}};
 const result=await loadCatalog(admin,'workspace-a','gifts');assert.equal(result.products.length,501);assert.equal(result.products[0].id,'real_0');assert.ok(queries.every(q=>q.user_id==='workspace-a'&&q.collection==='catalog_products'));
});

test('Realtime catalog updates keep unsaved product edits while refreshing other products',()=>{
 const local=[{id:'red',price:'₹599'},{id:'blue',price:'₹799'}],server=[{id:'red',price:'₹499'},{id:'blue',price:'₹899'},{id:'new',price:'₹999'}];
 const result=mergeCatalogProducts(server,local,new Map([['red',2]]));assert.equal(result[0].price,'₹599');assert.equal(result[1].price,'₹899');assert.equal(result[2].id,'new');
 const afterSave=mergeCatalogProducts(server,local,new Map());assert.equal(afterSave[0].price,'₹499');
 assert.deepEqual(mergeCatalogProducts([],local,new Map([['red',1]])),[]);
});
