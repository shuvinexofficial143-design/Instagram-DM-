import assert from 'node:assert/strict';
import test from 'node:test';
process.env.OPENAI_API_KEY='test-only-catalog-key';
const {default:handler}=await import('../api/openai/chat');
const original=globalThis.fetch;test.afterEach(()=>{globalThis.fetch=original;});
const owner='00000000-0000-4000-8000-000000000098',foreign='00000000-0000-4000-8000-000000000099';
const product={id:'red',data:{name:'Red frame',price:'₹499',description:'Red heart',active:true,catalog_id:'gifts',images:['https://images.example/red.jpg'],url:'https://shop.example/red'}};
function transport(options:any={}){const calls:any[]=[];globalThis.fetch=async(url:any,init:any={})=>{
 const href=String(url);calls.push({url:href,init});
 if(href.includes('/auth/v1/user'))return Response.json({id:owner});
 if(href.includes('/rest/v1/autoreply_instagram_memberships'))return Response.json([]);
 if(href.includes('/rest/v1/autoreply_documents')){const parsed=new URL(href);assert.equal(parsed.searchParams.get('user_id'),'eq.'+owner);assert.equal(new Headers(init.headers).get('authorization'),'Bearer test-session');assert.equal(init.method||'GET','GET');return Response.json(parsed.searchParams.get('collection')==='eq.catalogs'?(options.inactive?{id:'gifts',data:{active:false}}:{id:'gifts',data:{name:'Gifts',active:true}}):[product]);}
 if(href.includes('api.openai.com')){const p=JSON.parse(init.body);if(options.inspect)options.inspect(p);return Response.json({choices:[{message:options.select?{tool_calls:[{id:'photo',type:'function',function:{name:'send_product_photos',arguments:'{"selections":[{"product_id":"red","image_indexes":[0]}]}'}}]}:{content:'Current price is ₹499.'}}]});}
 throw Error('Unexpected request: '+href);
};return calls;}
async function request(body:any={},headers:any={authorization:'Bearer test-session','x-autoreply-workspace':owner}){const res={code:0,body:null as any,setHeader(){},status(n:number){this.code=n;return this;},json(value:any){this.body=value;return this;}};await handler({method:'POST',headers,body:{previewMode:'catalog',catalogId:'gifts',text:'Show red frame',systemInstruction:'Sell gifts',...body}},res);return res;}
test('preview loads current scoped catalog records and returns photo cards without an Instagram send',async()=>{
 const calls=transport({select:true});const r=await request();assert.equal(r.code,200);assert.equal(r.body.previewOnly,true);assert.equal(r.body.catalog.elements[0].title,'Red frame');assert.ok(calls.every(c=>!c.url.includes('graph.instagram.com')));assert.ok(calls.filter(c=>c.url.includes('/rest/')).every(c=>!['POST','PATCH','DELETE'].includes(c.init.method)));
});
test('preview refuses anonymous requests before reading catalog or calling AI',async()=>{
 const calls=transport();const r=await request({},{});assert.equal(r.code,401);assert.equal(calls.length,0);
});
test('preview cannot use an explicit workspace belonging to another login',async()=>{
 const calls=transport();const r=await request({}, {authorization:'Bearer test-session','x-autoreply-workspace':foreign});assert.equal(r.code,403);assert.ok(calls.every(c=>!c.url.includes('autoreply_documents')&&!c.url.includes('openai.com')));
});
test('preview rejects unsafe image input before calling the model',async()=>{
 const calls=transport();const r=await request({image:'http://localhost/private.jpg'});assert.equal(r.code,400);assert.ok(calls.every(c=>!c.url.includes('openai.com')));
});
test('unavailable catalog remains a warning, and ordinary preview replies still work',async()=>{
 const calls=transport({inactive:true,inspect:(p:any)=>{assert.equal(p.tools.length,1);assert.match(p.messages[0].content,/inactive/);}});const r=await request();assert.equal(r.code,200);assert.match(r.body.warning,/inactive/);assert.ok(calls.some(c=>c.url.includes('openai.com')));
});
