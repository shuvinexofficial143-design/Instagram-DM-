import React from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Instagram,
  MessageSquare,
  BarChart3,
  Users,
  Zap,
  ShieldCheck,
  Sparkles,
  Menu,
  X,
} from 'lucide-react';

export const PublicLandingPage: React.FC = () => {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const goLogin = () => {
    window.location.href = '/login';
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  return (
    <div className="min-h-[100dvh] bg-[#F7FAFF] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button onClick={() => scrollTo('top')} className="flex items-center gap-2.5" aria-label="AutoReply home">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6C5CE7] to-[#3B5BFF] text-white shadow-lg shadow-indigo-200">
              <Bot className="h-5 w-5" />
            </span>
            <span className="text-lg font-black tracking-tight">AutoReply</span>
          </button>

          <nav className="hidden items-center gap-7 md:flex">
            <button onClick={() => scrollTo('features')} className="text-sm font-bold text-slate-600 hover:text-slate-950">Features</button>
            <button onClick={() => scrollTo('how-it-works')} className="text-sm font-bold text-slate-600 hover:text-slate-950">How it works</button>
            <button onClick={() => scrollTo('pricing')} className="text-sm font-bold text-slate-600 hover:text-slate-950">Pricing</button>
            <a href="/about" className="text-sm font-bold text-slate-600 hover:text-slate-950">About</a>
            <a href="/help/faq" className="text-sm font-bold text-slate-600 hover:text-slate-950">FAQ</a>
            <button onClick={goLogin} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800">Log in</button>
          </nav>

          <button onClick={() => setMenuOpen((v) => !v)} className="rounded-xl border border-slate-200 bg-white p-2.5 md:hidden" aria-label="Toggle navigation">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-slate-200 bg-white px-5 py-4 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-2">
              {[
                ['Features', 'features'],
                ['How it works', 'how-it-works'],
                ['Pricing', 'pricing'],
              ].map(([label, id]) => (
                <button key={id} onClick={() => scrollTo(id)} className="rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">{label}</button>
              ))}
              <a href="/about" className="rounded-xl px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">About</a>
              <a href="/help/faq" className="rounded-xl px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">FAQ</a>
              <button onClick={goLogin} className="mt-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Log in</button>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        <section className="overflow-hidden">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pb-28 lg:pt-24">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-black text-indigo-700">
                <Instagram className="h-4 w-4" />
                Instagram automation for businesses
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.06] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                Turn Instagram conversations into
                <span className="bg-gradient-to-r from-[#6C5CE7] to-[#3B5BFF] bg-clip-text text-transparent"> automated growth.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-slate-600 sm:text-lg">
                AutoReply helps you automate Instagram DMs, respond with AI, manage conversations, and keep your leads organized from one clean workspace.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button onClick={goLogin} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3B5BFF] px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700">
                  Get started <ArrowRight className="h-4 w-4" />
                </button>
                <button onClick={() => scrollTo('features')} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-black text-slate-800 hover:bg-slate-50">
                  Explore features
                </button>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-500">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Clean dashboard</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> AI replies</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Instagram focused</span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-10 rounded-full bg-indigo-200/40 blur-3xl" />
              <div className="relative rounded-[28px] border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-200/70">
                <div className="rounded-[22px] bg-[#F7FAFF] p-4 sm:p-6">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs font-bold text-slate-400">Workspace</p>
                      <p className="text-base font-black text-slate-900">Instagram Overview</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">Connected</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[
                      ['Messages', '1,284', MessageSquare],
                      ['AI Replies', '936', Bot],
                      ['Contacts', '428', Users],
                      ['Automations', '12', Zap],
                    ] as const).map(([label, value, Icon]) => (
                      <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <Icon className="h-4 w-4 text-indigo-500" />
                        <p className="mt-4 text-xl font-black text-slate-950">{value}</p>
                        <p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-slate-800">AI Conversation</p>
                      <span className="text-[10px] font-black text-emerald-600">Active</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#3B5BFF]" />
                    </div>
                    <p className="mt-2 text-[10px] font-bold text-slate-400">Your AI assistant is handling conversations automatically.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Everything in one place</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Built for Instagram conversations.</h2>
              <p className="mt-4 text-sm font-medium leading-6 text-slate-600 sm:text-base">Manage automation, conversations, contacts, and performance without jumping between tools.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                [Bot, 'AI DM Automation', 'Let AI answer Instagram conversations using your business instructions and context.'],
                [MessageSquare, 'Smart Inbox', 'Keep incoming conversations organized and reply manually whenever a human should take over.'],
                [Users, 'Contacts & CRM', 'Keep Instagram contacts and lead information together so follow-ups stay organized.'],
                [BarChart3, 'Analytics', 'See activity and performance signals from your automation workspace.'],
                [Zap, 'Automation Rules', 'Create focused Instagram automations for DMs, comments, and story interactions.'],
                [ShieldCheck, 'Workspace Controls', 'Keep account data separated and manage your connected Instagram workspace securely.'],
              ].map(([Icon, title, text]) => (
                <div key={String(title)} className="rounded-2xl border border-slate-200 bg-[#F9FAFD] p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-base font-black text-slate-900">{String(title)}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{String(text)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Simple workflow</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">From setup to automated replies.</h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {[
                ['01', 'Sign in', 'Create or access your workspace and open the dashboard.'],
                ['02', 'Connect Instagram', 'Connect your eligible Instagram account through the official connection flow.'],
                ['03', 'Automate', 'Configure your automation and let AutoReply handle conversations while you monitor everything from the workspace.'],
              ].map(([num, title, text]) => (
                <div key={num} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                  <span className="text-sm font-black text-indigo-600">{num}</span>
                  <h3 className="mt-4 text-lg font-black text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Plans</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Start with the plan that fits your workspace.</h2>
              <p className="mt-4 text-sm font-medium leading-6 text-slate-600">Plan details are shown here for information. Billing and payment are handled separately inside the product.</p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
              {[
                ['Free', 'Get started with the core workspace', ['Instagram workspace', 'Basic automation', 'Inbox & contacts', 'Usage tracking']],
                ['Pro', 'More capacity for growing workflows', ['Higher usage limits', 'AI automation capacity', 'Advanced workspace tools', 'Priority-ready workspace']],
              ].map(([name, desc, items]) => (
                <div key={String(name)} className="rounded-3xl border border-slate-200 bg-[#F9FAFD] p-7">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-950">{String(name)}</h3>
                    {name === 'Pro' && <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black text-indigo-700">Popular</span>}
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-600">{String(desc)}</p>
                  <div className="mt-6 space-y-3">
                    {(items as string[]).map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {item}
                      </div>
                    ))}
                  </div>
                  <button onClick={goLogin} className="mt-7 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-50">Get started</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-300">Ready to automate?</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Bring your Instagram conversations into one workspace.</h2>
              </div>
              <button onClick={goLogin} className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-slate-950 hover:bg-slate-100">
                Get started <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-7 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-slate-900">AutoReply</p>
            <p className="mt-1 text-xs font-medium text-slate-500">Instagram automation workspace.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-500">
            <a href="/about" className="hover:text-slate-900">About</a>
            <a href="/help" className="hover:text-slate-900">Help</a>
            <a href="/help/faq" className="hover:text-slate-900">FAQ</a>
            <a href="/privacy" className="hover:text-slate-900">Privacy</a>
            <a href="/terms" className="hover:text-slate-900">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
