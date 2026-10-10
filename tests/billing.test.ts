import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import handler from '../api/billing.ts';
import {billingConfig,validatedCustomer,validateProviderPayment,verifyCashfreeSignature} from '../src/server/cashfree.ts';
const originalFetch=globalThis.fetch;
const originalEnv={...process.env};
const uid='00000000-0000-4000-8000-000000000001';
const oid='ar_sandbox_00000000-0000-4000-8000-000000000003';
const rid='00000000-0000-4000-8000-000000000002';
const order={order_id:oid,owner_user_id:uid,plan_id:'pro',environment:'sandbox',amount_inr:599,currency:'INR',billing_days:30,request_id:rid,status:'pending'};
function setup(){Object.assign(process.env,{CASHFREE_CLIENT_ID:'test-id',CASHFREE_CLIENT_SECRET:'test-secret',CASHFREE_ENV:'sandbox',SUPABASE_SERVICE_ROLE_KEY:'server-secret',APP_URL:'https://example.test'});}
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
 const provider={order_id:oid,order_amount:599,order_currency:'INR',order_status:'PAID'};
 assert.equal(validateProviderPayment(order,provider,[payment]).cf_payment_id,'123');
 assert.equal(validateProviderPayment(order,{...provider,order_status:'ACTIVE'},[payment]),null);
 for(const change of [{order_id:'other'},{order_amount:1},{order_currency:'USD'}])assert.throws(()=>validateProviderPayment(order,{...provider,...change},[payment]));
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
   if(path.includes('rpc/autoreply_reserve')){const body=JSON.parse(init.body);assert.equal(body.p_owner_id,uid);assert.equal(body.p_plan_id,'pro');return Response.json(order);}
  if(path.includes('cashfree.com')){providerCalls++;const body=JSON.parse(init.body);assert.equal(body.order_amount,599);assert.equal(body.order_id,oid);assert.equal(init.headers['x-idempotency-key'],rid);assert.equal(body.order_meta.return_url,'https://example.test/billing/checkout?order_id='+oid);return Response.json({order_id:oid,payment_session_id:'session'});}
  return Response.json([{...order,payment_session_id:'session'}]);
 };
 const q=req('create','POST',{planId:'pro',amount:1,name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid});
 // Vercel exposes a lazy parsed-JSON getter; reading it consumes the raw request.
 Object.defineProperty(q,'body',{get(){throw new Error('Vercel JSON body getter must not be read');}});
 const r=res();await handler(q,r);assert.equal(r.code,200);assert.equal(r.body.order.amount,599);assert.equal(providerCalls,1);
});
test('a prior unfinished Starter order yields a helpful conflict for Pro, never a generic storage error',async()=>{
 setup();
 const old={...order,plan_id:'starter',amount_inr:299,order_id:'ar_sandbox_00000000-0000-4000-8000-000000000004'};
 globalThis.fetch=async(url:any)=>{
  const path=String(url);
  if(path.includes('/auth/'))return Response.json({id:uid});
  if(path.includes('status=in.(creating,pending)'))return Response.json([old]);
  if(path.endsWith('/payments'))return Response.json([]);
  if(path.includes('cashfree.com'))return Response.json({order_id:old.order_id,order_amount:299,order_currency:'INR',order_status:'ACTIVE',payment_session_id:'old-session'});
  throw new Error('No new order may be created when another plan is pending');
 };
 const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);
 assert.equal(r.code,409);assert.equal(r.body.code,'PENDING_OTHER_PLAN');assert.equal(r.body.pendingOrder.planId,'starter');
});
test('customer may explicitly terminate an unpaid provider order to switch plans',async()=>{
 setup();let terminateCount=0;
 globalThis.fetch=async(url:any,init:any)=>{
  const path=String(url);
  if(path.includes('/auth/'))return Response.json({id:uid});
  if(path.includes('cashfree.com')){
    if(init?.method==='PATCH'){terminateCount++;return Response.json({order_id:oid,order_status:'TERMINATED'});}
    if(path.endsWith('/payments'))return Response.json([]);
    return Response.json({order_id:oid,order_amount:599,order_currency:'INR',order_status:terminateCount?'TERMINATED':'ACTIVE',payment_session_id:'old-session'});
  }
  if(init?.method==='PATCH')return Response.json([{...order,status:'expired'}]);
  return Response.json([order]);
 };
 const r=res();await handler(req('cancel','POST',{orderId:oid}),r);
 assert.equal(r.code,200);assert.equal(terminateCount,1);assert.equal(r.body.order.status,'expired');
});
test('provider termination request in progress never unlocks another payable order',async()=>{
 setup();
 globalThis.fetch=async(url:any,init:any)=>{
  const path=String(url);
  if(path.includes('/auth/'))return Response.json({id:uid});
  if(path.includes('cashfree.com')){
    if(init?.method==='PATCH')return Response.json({order_status:'TERMINATION_REQUESTED'});
    if(path.endsWith('/payments'))return Response.json([]);
    return Response.json({order_id:oid,order_amount:599,order_currency:'INR',order_status:'ACTIVE',payment_session_id:'old-session'});
  }
  return Response.json([order]);
 };
 const r=res();await handler(req('cancel','POST',{orderId:oid}),r);
 assert.equal(r.code,409);assert.ok(r.body.error.includes('still closing'));
});
test('signed successful webhook rechecks provider and finalizes the durable order; failures never downgrade paid',async()=>{
 setup();let confirmations=0;
 globalThis.fetch=async(url:any,init:any)=>{const path=String(url);if(path.includes('rpc/autoreply_confirm')){confirmations++;const body=JSON.parse(init.body);assert.equal(body.p_environment,'sandbox');assert.equal(body.p_amount,599);return Response.json({...order,status:'paid',activation_status:'test'});}if(path.endsWith('/payments'))return Response.json([{cf_payment_id:'123',payment_amount:599,payment_currency:'INR',payment_status:'SUCCESS'}]);if(path.includes('cashfree.com'))return Response.json({order_id:oid,order_amount:599,order_currency:'INR',order_status:'PAID'});return Response.json([order]);};
 for(const type of ['PAYMENT_SUCCESS_WEBHOOK','PAYMENT_FAILED_WEBHOOK']){const event={type,data:{order:{order_id:oid}}};const q=req('webhook','POST',event);Object.defineProperty(q,'body',{get(){throw new Error('Webhook must use original stream, not parsed body');}});q.headers['x-webhook-timestamp']='1791356400000';q.headers['x-webhook-signature']=createHmac('sha256','test-secret').update(q.headers['x-webhook-timestamp']).update(JSON.stringify(event)).digest('base64');const r=res();await handler(q,r);assert.equal(r.code,200);}
 assert.equal(confirmations,1);
});
test('forged webhook is rejected before any database or provider access',async()=>{setup();globalThis.fetch=async()=>{throw new Error('Should not fetch');};const r=res();await handler(req('webhook','POST',{type:'PAYMENT_SUCCESS_WEBHOOK'}),r);assert.equal(r.code,401);});
test('provider timeout never creates a second order in one request',async()=>{
 setup();let calls=0;globalThis.fetch=async(url:any)=>{if(String(url).includes('/auth/'))return Response.json({id:uid});if(String(url).includes('status=in.(creating,pending)'))return Response.json([]);if(String(url).includes('/rest/'))return Response.json(order);calls++;throw new Error('timeout');};const r=res();await handler(req('create','POST',{planId:'pro',name:'Example Person',email:'person@example.test',phone:'9876543210',requestId:rid}),r);assert.equal(r.code,503);assert.equal(calls,1);
});
