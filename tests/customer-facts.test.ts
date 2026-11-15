import assert from 'node:assert/strict';
import test from 'node:test';
import {deterministicCustomerFacts,validateCustomerFacts,scanCustomerFacts,customerFactValues,repeatedCustomerQuestion} from '../supabase/functions/instagram-live-webhook/customerFacts';
import {businessPrompt,DM_AI_MODEL} from '../supabase/functions/instagram-live-webhook/openaiConfig';
import {memoryBuildContext,orderAcknowledgement} from '../supabase/functions/instagram-live-webhook/smartMemory';
import {generateCatalogReply} from '../supabase/functions/instagram-live-webhook/catalogRuntime';
const source={id:'in-1',timestamp:'2026-11-14T12:00:00Z',text:'1. Ek\n2. Arun Kumar Sharma\n3. 9876543210\n4. Sant Hari Nagar, Naygaon Road, Sinnar, Ji. Nashik'};
const known={facts:deterministicCustomerFacts(source)};
test('numbered combined details retain quantity, full name, phone and the complete raw address',()=>{
 const values=customerFactValues(known);assert.equal(values.name,'Arun Kumar Sharma');assert.equal(values.quantity,'Ek');assert.equal(values.phone,'9876543210');assert.match(values.address,/Naygaon Road/);assert.equal(values.pincode,undefined);
});
test('a PIN is not a phone, quantity, name or proof of deliverability',()=>{
 const pin={id:'pin',timestamp:source.timestamp,text:'422103'};
 const fields=deterministicCustomerFacts(pin,'आप कितने मँगवाना चाहेंगे?');assert.deepEqual(Object.keys(fields),['pincode']);assert.equal(fields.pincode?.value,'422103');
 assert.equal(deterministicCustomerFacts({...pin,text:'012345'}).pincode,undefined);
 assert.equal(deterministicCustomerFacts({...pin,text:'Order ID 9876543210'}).phone,undefined);
});
test('invented geography, foreign source IDs and copied assistant details cannot become customer facts',()=>{
 const fields=validateCustomerFacts({state:{value:'Maharashtra',evidence:'Ji. Nashik',source_message_id:source.id},name:{value:'Arun Kumar Sharma',evidence:'Arun Kumar Sharma',source_message_id:'other-user'}},[source]);assert.deepEqual(fields,{});
});
test('kar diya cannot overwrite a known name; explicit name correction can',async()=>{
 const reply={id:'in-2',timestamp:'2026-11-14T12:05:00Z',text:'Kr Diya bro Aacha business he maje kro'};
 const result=await scanCustomerFacts({key:'test',sources:[reply],previous:known,history:[{role:'assistant',content:'आपका नाम?'}],fetcher:async()=>Response.json({choices:[{message:{content:JSON.stringify({facts:{name:{value:'Diya',evidence:'Diya',source_message_id:reply.id},product:{value:'business',evidence:'business',source_message_id:reply.id}}})}}]})});
 assert.equal(result.facts.name?.value,'Arun Kumar Sharma');assert.equal(result.facts.product,undefined);
 const corrected={...reply,text:'My correct name is Arun Verma'};
 assert.equal(validateCustomerFacts({name:{value:'Arun Verma',evidence:'Arun Verma',source_message_id:reply.id}},[corrected],known).name?.value,'Arun Verma');
});
test('the complete long Hindi business prompt and recent address survive the default context budget',()=>{
 const prompt=('नियम: ग्राहक की जानकारी दोबारा मत पूछो।\n').repeat(500)+'END_OF_COMPLETE_RULES';
 assert.equal(businessPrompt(prompt),prompt);
 const history=Array.from({length:20},(_,i)=>({id:String(i),role:i===1?'user':'assistant',content:i===1?source.text:'बातचीत '+i}));
 const ctx=memoryBuildContext({system:businessPrompt(prompt),history,current:'422103',settings:{recent_limit:20}});
 assert.equal(ctx.recent_messages,20);assert.match(ctx.messages[0].content,/END_OF_COMPLETE_RULES/);assert.ok(ctx.messages.some(m=>m.content===source.text));
 assert.throws(()=>businessPrompt('x'.repeat(60001)),/never silently cut/);
 assert.throws(()=>memoryBuildContext({system:'x'.repeat(9000),history:[],current:'Hi',settings:{input_token_budget:8192}}),/too small/);
});
test('live generation uses Luna with compatible token parameters and retries a request for known details',async()=>{
 let calls=0;const result=await generateCatalogReply({key:'test',systemPrompt:'Sell a necklace for ₹360.',history:[],text:'422103',customerFacts:known,fetcher:async(_url,init)=>{
  calls++;const body=JSON.parse(String(init?.body));assert.equal(body.model,DM_AI_MODEL);assert.equal(body.reasoning_effort,'none');assert.ok(body.max_completion_tokens>=4096);assert.equal(body.max_tokens,undefined);assert.equal(body.temperature,undefined);assert.match(JSON.stringify(body.messages),/9876543210/);
  return Response.json({choices:[{message:{content:calls===1?'कृपया अपना पूरा नाम बताइए।':'आपकी जानकारी मिल गई है। कृपया राज्य बता दीजिए।'}}]});
 }});assert.equal(calls,2);assert.match(result.text||'',/राज्य/);
});
test('question guard detects repeated field requests and more than two questions',()=>{
 assert.equal(repeatedCustomerQuestion('कृपया अपना मोबाइल नंबर बताइए।',known),true);
 assert.equal(repeatedCustomerQuestion('क्या आपका नाम और पता सही है?',known),false);
 assert.equal(repeatedCustomerQuestion('Name? City? State?',known),true);
});
test('native Roman Hindi order acknowledgement is retained as conversation evidence',()=>{
 assert.equal(orderAcknowledgement('Okay aap ka order confirm ho gya hai'),true);
 assert.equal(orderAcknowledgement('Aap ka order confirm ho gya hai kya?'),false);
});
