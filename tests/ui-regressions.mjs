/** Offline render checks. Authentication and storage are mocked only in this test bundle. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { Writable } from 'node:stream';

const root = path.resolve(import.meta.dirname, '..');
const tmp = await mkdtemp(path.join(root,'node_modules','.ui-regressions-'));
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const noop = () => {};
const empty = {
  user:{id:'test-workspace',name:'Sample owner',email:'owner@example.test',plan:'free',created_at:'2026-10-01',trial_expires_at:'2026-11-01'},
  firebaseUser:null,authLoading:false,isAdmin:false,isGuestMode:false,activeTab:'home',
  instagramAccount:null,instagramAccounts:[],workspaceId:'test-workspace',accountSwitching:false,accountError:'',instagramConnectMode:'reconnect',automations:[],contacts:[],inboxMessages:[],webhookLogs:[],pausedAiUsers:[],
  isBuilderOpen:false,isConnectModalOpen:false,isRenewModalOpen:false,editingAutomation:null,
  isAiPausedForUser:()=>false,
};
const fixture = (overrides={}) => new Proxy({...empty,...overrides},{get:(obj,key)=>key in obj?obj[key]:noop});
globalThis.__uiFixture = fixture();
globalThis.window = {location:{pathname:'/',search:'',origin:'https://example.test'},confirm:()=>false};
globalThis.fetch = () => {throw Error('UI render tests must not call a live API');};
const streamRender = (element) => new Promise((resolve,reject)=>{
  let html='';
  let piped=false;
  const sink=new Writable({write(chunk,encoding,next){html+=chunk.toString();next();}});
  sink.on('finish',()=>resolve(html));sink.on('error',reject);
  const stream=renderToPipeableStream(element,{onAllReady(){if(!piped){piped=true;stream.pipe(sink);}},onError:reject});
});
let checks=0;
try {
  const authSource = await readFile(path.join(root,'src/lib/supabase.ts'),'utf8');
  const exportNames = [...authSource.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m=>m[1]);
  await build({
    stdin:{contents:`export {default as App} from './src/App';
      export {Sidebar} from './src/components/Sidebar';
      export {BillingUsagePage} from './src/components/Billing/BillingUsagePage';
      export {Header} from './src/components/Header';
      export {HomePage} from './src/components/Home/HomePage';
      export {AnalyticsPage} from './src/components/Analytics/AnalyticsPage';
      export {AiAssistantSetup} from './src/components/Automations/AiAssistantSetup';
      export {AutomationBuilder} from './src/components/Automations/AutomationBuilder';
      export {AutomationsPage} from './src/components/Automations/AutomationsPage';
      export {relativeAutomationTime, matchesPreviewMessage, uniqueAutomationName} from './src/lib/automationPresentation';
      export {normalizeActivityLog} from './src/lib/activityLogs';
      export {AutomationReviewPhone} from './src/components/Automations/AutomationReviewPhone';
      export {InstagramAccounts} from './src/components/Common/InstagramAccounts';
      export {ActivityLogsPage} from './src/components/Activity/ActivityLogsPage';
      export {workspaceNavigation,WorkspaceTabs} from './src/components/WorkspaceNavigation';
      export {publicSupportPage} from './src/lib/navigation';`,resolveDir:root,loader:'tsx'},
    bundle:true,platform:'node',format:'esm',outfile:path.join(tmp,'ui.mjs'),packages:'external',jsx:'automatic',
    plugins:[{name:'isolated-ui-fixtures',setup(builder){
      builder.onResolve({filter:/context\/AppContext$/},()=>({path:'context',namespace:'fixture'}));
      builder.onResolve({filter:/lib\/supabase$/},()=>({path:'auth',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='context'
        ? `export const useApp=()=>globalThis.__uiFixture; export const AppProvider=({children})=>children;`
        : exportNames.map(name=>`export const ${name}=${name==='auth'?'{currentUser:null}':name==='supabase'||name==='db'?'{}':name==='isSupabaseInitialized'?'true':name==='googleProvider'?"{providerId:'google'}":'()=>{}'};`).join('\n')}));
    }}],
  });
  const ui = await import(pathToFileURL(path.join(tmp,'ui.mjs')));
  for (const [route,heading] of [
    ['/','More conversations.'],['/help','Help Center'],['/help/faq','Frequently Asked Questions'],
    ['/help/billing','Billing &amp; Subscription Help'],['/about','About'],['/privacy','Privacy Policy'],['/terms','Terms of Service'],
  ]) {
    window.location.pathname=route;globalThis.__uiFixture=fixture();
    const html=await streamRender(React.createElement(ui.App));
    assert.ok(html.includes(heading),`${route} renders its public page`);
    assert.ok(!html.includes('Welcome back'),`${route} does not gate public information behind login`);
    checks++;
  }
  for(const route of ['/help','/help/faq/','/help/billing','/privacy','/terms']) assert.ok(ui.publicSupportPage(route));
  assert.equal(ui.publicSupportPage('/admin'),undefined);checks++;
  window.location.pathname='/';
  let html=await streamRender(React.createElement(ui.App));
  for(const price of ['₹0','₹299','₹599','₹1,299'])assert.ok(html.includes(price));
  assert.ok(html.includes('Example conversation'));assert.ok(html.includes('1,500 total messages'));checks++;
  window.location.pathname='/login';window.location.search='?mode=signup';
  html=await streamRender(React.createElement(ui.App));
  assert.ok(html.includes('Create your account'));assert.ok(html.includes('id="auth-email"'));assert.ok(html.includes('for="auth-email"'));checks++;
  window.location.search='';
  for (const [tab,heading] of [
    ['home','Dashboard'],['inbox','Inbox'],['automations','Active Automations'],['contacts','Contact list'],['crm','Sales pipeline'],
    ['knowledge','Knowledge Base'],['catalog','Catalogs'],['lead-forms','Lead &amp; Address Forms'],['analytics','Analytics'],
    ['settings','Settings'],['integrations','Integrations'],['activity','Activity'],['billing','Billing &amp; Usage'],
  ]) {
    globalThis.__uiFixture=fixture({firebaseUser:{uid:'test-user',displayName:'Sample owner'},activeTab:tab});
    const rendered=await streamRender(React.createElement(ui.App));
    assert.ok(rendered.includes(heading),`${tab} renders without errors`);checks++;
  }
  globalThis.__uiFixture=fixture();
  html=renderToStaticMarkup(React.createElement(ui.HomePage));
  for(const removed of ['Set up your Instagram assistant','Connect Instagram</strong>','Add business knowledge','Test &amp; publish an automation']) assert.ok(!html.includes(removed),`dashboard does not render removed setup box: ${removed}`);assert.ok(!html.includes('Webhook Connection'));assert.ok(!html.includes('Disconnect account'));checks++;
  // Equal series must keep both colors visible; sparse activity cannot dip below zero.
  globalThis.__uiFixture=fixture({inboxMessages:['in','out'].map((direction,index)=>({id:String(index),direction,timestamp:new Date().toISOString(),ig_user_id:'sample'}))});
  html=renderToStaticMarkup(React.createElement(ui.AnalyticsPage));
  assert.ok(html.includes('Daily incoming Instagram DMs and replies'));
  assert.ok(!html.includes('3-day average trend'));
  assert.ok(html.includes('stroke-dasharray="7 7"'),'equal series retain both colors without shifting counts');
  const lines=[...html.matchAll(/<path d="([^"]+)" fill="none" stroke="(#[^"]+)" stroke-width="([^"]+)"/g)];
  assert.equal(lines.length,2);assert.equal(lines[0][1],lines[1][1]);
  assert.equal(lines[0][3],lines[1][3],'both series use the same line weight');
  const coordinates=lines[0][1].match(/\d+(?:\.\d+)?/g).map(Number);
  for(let i=1;i<coordinates.length;i+=2)assert.ok(coordinates[i]<=308 && coordinates[i]>=12,'curve stays inside count bounds');
  assert.ok(lines[0][1].endsWith('234'),'one message is plotted at one on the 0–4 scale without averaging');
  checks++;
  globalThis.__uiFixture=fixture({isBuilderOpen:true});
  html=renderToStaticMarkup(React.createElement(ui.AutomationBuilder));
  assert.ok(html.includes('What should start this automation?'));assert.ok(!html.includes('Name your automation'));assert.ok(html.includes('aria-label="Close automation builder"'));checks++;
  const setupProps={prompt:'Reply only using approved business facts.',onPromptChange:noop,testInput:'',onTestInputChange:noop,testMessage:'',testReply:'',testError:'',testing:false,onTest:noop,sheetsConnected:false,sheetsEmail:'',sheetsLoading:false,onConnectSheets:noop,promptTools:null,sheetControls:null,replySettings:null};
  html=renderToStaticMarkup(React.createElement(ui.AiAssistantSetup,setupProps));
  assert.ok(html.includes('System prompt'));assert.ok(html.includes('id="ai-system-prompt"'));assert.ok(html.includes('for="ai-system-prompt"'));assert.ok(html.includes('Connect Google Sheets'));assert.ok(html.includes('data:image/png;base64,'));assert.ok(html.includes('Test messages stay inside this preview'));checks++;
  html=renderToStaticMarkup(React.createElement(ui.AiAssistantSetup,{...setupProps,testMessage:'Question',testError:'Could not test',sheetsConnected:true,sheetsEmail:'test@example.test'}));
  assert.ok(html.includes('role="alert"'));assert.ok(html.includes('Could not test'));assert.ok(!html.includes('Test reply received'));assert.ok(html.includes('Connected'));assert.ok(html.includes('Change account'));checks++;
  const clock = Date.parse('2026-10-06T12:00:00Z');
  assert.equal(ui.relativeAutomationTime('2026-10-06T09:00:00Z',clock),'3 hours ago');
  assert.equal(ui.relativeAutomationTime('2026-10-06T09:00:00Z',clock+3600000),'4 hours ago');
  assert.equal(ui.relativeAutomationTime('invalid',clock),'Time unavailable');
  assert.equal(ui.relativeAutomationTime('2026-10-07T12:00:00Z',clock),'Just now');checks++;
  globalThis.__uiFixture=fixture({activeTab:'automations',automations:[{id:'comment-rule',name:'Product link',trigger_type:'comment',trigger_config:{all_or_keywords:'keywords',keywords:['LINK','PRICE'],selected_media_id:'post1'},actions:[{id:'send',type:'send_dm',message_text:'Here is your product link.'}],status:'paused',stats:{runs:0,dms_sent:0,unique_users:0},created_at:'2026-09-01',updated_at:'2026-09-01'}]});
  html=renderToStaticMarkup(React.createElement(ui.AutomationsPage));
  for(const text of ['Paused','Selected post or reel','LINK','PRICE','Here is your product link.','Edit automation','Last updated:']) assert.ok(html.includes(text),text);
  assert.ok(!html.includes('3 hours ago')); assert.ok(!html.includes('Recently active'));
  assert.ok(html.includes('role="switch"'));assert.ok(html.includes('aria-checked="false"'));checks++;
  globalThis.__uiFixture=fixture({activeTab:'automations',automations:[{id:'ai-rule',name:'AI assistant',trigger_type:'dm_ai_conversation',trigger_config:{all_or_keywords:'ai_conversation',keywords:[]},actions:[{id:'ai',type:'ai_chatbot',ai_system_instruction:'Answer from the store catalogue.'},{id:'send',type:'send_dm'}],status:'active',stats:{runs:12,dms_sent:12,unique_users:0},created_at:'2026-09-01',updated_at:'2026-09-01'}]});
  html=renderToStaticMarkup(React.createElement(ui.AutomationsPage));
  for(const text of ['AI instructions','Answer from the store catalogue.','Every incoming message','Send AI reply'])assert.ok(html.includes(text),text);
  assert.ok(html.includes('aria-checked="true"'));assert.ok(!html.includes('Comment Replies'));checks++;
  globalThis.__uiFixture=fixture({activeTab:'settings'});
  html=renderToStaticMarkup(React.createElement(ui.WorkspaceTabs));
  assert.ok(html.includes('workspace-settings-tabs'));for(const text of ['Account','Integrations','Activity logs'])assert.ok(html.includes(text));assert.ok(html.includes('aria-current="page"'));checks++;
  assert.equal(ui.matchesPreviewMessage('please send PRICE','keywords',['price']),true);
  assert.equal(ui.matchesPreviewMessage('hello','keywords',['price']),false);
  assert.equal(ui.matchesPreviewMessage('hello','all',[]),true);
  assert.equal(ui.uniqueAutomationName('DM Reply',[{name:'DM Reply'},{name:'dm reply 2'}]),'DM Reply 3');checks++;
  for(const type of ['comment','story_reply','dm']) {
    globalThis.__uiFixture=fixture();
    html=renderToStaticMarkup(React.createElement(ui.AutomationReviewPhone,{type,message:'Reply should only appear after testing',buttons:[],mode:'keywords',keywords:['PRICE']}));
    assert.ok(html.includes('Test customer message'));assert.ok(html.includes('Send test message'));assert.ok(html.includes('Start by typing below'));
    assert.ok(!html.includes('Reply should only appear after testing'));assert.ok(!html.includes('Sent you a DM'));checks++;
  }
  const log=ui.normalizeActivityLog({id:'real-event',status:'failed',sender_id:'customer',trigger_type:'dm',incoming_text:'price',send_error:'Permission denied',updated_at:'2026-10-06T12:00:00Z',total_ms:120});
  assert.equal(log.status,'error');assert.equal(log.error_message,'Permission denied');assert.equal(log.timestamp,'2026-10-06T12:00:00Z');
  globalThis.__uiFixture=fixture({webhookLogs:[log]});html=renderToStaticMarkup(React.createElement(ui.ActivityLogsPage));
  assert.ok(html.includes('Permission denied'));assert.ok(html.includes('120 ms'));checks++;
  globalThis.__uiFixture=fixture({workspaceId:'account-b',instagramAccounts:[{workspaceId:'account-a',account:{username:'first_business',status:'connected'}},{workspaceId:'account-b',account:{username:'second_business',status:'connected'}}]});
  html=renderToStaticMarkup(React.createElement(ui.InstagramAccounts));for(const label of ['first_business','second_business','Current account','Add Instagram account','Switch account'])assert.ok(html.includes(label));checks++;
  html=renderToStaticMarkup(React.createElement(ui.Sidebar));assert.ok(html.includes('sidebar-account-switch'));assert.ok(html.includes('value="account-b" selected=""'));checks++;
  assert.deepEqual(ui.workspaceNavigation.filter(item=>!['settings','help','billing'].includes(item.id)).map(item=>item.id),['home','knowledge','automations','inbox','contacts','analytics']);checks++;
  const allTabs=ui.workspaceNavigation.flatMap(item=>item.tabs);
  for(const tab of ['contacts','crm','knowledge','catalog','lead-forms','settings','integrations','activity'])assert.ok(allTabs.includes(tab));
  assert.ok(ui.workspaceNavigation.length<15);checks++;
  for (const currentPlan of ['free','business']) {
    globalThis.__uiFixture=fixture({user:{...empty.user,plan:currentPlan}});
    html=renderToStaticMarkup(React.createElement(ui.BillingUsagePage));
    assert.ok(html.includes('Add Money'));
    assert.ok(html.includes('aria-controls="reply-top-ups"'));
    assert.ok(html.includes('Compare plans in detail'));
    for(const price of ['₹0','₹299','₹599','₹1,299']) assert.ok(html.includes(price));
    assert.ok(html.includes('Billing history is not connected yet'));
    assert.ok(!html.includes('No payments yet'));
    assert.ok(html.includes('scope="row">Instagram accounts'));
    assert.ok(html.includes('billing-special-plan'));
    checks++;
  }
  globalThis.__uiFixture=fixture();
  html=renderToStaticMarkup(React.createElement(ui.Sidebar));
  assert.ok(html.includes('Contact &amp; support'));
  assert.ok(html.includes('View plans'));
  assert.ok(!html.includes('sidebar-profile'));
  assert.equal((html.match(/aria-label="Account settings"/g)||[]).length,1);
  checks++;
  globalThis.__uiFixture=fixture({activeTab:'crm'});
  html=renderToStaticMarkup(React.createElement(ui.WorkspaceTabs));
  assert.ok(html.includes('Sales pipeline'));assert.ok(html.includes('aria-current="page"'));checks++;
  console.log(`PASS: ${checks} public routing, pricing, signup, workspace rendering and guided-setup checks.`);
} finally {
  globalThis.window=originalWindow;globalThis.fetch=originalFetch;delete globalThis.__uiFixture;
  await rm(tmp,{recursive:true,force:true});
}
