import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
const root=process.cwd(),temp=await fs.mkdtemp(path.join(root,'.customer-layout-'));
const output=path.join(root,'test-results/customer-data-layout');await fs.mkdir(output,{recursive:true});
const fields=['Name','Phone','City','Product','Quantity','Address','State','PIN Code','District','Delivery notes'];
const collections=[{id:'c1',automation_id:'a1',automation_name:'AI DM Conversation',version:1,fields,active:true,automation_status:'active',customer_count:33,schema_revision:2},{id:'c2',automation_id:'a2',automation_name:'AI DM Conversation 2',version:1,fields:['Name','Phone'],active:true,automation_status:'active',customer_count:1}];
const records=Array.from({length:25},(_,i)=>({id:'r'+i,collection_id:'c1',customer_key:'customer'+i,username:'synthetic_customer_'+i,instagram_id:'1234567890'+i,data:Object.fromEntries(fields.map(f=>[f,f==='Address'?'Apartment 12, '+'A long road and locality '.repeat(12):f==='Name'?'Synthetic Customer '+i:f==='Phone'?'9876543210':f==='Delivery notes'?'x'.repeat(500):'Not shared'])),created_at:'2026-11-15T12:00:00Z',updated_at:'2026-11-15T13:00:00Z'}));
const app=await fs.readFile('src/App.tsx','utf8');
const shellClass=app.match(/className="(flex min-h-\[100dvh\] w-full[^"]+)"/)?.[1];
const contentClass=app.match(/className="(flex min-w-0 flex-1 flex-col[^"]+)"/)?.[1];
const mainClass=app.match(/<main className="([^"]+)"/)?.[1]||'app-unified-theme customer-data-main min-w-0 flex-1 bg-[#F8FAFC] pb-6 md:pb-0 md:overflow-y-auto md:overscroll-contain';
assert.ok(shellClass&&contentClass,'The test must use the production workspace shell classes');
await fs.writeFile(path.join(temp,'entry.jsx'),`import React from 'react';import{createRoot}from'react-dom/client';import '${root}/src/index.css';import '${root}/src/crisp-ui.css';import{CustomerDataPage}from'${root}/src/components/CustomerData/CustomerDataPage';import{Header}from'${root}/src/components/Header';createRoot(document.getElementById('root')).render(<div className=${JSON.stringify(shellClass)}><div className="hidden shrink-0 md:block"><aside className="workspace-sidebar"><div className="sidebar-brand">Auto Replys</div><nav className="sidebar-menu"><button>Dashboard</button><button>Automations</button><button>Customer Data</button></nav></aside></div><div className=${JSON.stringify(contentClass)}><Header/><main className=${JSON.stringify(mainClass)}><CustomerDataPage/></main></div></div>);`);
await fs.writeFile(path.join(temp,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/entry.jsx"></script></body></html>');
const mocks={name:'synthetic-customer-workspace',enforce:'pre',resolveId(id){if(/context\/AppContext$/.test(id))return '\0layout-context';if(/lib\/supabase$/.test(id))return '\0layout-db';},load(id){if(id==='\0layout-context')return `export const useApp=()=>({workspaceId:'synthetic',firebaseUser:{uid:'synthetic'},activeTab:'customer-data',setActiveTab(){}})`;if(id==='\0layout-db')return `const collections=${JSON.stringify(collections)},records=${JSON.stringify(records)};export const supabase={rpc:async()=>({data:collections}),from(){const q={select(){return q},eq(){return q},ilike(){return q},order(){return q},range(){return q},then(resolve){return Promise.resolve({data:records,count:33}).then(resolve)}};return q}};`;}};
let server,browser;const results=[];
try{
 await build({configFile:false,root:temp,plugins:[mocks,react(),tailwind()],build:{outDir:path.join(temp,'dist'),emptyOutDir:true}});
 server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=path.join(temp,'dist',name==='/'?'index.html':name);const data=await fs.readFile(file);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=await import(pathToFileURL(path.join(process.env.CUSTOMER_LAYOUT_PLAYWRIGHT||'/tmp/customer-layout-browser/node_modules/playwright','index.mjs')).href);
 browser=await chromium.launch({headless:true});
 for(const mode of [{width:360,height:800,isMobile:true,hasTouch:true},{width:390,height:844,isMobile:true,hasTouch:true},{width:980,height:1000,isMobile:true,hasTouch:true},{width:1024,height:900},{width:1440,height:960}]){
  const page=await browser.newPage({viewport:{width:mode.width,height:mode.height},isMobile:mode.isMobile||false,hasTouch:mode.hasTouch||false});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'View customers'}).first().waitFor();
  const metrics=()=>page.evaluate(()=>{const bounds=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{left:r.left,right:r.right,width:r.width,height:r.height}:null};return {innerWidth,clientWidth:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,visualWidth:visualViewport?.width,visualScale:visualViewport?.scale,scrollX,workspace:bounds('.customer-data-workspace'),main:bounds('main'),panel:bounds('.cd-records-panel'),table:bounds('.cd-table-wrap'),tableContent:document.querySelector('.cd-table-wrap')?.scrollWidth,mobileCards:getComputedStyle(document.querySelector('.cd-mobile-records')||document.body).display};});
  const before=await metrics();await page.getByRole('button',{name:'View customers'}).first().click();await page.locator('#records-heading').waitFor();await page.locator('.cd-records-loading').waitFor({state:'hidden'});
  const after=await metrics();await page.screenshot({path:path.join(output,`selected-${mode.width}.png`)});
  // Open customer details and include the long field values in the measurement.
  const mobile=await page.locator('.cd-mobile-records').isVisible();await page.locator(mobile?'.cd-mobile-records .cd-customer-name':'.cd-table-wrap .cd-customer-name').first().click();await page.getByRole('region',{name:'Customer details'}).waitFor();
  const detail=await metrics();await page.screenshot({path:path.join(output,`details-${mode.width}.png`)});results.push({mode,before,after,detail,errors});console.log('CUSTOMER_LAYOUT '+JSON.stringify(results.at(-1)));
  await page.close();
 }
 await fs.writeFile(path.join(output,'metrics.json'),JSON.stringify(results,null,2));
 const failures=[];
 for(const {mode,before,after,detail,errors} of results){
  if(errors.length)failures.push({width:mode.width,reason:'runtime',errors});
  for(const [stage,m] of Object.entries({before,after,detail})){
   if(m.documentWidth>mode.width+1||m.bodyWidth>mode.width+1||m.innerWidth>mode.width+1||m.scrollX!==0)failures.push({width:mode.width,stage,reason:'page overflow',metrics:m});
   if(m.workspace.left<0||m.workspace.right>mode.width+1)failures.push({width:mode.width,stage,reason:'workspace outside viewport',metrics:m});
  }
  if(Math.abs(after.workspace.width-before.workspace.width)>1)failures.push({width:mode.width,reason:'workspace changed width'});
 }
 assert.deepEqual(failures,[],'Customer table must not resize, scroll or shrink the page');console.log('PASS customer layout in five viewport modes');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
