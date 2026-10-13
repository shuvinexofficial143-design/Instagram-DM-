import React, { useState } from 'react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, CreditCard, ExternalLink, HelpCircle,
  Instagram, LifeBuoy, MessageCircleQuestion, ReceiptText, ShieldCheck,
  Sparkles, WalletCards, XCircle
} from 'lucide-react';
import { BusinessContact } from './BusinessContact';
import { SupportDesk } from './SupportDesk';
import { useApp } from '../../context/AppContext';

type Page='help'|'faq'|'billing-help'|'privacy'|'terms'|'contact'|'refunds';

const faqs=[
  ['Instagram','What Instagram account can I connect?','Auto Replies is designed for Instagram professional accounts supported by the current Meta authorization flow. Meta shows the accounts available to authorize.'],
  ['Instagram','Does Auto Replies store my Instagram password?','No. Instagram authorization happens through Meta OAuth, so your Instagram password is not entered into Auto Replies.'],
  ['Automations','Why is my automation not replying?','Confirm that Instagram is connected, the automation is Active, and its trigger matches the incoming event. Then review Inbox and Activity for recent events or errors.'],
  ['Inbox','Can I reply manually?','Yes. Inbox supports manual replies and human takeover where available, so you can step in when a conversation needs a person.'],
  ['Billing','Where can I see my usage?','Open Billing & Usage to review your current plan, message limits, AI reply limits, automation capacity and connected Instagram account usage.'],
  ['Billing','How do I buy or upgrade a plan?','Open Billing & Usage, choose the plan you want and continue through the plan flow. When the payment gateway is connected, checkout will confirm payment before the new plan is activated.'],
  ['Billing','How do I cancel a paid plan?','Paid checkout is a one-time purchase. You can stop renewing at any time; access continues until its expiry. See the Refund & Cancellation Policy for payment issues.'],
  ['Account','How do I disconnect Instagram?','Open Settings or the Instagram account controls and use Disconnect. Disconnecting Instagram does not cancel a paid subscription.'],
  ['Troubleshooting','Why does a connected Instagram account stop replying?','A connected badge does not guarantee delivery. Check the active automation, latest Activity Logs, webhook delivery, Meta permissions and monthly reply allowance. Reconnect only if the authorization is invalid.'],
  ['Troubleshooting','Why did the same customer appear twice?','A username and an Instagram user ID can differ between events. If duplicate threads appear, use the permanent Instagram identity and contact support with the affected conversation, rather than deleting message history.'],
  ['Google Sheets','Why are new leads not appearing in Google Sheets?','Check Integrations for a connected Google account and confirm the automation has its spreadsheet. Review Activity for sync errors. Reconnect Google Sheets if authorization has expired.'],
  ['Payments','I paid but my plan is still pending. What should I do?','Open Billing History and check the same order before starting a new payment. Contact billing support with the order reference if your bank shows a debit but activation remains pending. Never share your UPI PIN or card details.'],
  ['Security','Can another user read my Instagram conversations?','Workspaces have access controls to separate accounts. Keep your login secure, connect only accounts you own, and contact support immediately if you notice unexpected activity.'],
];

export const SupportPage:React.FC<{page:Page}>=({page})=>{
  const{setActiveTab,setIsConnectModalOpen,setIsRenewModalOpen,firebaseUser}=useApp();
  const [faqQuery,setFaqQuery]=useState('');

  const go=(tab:'home'|'automations'|'faq'|'billing-help'|'billing')=>{
    if(firebaseUser){setActiveTab(tab);return;}
    const paths={home:'/',automations:'/login',faq:'/help/faq','billing-help':'/help/billing',billing:'/login'};
    window.location.href=paths[tab];
  };
  const connect=()=>firebaseUser?setIsConnectModalOpen(true):window.location.assign('/login');
  const upgrade=()=>firebaseUser?setIsRenewModalOpen(true):window.location.assign('/login');

  const shell=(title:string,eyebrow:string,desc:string,body:React.ReactNode)=>(
    <div className="support-page support-about-look">
      <header className="support-hero">
        <div className="support-container">
          <button onClick={()=>go('home')} className="support-back"><ArrowLeft/>{firebaseUser?'Back to dashboard':'Back to home'}</button>
          <p className="support-eyebrow"><LifeBuoy className="h-4 w-4" /> {eyebrow}</p>
          <h1>{title}</h1>
          <p className="support-description">{desc}</p>
          <nav className="support-hero-links" aria-label="Support sections">
            <a href="/help">Help Center <ArrowRight className="h-4 w-4"/></a>
            <a href="/contact">Contact Support <ArrowRight className="h-4 w-4"/></a>
            <a href="/refunds">Refunds & cancellation <ArrowRight className="h-4 w-4"/></a>
          </nav>
        </div>
      </header>
      <div className="support-container support-about-body">
        {body}
        <div className="mt-8"><BusinessContact /></div>
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
        <SupportCard icon={LifeBuoy} label="Contact" title="Message customer support" text="Send a private ticket, track refunds and receive replies from our team." action="Contact support" onClick={()=>firebaseUser?setActiveTab('contact'):window.location.assign('/login')}/>
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
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7" aria-labelledby="help-diagnostics-heading">
        <p className="support-eyebrow">Troubleshoot safely</p>
        <h2 id="help-diagnostics-heading" className="mt-2 text-xl font-bold text-slate-900">Not receiving Instagram replies?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Start with your connection and automation status. If you have a logged-in workspace, check the latest Activity errors before reconnecting or recreating anything.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button type="button" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:border-indigo-300" onClick={()=>firebaseUser?setActiveTab('settings'):window.location.assign('/login')}>1. Check Instagram connection <ArrowRight className="ml-1 inline h-4 w-4" /></button>
          <button type="button" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:border-indigo-300" onClick={()=>go('automations')}>2. Check active automation <ArrowRight className="ml-1 inline h-4 w-4" /></button>
          <button type="button" className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:border-indigo-300" onClick={()=>firebaseUser?setActiveTab('activity'):window.location.assign('/login')}>3. Review Activity Logs <ArrowRight className="ml-1 inline h-4 w-4" /></button>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Still stuck? Contact support below with the approximate time of the failure and the automation name. Never share passwords, OTPs or access tokens.</p>
      </section>
      {firebaseUser&&<div className="mt-6"><SupportDesk /></div>}
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
        <label className="mb-4 block text-sm font-semibold text-slate-700">Search help articles<input type="search" value={faqQuery} onChange={e=>setFaqQuery(e.target.value)} placeholder="Search payments, Instagram, automations…" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm"/></label>
        {faqs.filter(([category,q,a])=>(category+' '+q+' '+a).toLowerCase().includes(faqQuery.toLowerCase())).map(([category,q,a])=><details key={q} className="support-faq-item">
          <summary><span><small>{category}</small>{q}</span><span className="support-faq-plus">+</span></summary>
          <p>{a}</p>
        </details>)}
      </div>
    </div>
  );

  if(page==='contact')return shell('Customer Support','Contact & requests','Send a private message, request a refund, or track a cancellation request.',<>
    {firebaseUser?<SupportDesk />:<div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm text-slate-700">Sign in to send a private message and track replies. You can also use the business email below.</p><a href="/login" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-5 font-semibold text-white">Sign in to contact support</a></div>}
  </>);

  if(page==='refunds')return shell('Refund & Cancellation Policy','Paid plan policies','Clear information about one-time purchases, payment issues and refund requests.',<Legal sections={[
    ['One-time purchases and renewal','Paid plans are one-time purchases for 30 days. There is currently no automatic renewal or future debit to cancel. Existing access normally lasts until its recorded expiry date. Disconnecting Instagram does not request a refund.'],
    ['Early cancellation','Signed-in customers may request early cancellation at any time in Contact Support. A request does not automatically end service, delete data or trigger a payout. Our team aims to acknowledge support requests within two business days.'],
    ['First-time unused purchases','If your first paid purchase was accidental and unused, you may request a discretionary refund review within 48 hours. Approval is not guaranteed. Nothing here excludes applicable legal rights.'],
    ['Payment verification and activation','Access is granted only after payment is verified by our server. A pending payment or bank debit alone does not mean your plan is active. Check your existing order before paying again. Test payments do not activate live paid access.'],
    ['Duplicate charges and failed activation','Contact billing support with your order and payment references if you were charged more than once or paid access was not delivered. We investigate the payment and activation records and arrange correction or an eligible refund.'],
    ['Refund requests','Refunds are reviewed individually based on the payment records, service delivery and applicable law. They are not guaranteed by closing checkout, switching plans or disconnecting an account. Submit a private ticket through Contact Support and follow its progress there.'],
    ['Refund processing','An approved refund is returned through the original payment route. Once the merchant initiates an approved refund, provider and bank processing typically takes 5–7 business days and may vary. A support ticket or approval is not itself a completed refund; keep the provider reference after issuance.'],
    ['Plan changes and usage','Renewing the same active plan extends its expiry by 30 days. A different plan replaces it immediately with a new 30-day period; unused paid time is not credited. Message allowances are measured by calendar month and purchases do not reset usage.'],
    ['Your rights','This policy does not limit any non-excludable rights or remedies available under applicable law.'],
  ]}/>);

  if(page==='billing-help')return shell('Billing & Payment Help','Billing support','Choose your plan, pay securely and track activation in one place.',<div className="support-billing-layout"><div className="support-billing-main">
    <GuideBlock icon={CreditCard} title="Buy or renew a plan" badge="Secure checkout">
      <GuideStep number="1" title="Choose your plan">Select a plan in Billing & Usage. Review the amount in INR, 30-day access period, limits and paid plan terms.</GuideStep>
      <GuideStep number="2" title="Complete payment">Enter your billing name, email and mobile number. Cashfree checkout shows the supported payment methods, including available UPI and QR options.</GuideStep>
      <GuideStep number="3" title="Wait for verified activation">Return to the confirmation page. The server checks payment and activates the correct plan. You can reopen the order through Billing History if you close the browser.</GuideStep>
    </GuideBlock>
    <GuideBlock icon={ReceiptText} title="Pending payments and receipts"><p className="support-guide-copy">If your bank shows a debit but confirmation is pending, check the existing order before paying again. Your payment history keeps the order, amount, payment status and activation details. Test payments are clearly marked and never grant live paid access.</p></GuideBlock>
    <GuideBlock icon={XCircle} title="Renewal, cancellation and refunds"><p className="support-guide-copy">This is a one-time purchase without automatic renewal. Stop renewing whenever you want. Read the <a href="/refunds">Refund & Cancellation Policy</a> for payment issues and refund requests.</p></GuideBlock>
    </div><aside className="support-plan-panel"><div className="support-plan-icon"><BadgeCheck/></div><h2>Manage your plan</h2><p>Review limits, expiry and payment history.</p><button onClick={()=>go('billing')} className="support-primary-button">Open Billing & Usage<ArrowRight/></button></aside></div>);

  if(page==='privacy')return shell('Privacy Policy','Legal','How Auto Replies processes information to provide your account, automation and payment features.',<Legal sections={[
    ['Account and workspace information','We process your account identity, connected Instagram account details, automation settings, contacts, conversation content and usage records to provide the service.'],
    ['Connected services and AI','Meta authorization connects Instagram without asking you to enter an Instagram password here. Message content and your configured instructions may be processed by the configured AI provider to generate replies. If you connect Google Sheets, selected lead and conversation information is sent to your authorized spreadsheet.'],
    ['Payments','Your billing name, email and mobile number are sent to Cashfree to create a payment order. We keep order, amount, payment reference, status and plan activation records. Card details and UPI PINs are entered in the payment provider checkout; do not send them to our support team.'],
    ['Service providers','We use infrastructure and integrations including Supabase, Vercel, Meta, our configured AI provider, Google when connected, and Cashfree for their respective service functions. Their handling of information is also governed by their policies.'],
    ['Retention and account controls','We retain information needed for the service, payment reconciliation, security and applicable record-keeping duties. Disconnecting Instagram removes its connection access; it does not automatically delete every historical record. Contact support to request account or data deletion, subject to necessary verification and legal retention.'],
    ['Security and your requests','We use access controls and server-side payment verification to protect account and billing operations. Contact the support address below to request access, correction, deletion or clarification about your information.'],
    ['Policy updates','Material changes to processing may require an updated policy. The current published policy applies to the service features described here.'],
  ]}/>);

  return shell('Terms of Service','Legal','Rules for using Auto Replies and purchasing paid access.',<Legal sections={[
    ['Service and eligibility','Auto Replies provides Instagram automation, AI-assisted replies and related workspace tools. Connect only accounts and information you are authorized to manage and follow applicable laws and Meta platform rules.'],
    ['Account responsibility','Keep your login secure. You are responsible for the instructions, product information, catalog content and automations configured in your account. Review AI-generated content and take over conversations when a person is needed.'],
    ['Paid plans and payment','Paid checkout displays the total amount in INR and the selected plan. Each verified purchase provides 30 days of access. Payment is one-time with manual renewal; this checkout creates no recurring debit mandate. Live checkout remains unavailable until payment setup and business details are complete.'],
    ['Plan activation and changes','Only server-verified successful payments activate paid access. The same active plan can be renewed for an additional 30 days. Changing a plan starts a new 30-day period and replaces the current plan without credit for unused paid time. Pending confirmation and sandbox tests do not grant paid access.'],
    ['Usage limits','Message and AI reply allowances are measured per calendar month across your login’s Instagram workspaces; AI replies count within total messages. Buying a plan does not reset consumed usage. Unused Free allowance is carried for 30 days on the first paid upgrade. Additional reply packs are not available for purchase until explicitly offered.'],
    ['Cancellation and refunds','You may stop manual renewal at any time. Access ends at the recorded expiry and then returns to Free limits. Refund requests and payment issues follow our published Refund & Cancellation Policy. Disconnecting Instagram is not a refund request.'],
    ['Third-party availability','Automation and payment features depend on third-party APIs and platforms. Their outages, authorization restrictions and policies can affect service delivery. No specific reply latency or uninterrupted availability is guaranteed.'],
    ['Support and applicable rights','Contact the business identified below for account, payment and service issues. Nothing in these terms excludes rights that cannot lawfully be excluded.'],
  ]}/>);
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
