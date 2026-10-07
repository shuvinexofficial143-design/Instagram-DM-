import React from 'react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, CreditCard, ExternalLink, HelpCircle,
  Instagram, LifeBuoy, MessageCircleQuestion, ReceiptText, ShieldCheck,
  Sparkles, WalletCards, XCircle
} from 'lucide-react';
import { BusinessContact } from './BusinessContact';
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

  if(page==='contact')return shell('Contact Us','Customer support','Contact the Auto Replies business for account, billing and payment assistance.',<Legal sections={[
    ['Payment support','Include your order reference, account email and a short description when contacting support. Do not send card details, OTPs, UPI PINs or payment API secrets.'],
    ['Account and data requests','Use the support contact below for account access, privacy and deletion requests. We may need to verify that you control the account before making changes.'],
  ]}/>);

  if(page==='refunds')return shell('Refund & Cancellation Policy','Paid plan policies','Clear information about one-time purchases, payment issues and refund requests.',<Legal sections={[
    ['One-time purchases and renewal','Paid plans are purchased for 30 days. There is no automatic renewal or AutoPay in this checkout. You can stop renewing at any time; your existing access lasts until its stated expiry date. Disconnecting Instagram does not request a refund.'],
    ['Payment verification and activation','Access is granted only after payment is verified by our server. A pending payment or bank debit alone does not mean your plan is active. Check your existing order before paying again. Test payments do not activate live paid access.'],
    ['Duplicate charges and failed activation','Contact billing support with your order and payment references if you were charged more than once or paid access was not delivered. We investigate the payment and activation records and arrange correction or an eligible refund.'],
    ['Refund requests','Refunds are reviewed individually based on the payment records, service delivery and applicable law. They are not guaranteed by closing checkout, switching plans or disconnecting an account. Submit your request through the business support email on this page.'],
    ['Refund processing','An approved refund is returned through the original payment route. The payment provider and bank determine when the credit appears. A support request is not a completed refund; retain your refund reference after it is issued.'],
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
