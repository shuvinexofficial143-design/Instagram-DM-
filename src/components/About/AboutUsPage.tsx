import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Inbox,
  Instagram,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AboutUsPage: React.FC = () => {
  const { setActiveTab, setIsBuilderOpen, setIsConnectModalOpen } = useApp();

  const capabilities = [
    {
      icon: Workflow,
      title: 'Automation workflows',
      description:
        'Create keyword, comment, story-reply and direct-message workflows from one place.',
    },
    {
      icon: MessageSquareText,
      title: 'AI-assisted conversations',
      description:
        'Use AI where it adds value, while keeping a clear path for manual replies and human takeover.',
    },
    {
      icon: Inbox,
      title: 'Inbox and contact history',
      description:
        'Keep conversations, contacts and automation activity organized inside a single workspace.',
    },
    {
      icon: ShieldCheck,
      title: 'Account-level separation',
      description:
        'Authentication and workspace data are separated by user account so each signed-in user has an isolated workspace.',
    },
  ];

  const principles = [
    'Simple enough to set up without a technical team',
    'Built around official account connections and authenticated sessions',
    'Designed to keep automation understandable and controllable',
    'Focused on practical messaging workflows instead of unnecessary complexity',
  ];

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        {/* Page heading */}
        <header className="border-b border-slate-200 pb-8 lg:pb-10">
          <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Zap className="h-4 w-4" />
            </span>
            <span>AutoReply.io</span>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div className="max-w-3xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                About us
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-[58px] lg:leading-[1.05]">
                Better conversations, without managing every message by hand.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                AutoReply.io is an Instagram messaging automation workspace for creators, businesses and teams. It brings automated replies, AI-assisted conversations, contacts and inbox management into one clear workflow.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">What we are building</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                A practical tool that helps people respond faster, organize conversations and automate repetitive Instagram interactions without making the experience feel robotic.
              </p>
            </div>
          </div>
        </header>

        {/* Story / purpose */}
        <section className="grid gap-8 border-b border-slate-200 py-10 lg:grid-cols-[0.65fr_1.35fr] lg:gap-14 lg:py-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Our purpose</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Automation should save time, not create more work.
            </h2>
          </div>

          <div className="space-y-5 text-[15px] leading-7 text-slate-600 sm:text-base">
            <p>
              Social inboxes become difficult to manage as an audience grows. The same questions arrive repeatedly, leads get buried inside message requests, and manual follow-up takes time away from the actual business.
            </p>
            <p>
              AutoReply.io is being built to solve that problem in a straightforward way. A user can connect an Instagram account, create automation rules, manage incoming conversations and step in manually whenever a human response is needed.
            </p>
            <p>
              The goal is not to replace real communication. The goal is to remove repetitive work so important conversations receive more attention.
            </p>
          </div>
        </section>

        {/* Capabilities */}
        <section className="py-10 lg:py-14">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Platform</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Everything needed for a focused messaging workflow.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              The product is organized around a few core jobs instead of a long list of disconnected features.
            </p>
          </div>

          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-2">
            {capabilities.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className={`p-6 sm:p-7 ${index % 2 === 0 ? 'md:border-r md:border-slate-200' : ''} ${index < 2 ? 'border-b border-slate-200' : ''}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="rounded-2xl bg-slate-950 px-6 py-8 text-white sm:px-8 lg:px-10 lg:py-10">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">How it works</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                From connection to conversation in three steps.
              </h2>
            </div>

            <div className="divide-y divide-slate-800 border-y border-slate-800">
              <div className="grid grid-cols-[44px_1fr] gap-4 py-5">
                <span className="text-sm font-semibold text-slate-500">01</span>
                <div>
                  <h3 className="font-semibold text-white">Connect your Instagram account</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">Authorize the account you want to manage inside your workspace.</p>
                </div>
              </div>
              <div className="grid grid-cols-[44px_1fr] gap-4 py-5">
                <span className="text-sm font-semibold text-slate-500">02</span>
                <div>
                  <h3 className="font-semibold text-white">Create the response logic</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">Choose the trigger, define the reply and decide where AI or manual handling should be used.</p>
                </div>
              </div>
              <div className="grid grid-cols-[44px_1fr] gap-4 py-5">
                <span className="text-sm font-semibold text-slate-500">03</span>
                <div>
                  <h3 className="font-semibold text-white">Manage everything from one inbox</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">Review conversations, contacts and automation activity without jumping between tools.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="grid gap-8 border-b border-slate-200 py-10 lg:grid-cols-[0.65fr_1.35fr] lg:gap-14 lg:py-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Product principles</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Built to stay useful as the workspace grows.
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {principles.map((principle) => (
              <div key={principle} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <p className="text-sm font-medium leading-6 text-slate-700">{principle}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Security note */}
        <section className="grid gap-6 py-10 lg:grid-cols-3 lg:gap-8 lg:py-12">
          <div className="lg:col-span-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-950">Designed with account separation in mind</h2>
          </div>
          <div className="lg:col-span-2">
            <p className="text-sm leading-7 text-slate-600 sm:text-base">
              Signed-in workspaces are separated by authenticated user identity. Instagram connection data, automation data, contacts and inbox state are kept associated with the active account instead of being treated as one shared workspace.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600">
              <Sparkles className="h-4 w-4" />
              <span>Start with one workflow</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              Connect your account and build the first automation.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You can keep the setup simple and expand it only when your messaging workflow needs more automation.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              <Instagram className="h-4 w-4" />
              Connect Instagram
            </button>
            <button
              onClick={() => setIsBuilderOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              Create automation
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Simple footer navigation */}
        <footer className="flex flex-col gap-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>AutoReply.io — Instagram messaging automation workspace.</p>
          <div className="flex items-center gap-5">
            <button onClick={() => setActiveTab('inbox')} className="font-medium text-slate-600 hover:text-slate-950">
              Inbox
            </button>
            <button onClick={() => setActiveTab('automations')} className="font-medium text-slate-600 hover:text-slate-950">
              Automations
            </button>
            <button onClick={() => setActiveTab('settings')} className="font-medium text-slate-600 hover:text-slate-950">
              Settings
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
