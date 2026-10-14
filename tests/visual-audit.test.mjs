import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('auth login preserves Google, email and password functionality in responsive redesigned layout',()=>{
 const login=read('src/components/Auth/LoginPage.tsx');
 assert.match(login,/auth-premium-layout/);
 assert.match(login,/auth-premium-story/);
 assert.match(login,/auth-mobile-brand/);
 assert.match(login,/signInWithPopup\(auth, googleProvider\)/);
 assert.match(login,/signInWithEmailAndPassword\(/);
 assert.match(login,/createUserWithEmailAndPassword\(/);
 assert.match(login,/sendPasswordResetEmail\(/);
 assert.match(login,/aria-pressed=\{authMode === 'signup'\}/);
 const css=read('src/crisp-ui.css');
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/\.auth-premium-tabs button\{white-space:nowrap/);
 assert.match(css,/\.auth-premium-card input:not\(\[type=checkbox\]\)/);
});

test('support center offers 6 balanced topic cards with filterable FAQs and no-results state',()=>{
 const support=read('src/components/Support/SupportPage.tsx');
 assert.equal((support.match(/<SupportCard icon=/g)||[]).length,6);
 assert.match(support,/const shownFaqs=faqs\.filter/);
 assert.match(support,/aria-pressed=\{faqCategory===category\}/);
 assert.match(support,/No matching questions/);
 assert.match(support,/support-contact-welcome/);
 assert.match(support,/PRIVATE CUSTOMER SUPPORT/);
 assert.match(support,/support-legal-toc/);
 const css=read('src/crisp-ui.css');
 assert.match(css,/\.support-about-look \.support-card-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.support-faq-empty/);
});

test('contact page does not falsely say checkout unavailable before business details finish loading',()=>{
 const src=read('src/components/Support/BusinessContact.tsx');
 assert.match(src,/const \[loaded,setLoaded\]=useState\(false\)/);
 assert.match(src,/!loaded&&/);
 assert.match(src,/loaded&&\(failed\|\|/);
 assert.doesNotMatch(src,/Live paid checkout is unavailable until these details are complete/);
});

test('public homepage reflects one-time 30-day pricing rather than recurring monthly payment',()=>{
 const src=read('src/components/Public/PublicLandingPage.tsx');
 assert.match(src,/plan\.id!=='free'&&<small> \/ 30 days<\/small>/);
 assert.match(src,/renewal is manual/);
 assert.doesNotMatch(src,/<small>\/ month<\/small>/);
});

test('password recovery returns to correct login and shares visual brand',()=>{
 const src=read('src/components/Auth/ResetPasswordPage.tsx');
 assert.match(src,/auth-recovery-page/);
 assert.match(src,/window\.location\.assign\('\/login'\)/);
 assert.doesNotMatch(src,/AutoReply account/);
});

test('workspace polish is scoped and cannot change excluded pages',()=>{
 const css=read('src/crisp-ui.css');
 for(const scope of ['.dashboard-premium','.automations-premium','.inbox-premium','.settings-about-body','.support-about-look','.auth-premium-page'])
   assert.ok(css.includes(scope),'missing scoped selector '+scope);
 const automations=read('src/components/Automations/AutomationsPage.tsx');
 assert.match(automations,/automation-page-heading/);
 assert.match(automations,/Templates are starting points/);
 const inbox=read('src/components/Inbox/InboxPage.tsx');
 assert.match(inbox,/inbox-premium-shell/);
 const dashboard=read('src/components/Home/HomePage.tsx');
 assert.match(dashboard,/dashboard-premium/);
 const settings=read('src/components/Settings/SettingsPage.tsx');
 assert.match(settings,/#settings-notifications/);
 assert.match(settings,/usage\.plan\.id==='free'/);
});
