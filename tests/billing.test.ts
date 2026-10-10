import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import handler from '../api/billing.ts';
import {billingConfig,validatedCustomer,validateProviderPayment,verifyCashfreeSignature,reconcileOrder,checkoutPayable} from '../src/server/cashfree.ts';
const originalFetch=globalThis.fetch;
const originalEnv={...process.env};
let uid='00000000-0000-4000-8000-000000000001';
let fixtureUserIndex=1;
const oid='ar_sandbox_00000000-0000-4000-8000-000000000003';
const rid='00000000-0000-4000-8000-000000000002';
const order={order_id:oid,owner_user_id:uid,plan_id:'pro',environment:'sandbox',amount_inr:599,currency:'INR',billing_days:30,request_id:rid,status:'pending',payment_expires_at:new Date(Date.now()+300000).toISOString()};
function setup(){uid='00000000-0000-4000-8000-'+String(++fixtureUserIndex).padStart(12,'0');order.owner_user_id=uid;order.payment_expires_at=new Date(Date.now()+300000).toISOString();Object.assign(process.env,{CASHFREE_CLIENT_ID:'test-id',CASHFREE_CLIENT_SECRET:'test-secret',CASHFREE_ENV:'sandbox',SUPABASE_SERVICE_ROLE_KEY:'server-secret',APP_URL:'https://example.test'});}
function res(){return {code:0,body:null as any,headers:{} as any,setHeader(k:string,v:string){this.headers[k]=v;},status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;}};}
function req(action:string,method='GET',body?:any){const r:any=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);r.method=method;r.query={action};r.headers={authorization:'Bearer user-token'};return r;}
afterEach(()=>{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);});
test('production requires approval switch and complete business identity; config never exposes keys',async()=>{
 setup();process.env.CASHFREE_ENV='production';assert.equal(billingConfig().configured,false);
 Object.assign(process.env,{BUSINESS_LEGAL_NAME:'Example Business',BUSINESS_SUPPORT_EMAIL:'support@example.test',BUSINESS_SUPPORT_PHONE:'+919876543210',BUSINESS_ADDRESS:'Example address',CASHFREE_LIVE_ENABLED:'true'});
 assert.equal(billingConfig().configured,true);const r=res();await handler(req('config'),r);assert.equal(r.code,200);assert.ok(!JSON.stringify(r.body).includes('secret'));assert.ok(!JSON.stringify(r.body).includes('test-id'));
});
test('public plan catalog reads admin prices from trusted storage without authentication',async()=>{
 setup();
 globalThis.fetch=async(url:any)=>{
  assert.ok(String(url).includes('/rest/v1/autoreply_plans?'));
  return Response.json([{id:'free',name:'Free',price_inr:0,total_messages:1500,ai_replies:1500,is_active:true},{id:'starter',name:'Starter',price_inr:399,total_messages:3000,ai_replies:2500,is_active:true}]);
 };
 const r=res();await handler(req('plans'),r);
 assert.equal(r.code,200);assert.equal(r.body.plans[1].price_inr,399);
 assert.equal(r.body.plans[0].total_messages,1500);
 assert.equal(r.body.plans[0].ai_replies,1500);
 assert.ok(!JSON.stringify(r.body).includes('test-secret'));
});
test('raw body signature rejects JSON reformatting, wrong key and missing signatures',()=>{
 const raw=Buffer.from('{"amount":599.00}'),ts='1791356400000',secret='secret';const sig=createHmac('sha256',secret).update(ts).update(raw).digest('base64');
 assert.equal(verifyCashfreeSignature(raw,ts,sig,secret),true);assert.equal(verifyCashfreeSignature(Buffer.from('{"amount":599}'),ts,sig,secret),false);assert.equal(verifyCashfreeSignature(raw,ts,sig,'other'),false);assert.equal(verifyCashfreeSignature(raw,ts,'',secret),false);
});
test('customer contact details are validated before payment',()=>{
 assert.deepEqual(validatedCustomer({name:'Example Person',email:'HELLO@EXAMPLE.TEST',phone:'+91 98765 43210'}),{name:'Example Person',email:'hello@example.test',phone:'9876543210'});
 assert.throws(()=>validatedCustomer({name:'X',email:'x',phone:'123'}));
});
test('redirect, ACTIVE status, wrong amount, wrong currency and failed attempts cannot activate',()=>{
 const payment={cf_payment_id:'123',payment_status:'SUCCESS',payment_amount:599,payment_currency:'INR'};
 const provider={order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'PAID'};
 assert.equal(validateProviderPayment(order,provider,[payment]).cf_payment_id,'123');
 assert.equal(validateProviderPayment(order,{...provider,order_status:'ACTIVE'},[payment]),null);
 for(const change of [{order_id:'other'},{order_amount:1},{order_currency:'USD'},{customer_details:{customer_id:'other'}}])assert.throws(()=>validateProviderPayment(order,{...provider,...change},[payment]));
 assert.throws(()=>validateProviderPayment(order,provider,[{...payment,payment_status:'FAILED'}]));
 assert.throws(()=>validateProviderPayment(order,provider,[{...payment,payment_amount:1}]));
});
test('unauthenticated checkout never calls storage or payment provider',async()=>{
 setup();globalThis.fetch=async()=>Response.json({}, {status:401});const r=res();await handler(req('create','POST',{}),r);assert.equal(r.code,401);
});
test('order status only queries orders belonging to the authenticated owner',async()=>{
 setup();globalThis.fetch=async(url:any)=>{if(String(url).includes('/auth/'))return Response.json({id:uid});assert.ok(String(url).includes('owner_user_id=eq.'+uid));return Response.json([]);};
 const q=req('status');q.query.order_id=oid;const r=res();await handler(q,r);assert.equal(r.code,404);
});
test('authoritative reserved price and stable idempotency key are used; browser amount is ignored',async()=>{
 setup();let providerCalls=0;
 globalThis.fetch=async(url:any,init:any)=>{
  const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});
  if(path.includes('status=in.(creating,pending)'))return Response.json([]);
   if(path.includes('rpc/autoreply_reserve')){const body=JSON.parse(init.body);assert.equal(body.p_owner_id,uid);assert.ok(body.p_order_id.length<=45);assert.equal(body.p_plan_id,'pro');return Response.json(order);}
  if(path.includes('cashfree.com')){providerCalls++;const body=JSON.parse(init.body);assert.equal(body.order_amount,599);assert.equal(body.order_id,oid);assert.equal(init.headers['x-idempotency-key'],rid);assert.equal(body.order_meta.return_url,'https://example.test/billing/checkout?order_id='+oid);return Response.json({order_id:oid,payment_session_id:'session'});}
  return Response.json([{...order,payment_session_id:'session'}]);
 };
 const q=req('create','POST',{planId:'pro',amount:1,name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid});
 // Vercel exposes a lazy parsed-JSON getter; reading it consumes the raw request.
 Object.defineProperty(q,'body',{get(){throw new Error('Vercel JSON body getter must not be read');}});
 const r=res();await handler(q,r);assert.equal(r.code,200);assert.equal(r.body.order.amount,599);assert.equal(providerCalls,1);
});
for(const [selectedPlan,amount] of [['starter',299],['pro',599],['business',1299]] as const) {
 test('new '+selectedPlan+' checkout is independent of a stuck old Starter payment',async()=>{
  setup();let creates=0,reservations=0;
  const selected={...order,plan_id:selectedPlan,amount_inr:amount,checkout_state:'active'};
  globalThis.fetch=async(url:any,init:any)=>{
   const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});
   assert.ok(!path.includes('status=in.(creating,pending)'),'no unrelated order query or termination wait');
   if(path.includes('rpc/autoreply_reserve_billing_checkout')){assert.equal(JSON.parse(init.body).p_plan_id,selectedPlan);reservations++;return Response.json(selected);}
   if(path.includes('cashfree.com')){assert.equal(init.method,'POST');creates++;assert.equal(JSON.parse(init.body).order_amount,amount);return Response.json({order_id:oid,payment_session_id:'new-session'});}
   if(init.method==='PATCH')return Response.json([{...selected,status:'pending'}]);throw Error('Unexpected request');
  };
  const r=res();await handler(req('create','POST',{planId:selectedPlan,name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);
  assert.equal(r.code,200);assert.equal(r.body.order.planId,selectedPlan);assert.equal(r.body.order.amount,amount);assert.equal(r.body.paymentSessionId,'new-session');assert.equal(creates,1);assert.equal(reservations,1);
 });
}
test('a paid reservation retry returns its verified result and never charges again',async()=>{
 setup();globalThis.fetch=async(url:any)=>{if(String(url).includes('/auth/'))return Response.json({id:uid});assert.ok(String(url).includes('rpc/autoreply_reserve_billing_checkout'));return Response.json({...order,status:'paid',activation_status:'active'});};const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);assert.equal(r.code,200);assert.equal(r.body.order.status,'paid');assert.equal(r.body.paymentSessionId,undefined);
});
test('closing checkout keeps its financial record without waiting for provider termination',async()=>{
 setup();let closed=false;
 globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.includes('rpc/autoreply_close')){closed=true;assert.equal(JSON.parse(init.body).p_owner_id,uid);return Response.json({...order,checkout_state:'closed'});}if(path.endsWith('/payments'))return Response.json([]);if(path.includes('cashfree.com')){assert.equal(init.method,'GET');return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'TERMINATION_REQUESTED'});}return Response.json([order]);};
 const r=res();await handler(req('cancel','POST',{orderId:oid}),r);assert.equal(r.code,200);assert.equal(closed,true);assert.equal(r.body.order.status,'pending');assert.equal(r.body.order.checkoutState,'closed');
});
test('signed successful webhook rechecks provider and finalizes the durable order; failures never downgrade paid',async()=>{
 setup();let confirmations=0;
 globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('rpc/autoreply_confirm')){confirmations++;const body=JSON.parse(init.body);assert.equal(body.p_environment,'sandbox');assert.equal(body.p_amount,599);return Response.json({...order,status:'paid',activation_status:'test'});}if(path.endsWith('/payments'))return Response.json([{cf_payment_id:'123',payment_amount:599,payment_currency:'INR',payment_status:'SUCCESS'}]);if(path.includes('cashfree.com'))return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'PAID'});return Response.json([order]);};
 for(const type of ['PAYMENT_SUCCESS_WEBHOOK','PAYMENT_FAILED_WEBHOOK']){const event={type,data:{order:{order_id:oid}}};const q=req('webhook','POST',event);Object.defineProperty(q,'body',{get(){throw new Error('Webhook must use original stream, not parsed body');}});q.headers['x-webhook-timestamp']='1791356400000';q.headers['x-webhook-signature']=createHmac('sha256','test-secret').update(q.headers['x-webhook-timestamp']).update(JSON.stringify(event)).digest('base64');const r=res();await handler(q,r);assert.equal(r.code,200);}
 assert.equal(confirmations,1);
});
test('forged webhook is rejected before any database or provider access',async()=>{setup();globalThis.fetch=async()=>{throw new Error('Should not fetch');};const r=res();await handler(req('webhook','POST',{type:'PAYMENT_SUCCESS_WEBHOOK'}),r);assert.equal(r.code,401);});
test('provider timeout never creates a second order in one request',async()=>{
 setup();let calls=0;globalThis.fetch=async(url:any)=>{if(String(url).includes('/auth/'))return Response.json({id:uid});if(String(url).includes('status=in.(creating,pending)'))return Response.json([]);if(String(url).includes('/rest/'))return Response.json(order);calls++;throw new Error('timeout');};const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);assert.equal(r.code,503);assert.equal(calls,1);
});

test('checkout expires at the provider after five minutes and returns the same deadline to the browser',async()=>{
 setup();let expiry='';const started=Date.now();
 globalThis.fetch=async(url:any,init:any)=>{
  const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});
  if(path.includes('status=in.(creating,pending)'))return Response.json([]);
  if(path.includes('rpc/autoreply_reserve'))return Response.json(order);
  if(path.includes('cashfree.com')){const body=JSON.parse(init.body);expiry=body.order_expiry_time;assert.ok(Date.parse(expiry)>=started+299000&&Date.parse(expiry)<=Date.now()+300000);return Response.json({order_id:oid,payment_session_id:'session',order_expiry_time:expiry});}
  return Response.json([order]);
 };
 const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);
 assert.equal(r.code,200);assert.equal(r.body.order.paymentExpiresAt,expiry);assert.equal(r.body.order.status,'pending');
});
test('resuming an existing provider session never creates another order or extends its deadline',async()=>{
 setup();const expiry=new Date(Date.now()+45000).toISOString();let creates=0;
 const existing={...order,payment_session_id:'existing-session'};
 globalThis.fetch=async(url:any,init:any)=>{
  const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});
  if(path.includes('status=in.(creating,pending)'))return Response.json([existing]);
  if(path.includes('rpc/autoreply_reserve'))return Response.json(existing);
  if(path.endsWith('/payments'))return Response.json([]);
  if(path.includes('cashfree.com')){if(init.method==='POST')creates++;return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'ACTIVE',payment_session_id:'existing-session',order_expiry_time:expiry});}
  throw new Error('Unexpected mutation');
 };
 const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);
 assert.equal(r.code,200);assert.equal(creates,0);assert.equal(r.body.order.paymentExpiresAt,expiry);assert.equal(r.body.paymentSessionId,'existing-session');
});
for(const [planId,amount] of [['starter',299],['pro',599],['business',1299]] as const) {
 test(planId+' creates its authoritative order and activates only after a verified production payment',async()=>{
  setup();process.env.CASHFREE_ENV='production';process.env.CASHFREE_LIVE_ENABLED='true';
  const id='ar_production_00000000-0000-4000-8000-000000000003';
  const selected={...order,order_id:id,environment:'production',plan_id:planId,amount_inr:amount};let confirmed=0;
  globalThis.fetch=async(url:any,init:any)=>{
   const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});
   if(path.includes('status=in.(creating,pending)'))return Response.json([]);
   if(path.includes('rpc/autoreply_reserve')){assert.equal(JSON.parse(init.body).p_plan_id,planId);return Response.json(selected);}
   if(path.includes('rpc/autoreply_confirm')){const b=JSON.parse(init.body);assert.equal(b.p_amount,amount);assert.equal(b.p_environment,'production');confirmed++;return Response.json({...selected,status:'paid',activation_status:'active'});}
   if(path.includes('cashfree.com')){
    if(init.method==='POST'){assert.equal(JSON.parse(init.body).order_amount,amount);return Response.json({order_id:id,payment_session_id:'session'});}
    if(path.endsWith('/payments'))return Response.json([{cf_payment_id:'999',payment_status:'SUCCESS',payment_amount:amount,payment_currency:'INR'}]);
    return Response.json({order_id:id,order_amount:amount,order_currency:'INR',customer_details:{customer_id:uid},order_status:'PAID'});
   }
   return Response.json([selected]);
  };
  const created=res();await handler(req('create','POST',{planId,name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),created);assert.equal(created.code,200);assert.equal(confirmed,0);
  const q=req('status');q.query.order_id=id;const verified=res();await handler(q,verified);assert.equal(verified.code,200);assert.equal(verified.body.order.planId,planId);assert.equal(verified.body.order.activationStatus,'active');assert.equal(confirmed,1);
 });
}
test('method eligibility uses authoritative price and returns only enabled merchant methods',async()=>{
 setup();globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.includes('autoreply_plans?'))return Response.json([{id:'business',price_inr:1299,billing_days:30}]);assert.ok(path.endsWith('/eligibility/payment_methods'));assert.equal(JSON.parse(init.body).queries.amount,1299);assert.equal(init.headers['x-client-device'],'mobile');return Response.json([{entity_type:'payment_methods',entity_value:'upi',eligibility:true},{entity_type:'payment_methods',entity_value:'card',eligibility:false},{entity_type:'payment_methods',entity_value:'netbanking',eligibility:true,entity_details:{payment_method_details:[{display:'HDFC Bank',nick:'hdfc_bank',eligibility:true},{display:'Inactive Bank',eligibility:false}]}}]);};
 const q=req('methods','POST',{planId:'business',amount:1});q.headers['user-agent']='Android Chrome';const r=res();await handler(q,r);assert.equal(r.code,200);assert.equal(r.body.amount,1299);assert.deepEqual(r.body.methods.map((m:any)=>m.type),['upi','netbanking']);assert.equal(r.body.methods[1].banks.length,1);
});
test('Cashfree authentication failures return a safe actionable error without exposing provider payload',async()=>{
 setup();globalThis.fetch=async(url:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.includes('autoreply_plans?'))return Response.json([{price_inr:599}]);return Response.json({code:'request_failed',type:'authentication_error',message:'secret test-secret'},{status:401});};const r=res();await handler(req('methods','POST',{planId:'pro'}),r);assert.equal(r.code,503);assert.match(r.body.error,/merchant authentication failed/);assert.ok(!JSON.stringify(r.body).includes('test-secret'));
});
test('request_invalid on optional no-attempt history cannot block a verified unpaid order',async()=>{
 setup();let confirmed=0;
 globalThis.fetch=async(url:any)=>{const path=String(url);if(path.endsWith('/payments'))return Response.json({code:'request_invalid',type:'invalid_request_error'},{status:400});if(path.includes('rpc/autoreply_confirm')){confirmed++;throw new Error('Cannot activate unpaid order');}return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'ACTIVE',payment_session_id:'existing-session'});};
 const r=await reconcileOrder(order);assert.equal(r.status,'pending');assert.equal(r.payment_session_id,'existing-session');assert.equal(confirmed,0);
});
test('paid order verification never ignores payment-history request_invalid',async()=>{
 setup();let confirmed=0;
 globalThis.fetch=async(url:any)=>{const path=String(url);if(path.endsWith('/payments'))return Response.json({code:'request_invalid',type:'invalid_request_error'},{status:400});if(path.includes('rpc/autoreply_confirm'))confirmed++;return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'PAID'});};
 await assert.rejects(()=>reconcileOrder(order));assert.equal(confirmed,0);
});
test('status never returns a payable session for an order whose termination is pending',async()=>{
 setup();globalThis.fetch=async(url:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.includes('cashfree.com'))return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'TERMINATION_REQUESTED',payment_session_id:'closing-session'});return Response.json([order]);};
 const q=req('status');q.query.order_id=oid;const r=res();await handler(q,r);assert.equal(r.code,200);assert.equal(r.body.order.providerStatus,'TERMINATION_REQUESTED');assert.equal(r.body.paymentSessionId,undefined);
});

test('the local five-minute expiry hides QR while preserving an ACTIVE financial order',async()=>{
 setup();const old={...order,payment_expires_at:new Date(Date.now()-1000).toISOString(),checkout_state:'active'};
 globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.endsWith('/payments'))return Response.json([]);if(path.includes('cashfree.com'))return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'ACTIVE',payment_session_id:'old-session',order_expiry_time:new Date(Date.now()+86400000).toISOString()});if(init.method==='PATCH'){assert.notEqual(JSON.parse(init.body).status,'expired','never fake financial expiry');return Response.json([old]);}return Response.json([old]);};
 const q=req('status');q.query.order_id=oid;const r=res();await handler(q,r);assert.equal(r.code,200);assert.equal(r.body.order.status,'pending');assert.equal(r.body.order.checkoutState,'expired');assert.equal(r.body.order.paymentExpiresAt,old.payment_expires_at);assert.equal(r.body.paymentSessionId,undefined);
});
test('verified late success on a replaced order reaches durable review without a new charge',async()=>{
 setup();let confirmations=0;const old={...order,checkout_state:'superseded',payment_expires_at:new Date(Date.now()-60000).toISOString()};
 globalThis.fetch=async(url:any)=>{const path=String(url);if(path.includes('rpc/autoreply_confirm')){confirmations++;return Response.json({...old,status:'paid',activation_status:'review'});}if(path.endsWith('/payments'))return Response.json([{cf_payment_id:'987',payment_status:'SUCCESS',payment_amount:599,payment_currency:'INR'}]);return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'PAID'});};
 const r=await reconcileOrder(old);assert.equal(r.status,'paid');assert.equal(r.activation_status,'review');assert.equal(confirmations,1);
});
test('provider timeout retry retains immutable order, contact, deadline and idempotency key',async()=>{
 setup();const snapshot={...order,status:'creating',customer_details:{name:'Original Person',email:'original@example.test',phone:'9876543210'}};const bodies:string[]=[];let creates=0;
 globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.includes('rpc/autoreply_reserve'))return Response.json(snapshot);if(path.includes('cashfree.com')){assert.equal(init.headers['x-idempotency-key'],rid);bodies.push(init.body);if(++creates===1)throw Error('timeout');return Response.json({order_id:oid,payment_session_id:'same-session'});}return Response.json([{...snapshot,status:'pending'}]);};
 const first=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),first);assert.equal(first.code,503);assert.equal(first.body.order.orderId,oid);
 const retry=res();await handler(req('create','POST',{planId:'pro',name:'Changed Person',email:'changed@example.test',phone:'9876543211',requestId:rid}),retry);assert.equal(retry.code,200);assert.equal(bodies[0],bodies[1]);assert.equal(JSON.parse(bodies[0]).order_expiry_time,snapshot.payment_expires_at);
});
test('a session created concurrently with plan replacement is not returned as payable',async()=>{
 setup();globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.includes('rpc/autoreply_reserve'))return Response.json({...order,checkout_state:'active'});if(path.includes('cashfree.com'))return Response.json({order_id:oid,payment_session_id:'obsolete-session'});return Response.json([{...order,checkout_state:'superseded'}]);};const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);assert.equal(r.code,200);assert.equal(r.body.order.checkoutState,'superseded');assert.equal(r.body.paymentSessionId,undefined);
});

test('provider expiry never mutates the immutable Create Order deadline',async()=>{
 setup();const source={...order,checkout_state:'active'};const shorter=new Date(Date.now()+15000).toISOString();
 globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.endsWith('/payments'))return Response.json([]);if(path.includes('cashfree.com'))return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'ACTIVE',order_expiry_time:shorter,payment_session_id:'session'});const patch=JSON.parse(init.body);assert.equal(patch.payment_expires_at,undefined);assert.equal(patch.provider_expires_at,shorter);return Response.json([{...source,...patch}]);};const result=await reconcileOrder(source);assert.equal(result.payment_expires_at,source.payment_expires_at);assert.equal(result.provider_expires_at,shorter);
});
test('payment winning the Create Order save race returns its paid result without QR',async()=>{
 setup();globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('/auth/'))return Response.json({id:uid});if(path.includes('rpc/autoreply_reserve'))return Response.json(order);if(path.includes('cashfree.com'))return Response.json({order_id:oid,payment_session_id:'obsolete'});if(init.method==='PATCH')return Response.json([]);return Response.json([{...order,status:'paid',activation_status:'active'}]);};const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);assert.equal(r.code,200);assert.equal(r.body.order.status,'paid');assert.equal(r.body.paymentSessionId,undefined);
});
test('a missing payment deadline cannot expose a payable session',()=>{assert.equal(checkoutPayable({...order,payment_expires_at:undefined}),false);});

test('payment winning an unpaid status refresh never exposes another payable QR',async()=>{
 setup();const source={...order,checkout_state:'active'};let reads=0;
 globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.endsWith('/payments'))return Response.json([]);if(path.includes('cashfree.com'))return Response.json({order_id:oid,order_amount:599,order_currency:'INR',customer_details:{customer_id:uid},order_status:'ACTIVE',payment_session_id:'stale-session'});if(init.method==='PATCH')return Response.json([]);reads++;return Response.json([{...source,status:'paid',activation_status:'active'}]);};const result=await reconcileOrder(source);assert.equal(reads,1);assert.equal(result.status,'paid');assert.equal(checkoutPayable(result),false);
});
