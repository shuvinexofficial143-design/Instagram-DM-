/** Private, synthetic-only A/B measurement. Does not read/write customer data or send Instagram messages. */
import {memoryCriticalFacts,memoryValidateFacts,memoryMergeFacts,memoryGenerateSummary,memorySummaryBatch,type MemorySource,type MemorySnapshot} from '../instagram-live-webhook/smartMemory.ts';
import {generateCatalogReply} from '../instagram-live-webhook/catalogRuntime.ts';
export function memoryBenchmarkSources(count:number):MemorySource[]{
 if(![10,50,100,500].includes(count))throw Error('invalid_benchmark_size');
 return Array.from({length:count},(_,i)=>({id:'synthetic-'+(i+1),seq:i+1,direction:i%2===0?'out':'in',is_automated:i!==0,
  timestamp:new Date(Date.now()-90*86400000+i*60000).toISOString(),text:i===0?'Hello! I can demonstrate Instagram DM and comment automation for your business.':i===1?'मेरा Gift Business है और मुझे Instagram DM Automation चाहिए। My budget is 5000 INR.':count>=100&&i===Math.floor(count/2)+1?'अब requirement वही है। My budget is now 8000 INR.':i%2?'हाँ, समझ आया। बाकी बातों पर हम बाद में बात करेंगे।':'ठीक है, बाकी बातों को बाद में आगे बढ़ाएँगे।'}));
}
function memoryBenchmarkState(raw:any,sources:MemorySource[]):MemorySnapshot{return {summary:String(raw?.summary||'').slice(0,2400),facts:memoryValidateFacts(raw?.facts,sources),version:Number(raw?.version||0)};}
export async function memoryBenchmarkStep(options:{key:string;count:number;offset:number;state?:any;fetcher?:typeof fetch}){
 const all=memoryBenchmarkSources(options.count),offset=options.offset;
 if(!Number.isInteger(offset)||offset<0||offset>=all.length)throw Error('invalid_benchmark_offset');
 const batch=memorySummaryBatch(all.slice(offset)),previous=memoryBenchmarkState(options.state,all);
 previous.facts=memoryMergeFacts(previous.facts,memoryCriticalFacts(batch));
 const result=await memoryGenerateSummary({key:options.key,previous,sources:batch,fetcher:options.fetcher});
 return {state:{summary:result.summary,facts:memoryMergeFacts(previous.facts,result.facts),version:(previous.version||0)+1},checkpoint:offset+result.source_ids.length,usage:result.usage};
}
export async function memoryBenchmarkReplies(options:{key:string;count:number;state:any;fetcher?:typeof fetch}){
 const all=memoryBenchmarkSources(options.count),snapshot=memoryBenchmarkState(options.state,all),recent=all.slice(-12).map(s=>({id:s.id,role:s.direction==='out'?'assistant':'user',content:s.text}));
 const opening={id:all[0].id,role:'assistant',content:all[0].text};
 const beforeHistory=recent.some(m=>m.id===opening.id)?recent:[opening,...recent];
 const systemPrompt='You are the Auto Replys sales assistant. We offer Instagram AI DM automation, keyword DMs, comment replies and story replies. Demonstrate the relevant flow concisely using the customer requirements actually known. Do not invent customer details, prices or completed actions. Explain a simple demo and ask at most one necessary question. Match the customer language.';
 const text='अच्छा वो Demo दिखाओ, मेरे business और budget के हिसाब से।';
 const call=async(after:boolean)=>{
  const usage={input_tokens:0,output_tokens:0,calls:0,provider_ms:0,usage_available:false};const start=Date.now();
  const result=await generateCatalogReply({key:options.key,systemPrompt,text,history:after?recent:beforeHistory,manualAnchorId:after?undefined:opening.id,memory:after?snapshot:null,memorySettings:{enabled:after},fetcher:options.fetcher,
   ...(after?{historySearch:async(query:string)=>all.filter(s=>query.toLocaleLowerCase().split(/\s+/).some(key=>key.length>2&&s.text.toLocaleLowerCase().includes(key))).slice(0,4).map(s=>({id:s.id,text:s.text,direction:s.direction,timestamp:s.timestamp}))}:{}),
   onUsage:value=>{usage.input_tokens+=value.input_tokens;usage.output_tokens+=value.output_tokens;usage.calls+=value.calls;usage.provider_ms+=value.provider_ms;usage.usage_available=usage.usage_available||value.usage_available;},
  });return {reply:result.text||'[Human handoff requested]',usage,wall_ms:Date.now()-start};
 };
 return {messages:options.count,before:await call(false),after:await call(true),synthetic_only:true};
}
