import React, { useState } from 'react';
import {
  Instagram,
  RefreshCw,
  Trash2,
  LogOut,
  Mail,
  ShieldCheck,
  Settings2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  MessageSquareText,
  WandSparkles,
  ChevronDown,
  MessageCircle,
  Bot,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserAvatar } from '../Common/UserAvatar';

export const SettingsPage: React.FC = () => {
  const {
    user,
    firebaseUser,
    logout,
    instagramAccount,
    disconnectChannel,
    setIsConnectModalOpen,
  } = useApp();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to sign out?')) return;

    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Remove this Instagram account from AutoReply.io?')) return;

    setIsDisconnecting(true);
    try {
      await disconnectChannel();
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-6 bg-[#F7FAFF] p-4 sm:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white/90 via-blue-50/75 to-violet-50/80 p-5 shadow-[0_14px_45px_rgba(72,95,145,0.08)] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-200/35 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-indigo-500"><Sparkles className="h-3.5 w-3.5" />Workspace settings</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Settings</h1>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-600">Manage your secure session and the Instagram profile that powers your automations.</p>
          </div>
        </div>
      </section>
      <div className="rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_36px_rgba(72,95,145,0.08)] backdrop-blur-sm sm:p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-950">Account & Security</h3>
            <p className="text-xs font-semibold text-slate-600">
              Manage your account and signed-in session.
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-800">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
            Secure Session
          </span>
        </div>

        <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-blue-50/65 to-violet-50/45 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <UserAvatar
              src={user.avatar_url}
              username={user.name}
              size="lg"
            />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-slate-950">{user.name}</h4>
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                  {user.plan} Plan
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>{firebaseUser?.email || user.email || 'Account session'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 sm:w-auto"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_36px_rgba(72,95,145,0.08)] backdrop-blur-sm sm:p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-950">Instagram Account</h3>
            <p className="text-xs font-semibold text-slate-600">
              Connect, switch, or remove the Instagram account used by automations.
            </p>
          </div>
          {instagramAccount && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Connected
            </span>
          )}
        </div>

        {instagramAccount ? (
          <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-blue-50/65 to-violet-50/45 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <UserAvatar
                src={instagramAccount.profile_pic_url}
                username={instagramAccount.username}
                showInstagramBadge
                size="lg"
              />
              <div>
                <h4 className="text-sm font-black text-slate-950">
                  @{instagramAccount.username}
                </h4>
                <p className="mt-0.5 text-xs font-bold text-slate-600">
                  {(instagramAccount.followers_count || 0).toLocaleString()} Followers
                </p>
              </div>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-black text-indigo-700 transition-colors hover:bg-indigo-100 sm:flex-none"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Switch / Update
              </button>

              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-black text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 sm:flex-none"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDisconnecting ? 'Removing...' : 'Remove Profile'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4 rounded-2xl border border-dashed border-indigo-200 bg-gradient-to-br from-blue-50/70 to-violet-50/60 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white shadow-md">
              <Instagram className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-base font-black text-slate-900">
                No Instagram Account Linked
              </h4>
              <p className="mx-auto mt-1 max-w-sm text-xs font-semibold text-slate-600">
                Connect Instagram to enable live DM automations.
              </p>
            </div>
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-500 px-5 py-2.5 text-xs font-black text-white shadow-md"
            >
              <Instagram className="h-4 w-4" />
              Connect Instagram
            </button>
          </div>
        )}
      </div>

      <section id="automation-setup" className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-blue-50/85 via-white/80 to-violet-50/90 p-5 shadow-[0_14px_42px_rgba(72,95,145,0.08)] sm:p-7">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Simple Setup</div>
          <h2 className="mt-1 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-2xl font-black text-transparent sm:text-3xl">How to Set Up Automation</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">Connect Instagram, create your workflow, then turn it live. Your existing automation and account data stay unchanged.</p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600"><Instagram className="h-4 w-4" /></div>
            <div className="text-sm font-black text-slate-900">1. Connect Instagram</div>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-600">Use the official Meta connection below and confirm the correct Instagram profile is connected.</p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600"><MessageSquareText className="h-4 w-4" /></div>
            <div className="text-sm font-black text-slate-900">2. Build Your Workflow</div>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-600">Open Automations, choose Comment, Story, DM or AI Conversation, then add triggers and replies.</p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><WandSparkles className="h-4 w-4" /></div>
            <div className="text-sm font-black text-slate-900">3. Activate & Monitor</div>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-600">Save the automation, switch it live and monitor conversations and activity from your workspace.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Official Meta OAuth</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-indigo-700"><ArrowRight className="h-3.5 w-3.5" />Connect → Build → Go Live</span>
        </div>
      </section>


      <section className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white/90 via-blue-50/70 to-violet-50/85 p-5 shadow-[0_14px_42px_rgba(72,95,145,0.08)] sm:p-7">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">Step-by-step Guides</div>
          <h2 className="mt-1 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-2xl font-black text-transparent sm:text-3xl">How to Create Automation</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">जिस automation को बनाना है, उस पर tap करें। नीचे Hindi + English में उसका setup खुल जाएगा।</p>
        </div>
        <div className="mt-6 space-y-3">
          {[
            { id: 'comment', icon: MessageSquareText, title: 'Comment Reply', sub: 'Comment आने पर automatic DM / reply', en: 'Create Automation → Comment Reply चुनें → All Messaging या Keywords चुनें → जरूरत हो तो Instagram post/reel select करें → Next: Configure Message में reply लिखें → Save करके automation Live करें।', hi: 'Create Automation खोलें → Comment Reply चुनें → सभी comments के लिए All Messaging या खास शब्दों के लिए Keywords चुनें → जरूरत हो तो Post/Reel चुनें → अगले step में भेजा जाने वाला reply लिखें → Save करके Live करें।' },
            { id: 'story', icon: Instagram, title: 'Story Reply', sub: 'Story reply/mention पर automatic response', en: 'Create Automation → Story Reply चुनें → trigger condition set करें → Response step में message configure करें → Save and activate the workflow.', hi: 'Create Automation में Story Reply चुनें → किस story interaction पर trigger होना है वह सेट करें → Response में अपना message लिखें → Save करके automation चालू करें।' },
            { id: 'dm', icon: MessageCircle, title: 'DM Reply', sub: 'Incoming DM या keyword का automatic reply', en: 'Create Automation → DM Reply चुनें → All Messaging or Messages with Keywords चुनें → keyword जोड़ें if needed → configure the reply → Save and go Live.', hi: 'DM Reply चुनें → हर DM के लिए All Messaging या खास शब्दों के लिए Messages with Keywords चुनें → जरूरत के keywords जोड़ें → reply message सेट करें → Save करके Live करें।' },
            { id: 'ai', icon: Bot, title: 'AI Conversation', sub: 'AI से multi-turn Instagram conversation', en: 'Create Automation → DM AI Conversation चुनें → AI instructions/prompt और response behavior configure करें → review the settings → Save and activate.', hi: 'DM AI Conversation चुनें → AI को क्या काम करना है उसकी instructions/prompt दें → response behavior सेट करें → settings check करें → Save करके Live करें।' },
          ].map((guide) => {
            const Icon = guide.icon;
            const isOpen = openGuide === guide.id;
            return (
              <div key={guide.id} className="overflow-hidden rounded-2xl border border-indigo-100 bg-white/80 shadow-sm">
                <button type="button" onClick={() => setOpenGuide(isOpen ? null : guide.id)} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-indigo-50/50">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-violet-100 text-indigo-600"><Icon className="h-4.5 w-4.5" /></div>
                  <div className="min-w-0 flex-1"><div className="text-sm font-black text-slate-900">{guide.title}</div><div className="mt-0.5 text-xs font-medium text-slate-600">{guide.sub}</div></div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-indigo-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="grid gap-3 border-t border-indigo-100 bg-gradient-to-br from-blue-50/45 to-violet-50/40 p-4 md:grid-cols-2">
                    <div className="rounded-xl border border-blue-100 bg-white/80 p-3"><div className="mb-1 text-[11px] font-black uppercase tracking-wider text-blue-600">English</div><p className="text-xs font-medium leading-5 text-slate-700">{guide.en}</p></div>
                    <div className="rounded-xl border border-violet-100 bg-white/80 p-3"><div className="mb-1 text-[11px] font-black uppercase tracking-wider text-violet-600">हिंदी</div><p className="text-xs font-medium leading-5 text-slate-700">{guide.hi}</p></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
};
