import React from 'react';
import { Bot, CheckCircle2, Circle, Send, Info } from 'lucide-react';
import { googleLogo, sheetsLogo } from '../Common/googleBrandAssets';

export type AiAssistantSetupProps = {
  prompt: string; onPromptChange: (value: string) => void;
  testInput: string; onTestInputChange: (value: string) => void;
  testMessage: string; testReply: string; testError: string; testing: boolean; onTest: () => void;
  sheetsConnected: boolean; sheetsEmail: string; sheetsLoading: boolean; onConnectSheets: () => void;
  promptTools: React.ReactNode; sheetControls: React.ReactNode; replySettings: React.ReactNode;
};
const promptTips = [
  {label:'Business details',text:'Business details: Describe your products, prices, delivery areas and policies here.'},
  {label:'Reply tone',text:'Reply tone: Be friendly, clear and concise. Match the customer’s language.'},
  {label:'Order questions',text:'Order questions: Ask for the customer’s name, selected product and delivery city when they want to order.'},
];
export const AiAssistantSetup = (p: AiAssistantSetupProps) => <section aria-labelledby="ai-setup-title">
  <div className="ai-setup-heading"><div><p className="eyebrow">Step 3 of 4 · AI DM</p><h2 id="ai-setup-title">Set up your AI assistant</h2><p>Tell your assistant how to reply, then test it before going live.</p></div><span className="ai-preview-label">Setup</span></div>
  <div className="ai-setup-grid">
    <div className="ai-setup-primary">
      <section className="ai-setup-card" aria-labelledby="prompt-heading">
        <h3 id="prompt-heading">System prompt</h3><label htmlFor="ai-system-prompt">Instructions for your assistant <span className="text-slate-500">(required)</span></label><p id="ai-prompt-hint">Add your business details, reply rules and the information customers should share.</p>
        <textarea id="ai-system-prompt" aria-describedby="ai-prompt-hint" value={p.prompt} onChange={e=>p.onPromptChange(e.target.value)} rows={10} placeholder="You are the assistant for my business. Help customers with products, prices and orders. Never invent information. Offer human support when unsure."/>
        <div className="ai-prompt-count">{p.prompt.length.toLocaleString()} characters</div>
        <div className="ai-prompt-tips">{promptTips.map(tip=><button key={tip.label} type="button" onClick={()=>{if(!p.prompt.includes(tip.text))p.onPromptChange(p.prompt+(p.prompt.trim()?'\n\n':'')+tip.text);}}>{tip.label} <span aria-hidden="true">+</span></button>)}</div>
        <details className="ai-setup-details"><summary>Review and improve instructions</summary>{p.promptTools}</details>
      </section>
      <section className="ai-setup-card" aria-labelledby="sheets-heading">
        <div className="ai-sheet-title"><img src={sheetsLogo} width={40} height={40} alt="Google Sheets"/><div><h3 id="sheets-heading">Google Sheets <span className="ai-optional">Optional</span></h3><p>Organize lead and order details in a spreadsheet.</p></div></div>
        {p.sheetsConnected?<div className="ai-sheet-connected" role="status"><CheckCircle2 size={18}/><span>Connected{p.sheetsEmail?' · '+p.sheetsEmail:''}</span><button type="button" disabled={p.sheetsLoading} onClick={p.onConnectSheets}>Change account</button></div>:<><button type="button" className="google-brand-button" onClick={p.onConnectSheets} disabled={p.sheetsLoading}><img src={googleLogo} width={20} height={20} alt=""/>{p.sheetsLoading?'Checking connection…':'Connect Google Sheets'}</button><p className="ai-setup-note">Connect your account, then choose the columns and create a sheet.</p></>}
        {p.sheetsConnected&&p.sheetControls}
      </section>
      {p.replySettings}
    </div>
    <aside className="ai-setup-preview" aria-label="Assistant test and readiness">
      <section className="ai-setup-card" aria-labelledby="test-assistant-heading"><div className="ai-test-title"><h3 id="test-assistant-heading">Test your assistant</h3><span className="ai-preview-label">Preview only</span></div>
        <div className="ai-chat-preview" aria-live="polite">{p.testMessage?<><div className="ai-test-customer">{p.testMessage}</div>{p.testing?<div className="ai-test-assistant">Preparing a reply…</div>:p.testReply?<div className="ai-test-assistant"><Bot size={18}/><p>{p.testReply}</p></div>:null}</>:<div className="ai-test-empty"><Bot size={30}/><strong>Try a customer question</strong><p>Ask about a product, price or delivery to check your instructions.</p></div>}</div>
        <form className="ai-test-form" onSubmit={e=>{e.preventDefault();p.onTest();}}><label className="sr-only" htmlFor="ai-test-message">Test customer message</label><input id="ai-test-message" value={p.testInput} onChange={e=>p.onTestInputChange(e.target.value)} placeholder="Type a test message…"/><button type="submit" aria-label="Send test message" disabled={p.testing||!p.testInput.trim()||!p.prompt.trim()}><Send size={18}/></button></form>
        {p.testError&&<p role="alert" className="ai-test-error">{p.testError}</p>}
        <p className="ai-setup-note flex items-start gap-2"><Info size={16} className="shrink-0"/>Test messages are not sent to Instagram. AI test usage may count toward your allowance.</p>
      </section>
      <section className="ai-setup-card"><h3>Before you publish</h3><div className="ai-readiness">{p.prompt.trim()?<CheckCircle2/>:<Circle/>}<span>Instructions {p.prompt.trim()?'added':'required'}</span></div><div className="ai-readiness">{p.testReply?<CheckCircle2/>:<Circle/>}<span>{p.testReply?'Test reply received':'Try a test reply (recommended)'}</span></div><p className="ai-setup-note">Review your instructions before switching this automation on.</p></section>
    </aside>
  </div>
</section>;
