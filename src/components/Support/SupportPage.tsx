import React from 'react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, CreditCard, ExternalLink, HelpCircle,
  Instagram, LifeBuoy, MessageCircleQuestion, ReceiptText, ShieldCheck,
  Sparkles, WalletCards, XCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Page='help'|'faq'|'billing-help'|'privacy'|'terms';

const faqs=[
  ['Instagram','What Instagram account can I connect?','Auto Replies is designed for Instagram professional accounts supported by the current Meta authorization flow. Meta shows the accounts available to authorize.'],
  ['Instagram','Does Auto Replies store my Instagram password?','No. Instagram authorization happens through Meta OAuth, so your Instagram password is not entered into Auto Replies.'],
  ['Automations','Why is my automation not replying?','Confirm that Instagram is connected, the automation is Active, and its trigger matches the incoming event. Then review Inbox and Activity for recent events or errors.'],
  ['Inbox','Can I reply manually?','Yes. Inbox supports manual replies and human takeover where available, so you can step in when a conversation needs a person.'],
  ['Billing','Where can I see my usage?','Open Billing & Usage to review your current plan, message limits, AI reply limits, automation capacity and connected Instagram account usage.'],
  ['Billing','How do I buy or upgrade a plan?','Open Billing & Usage, choose the plan you want and continue through the plan flow. When the payment gateway is connected, checkout will confirm payment before the new plan is activated.'],
  ['Billing','How do I cancel a paid plan?','Open Billing & Usage and use Manage subscription → Cancel plan. The cancellation screen is already prepared; final provider cancellation stays disabled until the payment gateway is connected so the product never pretends that a real subscription was cancelled.'],
  ['Account','How do I disconnect Instagram?','Open Settings or the Instagram account controls and use Disconnect. Disconnecting Instagram does not cancel a paid subscription.'],
];

export const SupportPage:React.FC<{page:Page}>=({page})=>{
  const{setActiveTab,setIsConnectModalOpen,setIsRenewModalOpen,firebaseUser}=useApp();

  const go=(tab:'home'|'automations'|'faq'|'billing-help'|'billing')=>{
    if(firebaseUser){setActiveTab(tab);return;}
    const paths={home:'/',automations:'/login',faq:'/help/faq','billing-help':'/help/billing',billing:'/login'};
    window.location.href=paths[tab];
  };
  const connect=()=>firebaseUser?setIsConnectModalOpen(true):window.location.assign('/login');
  const upgrade=()=>firebaseUser?setIsRenewModalOpen(true):window.location.assign('/login');

  const shell=(title:string,eyebrow:string,desc:string,body:React.ReactNode)=>(
    <div className="support-page">
      <div className="support-container">
        <button onClick={()=>go('home')} className="support-back"><ArrowLeft/>{firebaseUser?'Back to dashboard':'Back to home'}</button>
        <header className="support-hero">
          <div className="support-hero-icon"><LifeBuoy/></div>
          <div>
            <p className="support-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="support-description">{desc}</p>
          </div>
        </header>
        {body}
      </div>
    </div>
  );

  if(page==='help')return shell(
    'Help Center',
    'Auto Replies Support',
    'Clear answers and guided actions for Instagram connection, automations, billing and account management.',
    <>
      <section className="support-card-grid" aria-label="Popular help topics">
        <SupportCard icon={Instagram} label="Instagram" title="Connect or reconnect Instagram" text="Authorize your professional Instagram account through Meta and fix connection issues." action="Open connection" onClick={connect}/>
        <SupportCard icon={Sparkles} label="Automation" title="Build and test an automation" text="Create DM, comment and AI-assisted workflows, then test them before switching them on." action="Open Automations" onClick={()=>go('automations')}/>
        <SupportCard icon={MessageCircleQuestion} label="Answers" title="Browse common questions" text="Quick answers for connection, automations, inbox, usage, plans and account controls." action="Read FAQ" onClick={()=>go('faq')}/>
        <SupportCard icon={WalletCards} label="Billing" title="Plans, payments and cancellation" text="See how upgrades, usage, billing history and self-service plan cancellation are designed to work." action="Open billing guide" onClick={()=>go('billing-help')}/>
      </section>
      <section className="support-path">
        <div>
          <p className="support-eyebrow">Recommended workflow</p>
          <h2>Get from setup to a working automation without guessing</h2>
          <p>Use these three checkpoints whenever you are setting up a new workspace or troubleshooting replies.</p>
        </div>
        <div className="support-path-steps">
          <PathStep number="01" title="Connect" text="Authorize the correct professional Instagram account."/>
          <PathStep number="02" title="Configure" text="Create the automation and verify its trigger and reply."/>
          <PathStep number="03" title="Verify" text="Check Inbox, Activity and Usage after a real test message."/>
        </div>
      </section>
    </>
  );

  if(page==='faq')return shell(
    'Frequently Asked Questions',
    'Help Center',
    'Fast answers to the questions customers are most likely to have while using Auto Replies.',
    <div className="support-faq-layout">
      <aside className="support-faq-aside">
        <HelpCircle/>
        <h2>Find the right answer</h2>
        <p>Questions cover Instagram connection, automation behavior, billing, usage and account management.</p>
        <button onClick={()=>go('billing-help')}>Need billing help?<ArrowRight/></button>
      </aside>
      <div className="support-faq-list">
        {faqs.map(([category,q,a])=><details key={q} className="support-faq-item">
          <summary><span><small>{category}</small>{q}</span><span className="support-faq-plus">+</span></summary>
          <p>{a}</p>
        </details>)}
      </div>
    </div>
  );

  if(page==='billing-help')return shell(
    'Billing & Subscription Help',
    'Billing Support',
    'A simple guide to choosing a plan, completing payment, checking usage and cancelling future renewals.',
    <div className="support-billing-layout">
      <div className="support-billing-main">
        <GuideBlock icon={CreditCard} title="Buy or upgrade a plan" badge="Checkout flow">
          <GuideStep number="1" title="Choose a plan">Open Billing & Usage and select the plan that matches your message, AI reply and automation needs.</GuideStep>
          <GuideStep number="2" title="Complete secure checkout">When the payment gateway is connected, checkout will open through the payment provider and the plan will only change after confirmed payment.</GuideStep>
          <GuideStep number="3" title="Verify activation">Return to Billing & Usage to confirm the active plan, limits and billing history.</GuideStep>
        </GuideBlock>

        <GuideBlock icon={XCircle} title="Cancel a paid plan" badge="Self-service">
          <GuideStep number="1" title="Open Manage subscription">Go to Billing & Usage and choose Cancel plan from the subscription management section.</GuideStep>
          <GuideStep number="2" title="Review the cancellation">The confirmation screen explains what happens to renewal and access before any cancellation request is sent.</GuideStep>
          <GuideStep number="3" title="Confirm with the payment provider">After gateway integration, confirmation will cancel the subscription at the provider so the next renewal is stopped according to the provider's billing rules.</GuideStep>
          <div className="support-integration-note"><ShieldCheck/><div><strong>Safe pre-launch behavior</strong><p>The cancellation interface is present now, but the final destructive action remains unavailable until a real payment gateway is connected. No fake cancellation or fake payment record is created.</p></div></div>
        </GuideBlock>

        <GuideBlock icon={ReceiptText} title="Usage, invoices and payment history">
          <p className="support-guide-copy">Monthly usage is shown against the limits of the active plan. Billing History is ready to display real payments, statuses and receipts once payment integration is live.</p>
        </GuideBlock>
      </div>

      <aside className="support-plan-panel">
        <div className="support-plan-icon"><BadgeCheck/></div>
        <p className="support-eyebrow">Plan controls</p>
        <h2>Manage your subscription</h2>
        <p>Review your plan first, then upgrade or open the cancellation controls from one place.</p>
        <button onClick={()=>go('billing')} className="support-primary-button">Open Billing & Usage<ArrowRight/></button>
        <button onClick={upgrade} className="support-secondary-button">Choose a plan</button>
        <div className="support-plan-footnote"><ShieldCheck/>Payment and cancellation status should always come from the connected payment provider.</div>
      </aside>
    </div>
  );

  if(page==='privacy')return shell(
    'Privacy Policy',
    'Legal',
    'A plain-language overview of how Auto Replies uses account and workspace information. Review with qualified legal counsel before commercial launch.',
    <Legal sections={[
      ['Information used by the service','Auto Replies may process account profile information, connected Instagram account information, automation configuration, contacts, messages and usage information needed for product features.'],
      ['Instagram and Meta connection','Instagram is connected through Meta authorization. Authorized account access is used to provide the Instagram automation features you configure.'],
      ['Authentication','Account authentication is handled through the application’s configured authentication provider.'],
      ['Data controls','Controls for connected accounts and selected workspace data depend on features currently implemented.'],
      ['Security','The service is designed to avoid asking you to enter your Instagram password directly. No online service can promise absolute security.'],
      ['Policy updates','This policy may need updates as payments, subscriptions, integrations and additional data features are introduced.'],
    ]}/>
  );

  return shell(
    'Terms of Service',
    'Legal',
    'General terms for using Auto Replies. Review with qualified legal counsel before commercial launch.',
    <Legal sections={[
      ['Using Auto Replies','Use the service lawfully and only with accounts, data and permissions you are authorized to manage.'],
      ['Instagram automation','You are responsible for automations, messages and content you configure and for complying with applicable Meta/Instagram platform rules.'],
      ['Account security','You are responsible for maintaining control of your login account and connected services.'],
      ['Plans and billing','Features and limits can depend on your plan. Billing, renewal, cancellation and refund terms should match the payment system actually offered.'],
      ['Availability','Automation depends on third-party platforms and APIs as well as Auto Replies services, so uninterrupted availability cannot be guaranteed.'],
      ['Changes','Product features and these terms may change as the service evolves.'],
    ]}/>
  );
};

const SupportCard=({icon:Icon,label,title,text,action,onClick}:{icon:any;label:string;title:string;text:string;action:string;onClick:()=>void})=>(
  <article className="support-topic-card">
    <div className="support-topic-top"><span className="support-topic-icon"><Icon/></span><small>{label}</small></div>
    <h2>{title}</h2>
    <p>{text}</p>
    <button onClick={onClick}>{action}<ExternalLink/></button>
  </article>
);

const PathStep=({number,title,text}:{number:string;title:string;text:string})=>(
  <div className="support-path-step"><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>
);

const GuideBlock=({icon:Icon,title,badge,children}:{icon:any;title:string;badge?:string;children:React.ReactNode})=>(
  <section className="support-guide-block">
    <div className="support-guide-heading"><span><Icon/></span><div><h2>{title}</h2>{badge&&<small>{badge}</small>}</div></div>
    <div className="support-guide-body">{children}</div>
  </section>
);

const GuideStep=({number,title,children}:{number:string;title:string;children:React.ReactNode})=>(
  <div className="support-guide-step"><span>{number}</span><div><strong>{title}</strong><p>{children}</p></div></div>
);

const Legal=({sections}:{sections:[string,string][]})=>(
  <div className="support-legal">
    {sections.map(([h,p])=><section key={h}><span><ShieldCheck/></span><div><h2>{h}</h2><p>{p}</p></div></section>)}
  </div>
);
