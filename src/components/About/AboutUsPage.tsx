import React from 'react';
import { ArrowRight, MessageSquare, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AboutUsPage: React.FC = () => {
  const { firebaseUser, setIsBuilderOpen } = useApp();
  const values = [
    { icon: MessageSquare, title: 'Useful conversations', text: 'Help customers find answers, discover your products and share the details your business needs. Keep the conversation clear and relevant.' },
    { icon: SlidersHorizontal, title: 'Your business, your voice', text: 'Choose your instructions, reply style and automation triggers. Preview how your assistant responds before you publish.' },
    { icon: ShieldCheck, title: 'People stay in control', text: 'Connect through Meta authorization, keep your conversations in one inbox and take over personally when a customer needs you.' },
  ];
  return <div className="about-professional">
    <section className="about-hero"><div className="marketing-container"><span className="eyebrow">About Auto Replies</span><h1>Less repetitive work.<br/>More meaningful conversations.</h1><p className="about-intro">Auto Replies helps creators and businesses manage Instagram conversations with AI replies, simple automation and an organized inbox.</p><div className="hero-actions"><button type="button" className="button-primary" onClick={()=>firebaseUser ? setIsBuilderOpen(true) : window.location.assign('/login?mode=signup')}>Get started <ArrowRight/></button><a href="/help" className="button-secondary">Explore the Help Center</a></div></div></section>
    <section className="marketing-section"><div className="marketing-container"><div className="section-heading"><span className="eyebrow">Our mission</span><h2>Make everyday engagement easier.</h2><p>Growing a business should not mean answering the same question all day. We bring replies, contacts and follow-ups together so you can spend more time on the work that needs you.</p></div><div className="about-values">{values.map(({icon:Icon,title,text})=><article key={title} className="about-value"><Icon/><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
    <section className="marketing-section setup-section"><div className="marketing-container"><div className="section-heading"><span className="eyebrow">A practical workspace</span><h2>From first message to next step.</h2><p>Connect an eligible Instagram professional account, add business facts and build a reply workflow. Use your inbox and contact history to keep track of conversations. Connect Google Sheets when you want to organize lead details in a spreadsheet.</p></div><div className="human-control"><ShieldCheck/><div><h3>A clear connection process.</h3><p>Instagram authorization happens through Meta. Auto Replies does not ask for your Instagram password.</p></div><a href="/privacy">Privacy details <ArrowRight/></a></div></div></section>
    <section className="marketing-container final-cta"><div><span className="eyebrow">Start with one conversation</span><h2>Meet your next Instagram assistant.</h2><p>Explore the free plan and set up your first automation.</p></div><a className="button-primary" href="/login?mode=signup">Get started <ArrowRight/></a></section>
  </div>;
};
