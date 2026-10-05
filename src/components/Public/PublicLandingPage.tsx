import React, { useState } from 'react';
import { ArrowRight, Bot, Check, Instagram, Menu, MessageSquare, Package, ShieldCheck, Users, X, Zap, Sheet, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { PLAN_CATALOG } from '../../lib/planUsage';

const features = [
  {icon:Bot,title:'Helpful answers, on autopilot',text:'Give your AI approved business facts, FAQs and policies so it can answer customer questions.'},
  {icon:MessageSquare,title:'Turn comments into conversations',text:'Choose a post or reel and the keywords that should start a helpful DM reply.'},
  {icon:Users,title:'Keep every lead organized',text:'See contact history, add notes and track follow-ups from one workspace.'},
  {icon:Package,title:'Your products, ready to share',text:'Organize product catalogs and use the right product information in your AI instructions.'},
];
const steps = [
  ['Connect Instagram','Authorize your eligible professional account through the Meta connection flow.'],
  ['Make it your assistant','Add business information and choose a DM, comment or story reply automation.'],
  ['Test, then go live','Preview a reply, publish your automation and manage conversations in your inbox.'],
];
const faqs = [
  ['Do I need coding skills?','No. Choose an automation type, add your message or AI instructions, and review before publishing.'],
  ['Which Instagram account can I connect?','Use an eligible Instagram professional account. The Meta authorization flow shows the accounts available to connect.'],
  ['Can I still reply myself?','Yes. Use the Inbox to read conversations, reply manually and take over from AI where available.'],
  ['How are AI replies counted?','AI replies are included in your total message allowance. The AI allowance is a limit within that total, not extra messages.'],
];

export const PublicLandingPage = () => {
  const [menuOpen,setMenuOpen] = useState(false);
  const [demoType,setDemoType] = useState<'store'|'creator'|'service'>('store');
  return <div className="marketing-page">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="marketing-header"><div className="marketing-container marketing-header-inner">
      <a href="/" className="brand"><span><Zap/></span>Auto Replies</a>
      <nav aria-label="Main navigation" className="desktop-marketing-nav"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><a href="/about">About</a><a href="/help/faq">FAQ</a><a href="/login">Log in</a><a href="/login?mode=signup" className="button-primary">Get started <ArrowRight/></a></nav>
      <button className="marketing-menu-toggle" onClick={()=>setMenuOpen(v=>!v)} aria-label={menuOpen?'Close navigation':'Open navigation'} aria-expanded={menuOpen} aria-controls="marketing-mobile-nav">{menuOpen?<X/>:<Menu/>}</button>
    </div>{menuOpen&&<nav id="marketing-mobile-nav" className="marketing-mobile-nav" aria-label="Main navigation">{[['Features','#features'],['How it works','#how-it-works'],['Pricing','#pricing'],['About','/about'],['FAQ','/help/faq'],['Log in','/login'],['Get started','/login?mode=signup']].map(([label,href])=><a key={label} href={href} onClick={()=>setMenuOpen(false)}>{label}</a>)}</nav>}</header>
    <main id="main-content">
      <section className="marketing-hero"><div className="marketing-container hero-grid"><div>
        <span className="eyebrow-pill"><Instagram/>Instagram DM automation</span>
        <h1>More conversations.<br/><em>Less busywork.</em></h1>
        <p className="hero-description">Answer customer questions, respond to comments and keep leads organized. Your Instagram assistant, with you in control.</p>
        <div className="hero-actions"><a className="button-primary" href="/login?mode=signup">Start with Free <ArrowRight/></a><a className="button-secondary" href="#how-it-works">See how it works</a></div>
        <div className="hero-benefits"><span><Check/>Free plan available</span><span><ShieldCheck/>Connect through Meta</span></div>
      </div><div className="hero-preview"><div className="demo-switcher" role="group" aria-label="Choose a conversation example">{([['store','Online store'],['creator','Creator'],['service','Services']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={demoType===value} onClick={()=>setDemoType(value)}>{label}</button>)}</div><ConversationDemo type={demoType}/><p className="preview-caption">Illustrative preview · Your instructions shape every reply</p></div></div></section>
      <div className="marketing-container audience-strip"><span>Made for your everyday conversations</span><div><span>Online stores</span><span>Creators</span><span>Local businesses</span><span>Service providers</span></div></div>
      <section id="features" className="marketing-section"><div className="marketing-container"><div className="section-heading"><span className="eyebrow">One connected workspace</span><h2>From the first question<br/>to the next follow-up.</h2><p>The tools you need to reply, organize and stay in control.</p></div><div className="feature-grid">{features.map(({icon:Icon,title,text})=><article key={title} className="feature-card"><span className="feature-icon"><Icon/></span><h3>{title}</h3><p>{text}</p></article>)}</div><div className="human-control"><ShieldCheck/><div><h3>Automation with room for a human.</h3><p>Read the conversation, reply personally and pause AI when a customer needs your attention.</p></div><a href="/help/faq">Read the FAQ <ArrowRight/></a></div></div></section>
      <section id="how-it-works" className="marketing-section setup-section"><div className="marketing-container"><div className="section-heading"><span className="eyebrow">A clear starting point</span><h2>Set up. Test. Start replying.</h2><p>One guided setup, without a complicated canvas.</p></div><div className="setup-grid">{steps.map(([title,text],i)=><article key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
      <section className="marketing-section workspace-showcase"><div className="marketing-container showcase-grid"><div className="section-heading"><span className="eyebrow">Built around your business</span><h2>A helpful reply is just the beginning.</h2><p>Give your assistant clear instructions. Keep conversations organized, collect the details you need and follow up with confidence.</p><a href="/login?mode=signup" className="button-primary">Build your assistant <ArrowRight/></a></div><div className="showcase-cards"><article><span className="showcase-icon"><SlidersHorizontal/></span><div><h3>Your voice. Your instructions.</h3><p>Set the tone, add FAQs and test replies before switching your automation on.</p></div></article><article><span className="showcase-icon sheets-icon"><Sheet/></span><div><h3>Keep leads in Google Sheets.</h3><p>Connect your Google account and create a spreadsheet with your chosen lead fields.</p></div></article><article><span className="showcase-icon control-icon"><CheckCircle2/></span><div><h3>Stay part of the conversation.</h3><p>Review your inbox and step in personally when a customer needs your attention.</p></div></article></div></div></section>
      <section id="pricing" className="marketing-section"><div className="marketing-container"><div className="section-heading"><span className="eyebrow">Plans & limits</span><h2>Start small. Grow when you need to.</h2><p>Clear monthly limits for every stage of your business.</p></div><div className="pricing-grid">{PLAN_CATALOG.map(plan=><article key={plan.id} className={'pricing-card '+(plan.id==='pro'?'featured-plan':'')}><div className="plan-heading"><h3>{plan.name}</h3>{plan.id==='pro'&&<span>Growing teams</span>}</div><p className="plan-price">{plan.price}<small>/ month</small></p><ul>{[`${plan.messages.toLocaleString('en-IN')} total messages`,`${plan.ai.toLocaleString('en-IN')} max AI replies`,`${plan.automations===null?'Unlimited':plan.automations} automations`,`${plan.accounts} Instagram account${plan.accounts===1?'':'s'}`].map(item=><li key={item}><Check/>{item}</li>)}</ul><a href="/login?mode=signup" className={plan.id==='pro'?'button-primary':'button-secondary'}>{plan.id==='free'?'Start with Free':'View '+plan.name+' plan'}<ArrowRight/></a></article>)}</div><p className="pricing-note">AI replies count within total messages. Review payment and activation details in Billing & Usage before choosing a paid plan.</p></div></section>
      <section className="marketing-section faq-section"><div className="marketing-container faq-grid"><div className="section-heading"><span className="eyebrow">Before you start</span><h2>A few helpful answers.</h2><p>Need more detail? <a href="/help">Visit the Help Center.</a></p></div><div>{faqs.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
      <section className="marketing-container final-cta"><div><span className="eyebrow">Your next conversation starts here</span><h2>Give your inbox a helping hand.</h2><p>Connect your account and build your first automation.</p></div><a className="button-primary" href="/login?mode=signup">Get started <ArrowRight/></a></section>
    </main>
    <footer className="marketing-footer"><div className="marketing-container"><div><a href="/" className="brand"><span><Zap/></span>Auto Replies</a><p>Instagram conversations, made easier.</p><small>© {new Date().getFullYear()} Auto Replies</small></div><nav aria-label="Footer navigation">{[['About','/about'],['Help','/help'],['FAQ','/help/faq'],['Privacy','/privacy'],['Terms','/terms']].map(([label,href])=><a key={label} href={href}>{label}</a>)}</nav></div></footer>
  </div>;
};

const demoContent = {
  store: {name:'Your store',question:'Hi! Can I customize a photo frame?',answer:'Yes! Choose your shape and share the photo you’d like to use. Which style do you prefer?',followup:'A heart frame. How do I order?',reply:'I can help with that. What’s your name and delivery city?'},
  creator: {name:'Your creator account',question:'Hi! Where can I find your beginner guide?',answer:'Happy to help! Are you looking for the getting-started guide or the full checklist?',followup:'The getting-started guide, please.',reply:'Of course! I’ll help you find it. What would you like to learn first?'},
  service: {name:'Your studio',question:'Hi! Do you offer product photography?',answer:'Yes! Tell me a little about your products and the kind of photos you need.',followup:'I need photos for my new collection.',reply:'Sounds good! How many products are there, and which city are you in?'},
};
const ConversationDemo = ({type}:{type:keyof typeof demoContent}) => {
  const example = demoContent[type];
  return <div id="conversation-demo" className="conversation-demo" aria-label="Example of an automated customer conversation">
    <div className="demo-title"><div className="demo-avatar"><Instagram/></div><div><strong>{example.name}</strong><span>Example conversation</span></div><span className="demo-ai-badge"><Bot/>AI assistant</span></div>
    <div className="demo-messages"><div className="bubble customer-bubble">{example.question}</div><div className="bubble assistant-bubble">{example.answer}</div>{type==='store'&&<div className="demo-product"><div className="demo-product-art"><div><span>YOUR<br/>MEMORIES</span></div></div><div><span>Example product</span><strong>Custom photo frame</strong><p>Square · Round · Heart</p></div></div>}<div className="bubble customer-bubble">{example.followup}</div><div className="bubble assistant-bubble">{example.reply}</div></div>
    <div className="demo-outcome"><Users/><div><strong>Ready for your next step</strong><span>Keep customer details and follow-up notes together.</span></div><Check/></div>
  </div>;
};
