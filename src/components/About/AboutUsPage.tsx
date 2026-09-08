import React from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  Instagram,
  Link2,
  MessageCircle,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AboutUsPage: React.FC = () => {
  const { setActiveTab, setIsBuilderOpen, setIsConnectModalOpen } = useApp();

  const features = [
    {
      icon: MessageSquareText,
      title: 'Auto DM on Comment',
      description: 'Automatically send a helpful DM when a matching comment triggers one of your workflows.',
    },
    {
      icon: Zap,
      title: 'Keyword Triggers',
      description: 'Create smart response rules around keywords in comments and incoming Instagram messages.',
    },
    {
      icon: MessageCircle,
      title: 'Story Reply DMs',
      description: 'Respond to story replies and mentions with automation while keeping conversations organized.',
    },
    {
      icon: BarChart3,
      title: 'Inbox + Activity Dashboard',
      description: 'Keep conversations, automation activity and engagement history together in one workspace.',
    },
    {
      icon: UserRound,
      title: 'Unique Contact Tracking',
      description: 'Identify people interacting with your account and keep their conversation history in one place.',
    },
    {
      icon: FileText,
      title: 'Activity Log',
      description: 'See which automation ran, what triggered it and what response was generated or sent.',
    },
    {
      icon: Link2,
      title: 'Webhook Integration',
      description: 'Receive Instagram events through webhooks so your automation can react to real activity.',
    },
    {
      icon: ShieldCheck,
      title: 'Official Meta OAuth',
      description: 'Connect through the official Meta authorization flow without sharing your Instagram password.',
    },
    {
      icon: Sparkles,
      title: 'AI-Assisted Conversations',
      description: 'Use AI where it helps while keeping manual replies and human takeover available when needed.',
    },
    {
      icon: Inbox,
      title: 'Human Takeover',
      description: 'Pause AI for a conversation and reply manually whenever a real person should take control.',
    },
  ];

  const steps = [
    {
      number: '1',
      title: 'Connect Your Instagram',
      description: 'Securely authorize your Instagram professional account through the official Meta OAuth flow.',
    },
    {
      number: '2',
      title: 'Build Your Workflow',
      description: 'Choose a trigger, add response actions and decide when automation or AI should respond.',
    },
    {
      number: '3',
      title: 'Watch It Work',
      description: 'Let AutoReply.io handle repetitive engagement while you monitor everything from one dashboard.',
    },
  ];

  const benefits = [
    {
      title: 'Time-Saving',
      description: 'Automate repetitive Instagram engagement and spend more time on important conversations.',
    },
    {
      title: 'Consistent Responses',
      description: 'Keep common replies fast and predictable across comments, story replies and DMs.',
    },
    {
      title: 'Scalable Engagement',
      description: 'Handle more interactions without manually answering the same questions again and again.',
    },
    {
      title: 'Human Control',
      description: 'Step in manually whenever a conversation needs judgment, context or a personal response.',
    },
    {
      title: 'Account Separation',
      description: 'Signed-in workspaces keep each user’s automation, contacts and Instagram connection separated.',
    },
    {
      title: 'Clear Activity History',
      description: 'Review automation runs and conversation activity so you can understand what happened and why.',
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F7FAFF] text-slate-900">
      {/* Soft background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-blue-200/25 blur-3xl" />
        <div className="absolute -right-28 top-4 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="absolute left-1/3 top-[42%] h-72 w-72 rounded-full bg-cyan-100/35 blur-3xl" />
        <div className="absolute -bottom-20 right-1/4 h-80 w-80 rounded-full bg-fuchsia-100/30 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
        {/* Hero */}
        <section className="mx-auto max-w-4xl text-center pt-2 sm:pt-5">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/80 px-4 py-2 text-xs font-bold text-blue-700 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Automate • Engage • Grow
          </div>

          <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">
            About{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600 bg-clip-text text-transparent">
              AutoReply.io
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            We are building a simpler way for creators and businesses to manage Instagram conversations, automate repetitive replies and keep important interactions organized.
          </p>
        </section>

        {/* Mission */}
        <section className="mx-auto mt-10 max-w-4xl text-center sm:mt-12">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Our Mission</p>
          <h2 className="mt-3 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
            Make Instagram engagement easier to manage.
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            Our mission is to help growing creators, brands and teams respond faster without making every conversation feel robotic. Automation should remove repetitive work while keeping real people in control whenever a human response matters.
          </p>
        </section>

        {/* What we offer */}
        <section className="mt-12 sm:mt-16">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">Platform</p>
            <h2 className="mt-2 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
              What We Offer
            </h2>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="group rounded-2xl border border-white/80 bg-white/75 p-4 shadow-[0_12px_40px_rgba(73,112,178,0.08)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_50px_rgba(78,104,219,0.12)] sm:p-5"
                >
                  <div className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 via-indigo-100 to-violet-100 text-indigo-600 ring-1 ring-white shadow-sm transition-transform group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-blue-900 sm:text-[15px]">{feature.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-14 sm:mt-20">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Simple Setup</p>
            <h2 className="mt-2 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
              How It Works
            </h2>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.number}
                className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-center shadow-[0_12px_35px_rgba(74,93,139,0.08)]"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-sm font-black text-white shadow-lg shadow-indigo-500/20">
                  {step.number}
                </div>
                <h3 className="mt-4 text-base font-black text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Why choose */}
        <section className="mt-14 sm:mt-20">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">Built for practical workflows</p>
            <h2 className="mt-2 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
              Why Choose AutoReply.io?
            </h2>
          </div>

          <div className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
                <div>
                  <h3 className="text-sm font-black text-blue-700">{benefit.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust strip */}
        <section className="mt-14 grid gap-4 sm:grid-cols-3 sm:mt-18">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/65 p-5">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <h3 className="mt-3 text-sm font-black text-slate-900">Official connection flow</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">Instagram connects through Meta OAuth rather than password sharing.</p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/65 p-5">
            <Users className="h-6 w-6 text-violet-600" />
            <h3 className="mt-3 text-sm font-black text-slate-900">Separate user workspaces</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">Each signed-in account keeps its own workspace data and Instagram connection.</p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/65 p-5">
            <Clock3 className="h-6 w-6 text-cyan-700" />
            <h3 className="mt-3 text-sm font-black text-slate-900">Built for faster responses</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">Automation handles repetitive work so important conversations get more attention.</p>
          </div>
        </section>

        {/* CTA */}
        <section className="relative mt-14 overflow-hidden rounded-3xl border border-violet-200/70 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-100/80 p-6 shadow-[0_18px_55px_rgba(91,81,180,0.10)] sm:mt-20 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-300/25 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="inline-flex items-center gap-2 text-sm font-black text-indigo-600">
              <Sparkles className="h-4 w-4" />
              Get Started Today
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Turn repetitive Instagram replies into a smarter workflow.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              Connect your account, build one automation and expand only when your messaging workflow needs it.
            </p>
          </div>

          <div className="relative mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-transform hover:-translate-y-0.5"
            >
              <Instagram className="h-4 w-4" />
              Connect Instagram
            </button>
            <button
              onClick={() => setIsBuilderOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white/90 px-5 py-3 text-sm font-bold text-indigo-700 transition-colors hover:bg-white"
            >
              Create Automation
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 border-t border-blue-100/80 py-8 sm:mt-16">
          <div className="grid gap-8 sm:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/20">
                  <Zap className="h-4 w-4 fill-white" />
                </div>
                <span className="text-base font-black tracking-tight text-slate-950">AutoReply.io</span>
              </div>
              <p className="mt-3 max-w-xs text-xs leading-5 text-slate-500">
                Instagram messaging automation for faster replies, organized conversations and practical engagement workflows.
              </p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">Product</p>
              <div className="mt-3 space-y-2 text-sm">
                <button onClick={() => setActiveTab('automations')} className="block font-medium text-slate-600 hover:text-indigo-600">
                  Automations
                </button>
                <button onClick={() => setActiveTab('inbox')} className="block font-medium text-slate-600 hover:text-indigo-600">
                  Inbox
                </button>
                <button onClick={() => setActiveTab('contacts')} className="block font-medium text-slate-600 hover:text-indigo-600">
                  Contacts
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">Workspace</p>
              <div className="mt-3 space-y-2 text-sm">
                <button onClick={() => setActiveTab('home')} className="block font-medium text-slate-600 hover:text-indigo-600">
                  Home
                </button>
                <button onClick={() => setActiveTab('settings')} className="block font-medium text-slate-600 hover:text-indigo-600">
                  Settings
                </button>
                <button onClick={() => setActiveTab('about')} className="block font-medium text-slate-600 hover:text-indigo-600">
                  About Us
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-slate-200/70 pt-5 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 AutoReply.io. All rights reserved.</p>
            <p>Built for creators, businesses and growing teams.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};
