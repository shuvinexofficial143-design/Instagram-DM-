import { GoogleSheetsSetup } from '../Automations/GoogleSheetsSetup';
import { CustomerDataCard } from '../CustomerData/CustomerDataCard';
import { InstagramAccounts } from '../Common/InstagramAccounts';
import React, { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Download,
  Globe2,
  Instagram,
  LogOut,
  Mail,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useWorkspaceUsage } from '../../hooks/useWorkspaceUsage';
import { UserAvatar } from '../Common/UserAvatar';
import { auth } from '../../lib/supabase';

const LANGUAGE_KEY = 'autoreply_default_ai_language';
const TONE_KEY = 'autoreply_default_ai_tone';

const readPreference = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

export const SettingsPage: React.FC = () => {
  const {
    user,
    firebaseUser,
    logout,
    instagramAccount,
    startInstagramConnection,
    automations,
    contacts,
    inboxMessages,
    disconnectChannel,
    setIsConnectModalOpen,
  } = useApp();

  const usage = useWorkspaceUsage();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState(() => readPreference(LANGUAGE_KEY, 'Auto detect'));
  const [defaultTone, setDefaultTone] = useState(() => readPreference(TONE_KEY, 'Friendly'));
  const [savedPreference, setSavedPreference] = useState('');
  const [mailOptIn, setMailOptIn] = useState(false);
  const [mailLoading, setMailLoading] = useState(true);
  const [mailSaving, setMailSaving] = useState(false);
  const [mailError, setMailError] = useState('');
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let alive=true;
    auth.currentUser?.getIdToken().then(token=>fetch('/api/workspace-data?action=mail-preferences',{
      headers:{Authorization:'Bearer '+token},cache:'no-store'
    })).then(res=>res.json()).then(data=>{
      if(!alive)return;
      if(!data.ok)throw new Error(data.error||'Unable to load email preferences.');
      setMailOptIn(Boolean(data.marketingOptIn));
      setMailError('');
    }).catch((err)=>{if(alive)setMailError(err.message||'Email preferences unavailable.');}).finally(()=>{if(alive)setMailLoading(false);});
    return()=>{alive=false;};
  },[firebaseUser?.uid]);
  async function changeMailPreference(checked:boolean){
    setMailSaving(true);setMailError('');
    try{
      const token=await auth.currentUser?.getIdToken();
      if(!token)throw new Error('Sign in to update email preferences.');
      const result=await fetch('/api/workspace-data?action=mail-preferences',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({marketingOptIn:checked}),signal:AbortSignal.timeout(13000)
      });
      const data=await result.json().catch(()=>null);
      if(!result.ok||!data?.ok)throw new Error(data?.error||'Failed to save.');
      setMailOptIn(Boolean(data.marketingOptIn));
      flashSaved(data.marketingOptIn?'Email tips enabled':'Email tips disabled');
    }catch(e:any){setMailError(e.message||'Could not update preference.');}
    finally{setMailSaving(false);}
  }


  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, defaultLanguage);
      localStorage.setItem(TONE_KEY, defaultTone);
    } catch {}
  }, [defaultLanguage, defaultTone]);

  const flashSaved = (label: string) => {
    setSavedPreference(label);
    window.setTimeout(() => setSavedPreference(''), 1600);
  };

  const handleExportData = () => {
    const exportData = {
      exported_at: new Date().toISOString(),
      profile: user,
      instagram_account: instagramAccount ? { ...instagramAccount, access_token: undefined } : null,
      automations,
      contacts,
      inbox_messages: inboxMessages,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `autoreply-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleLogout = async () => {
    if (!window.confirm('Sign out of Auto Replies?')) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleDisconnect = async () => {
    if (!instagramAccount) return;
    if (!window.confirm(`Disconnect @${instagramAccount.username} from Auto Replies? Active Instagram automations may stop working until an account is connected again.`)) return;
    setIsDisconnecting(true); setDisconnectError('');
    try {
      await disconnectChannel();
    } catch (error:any) {
      setDisconnectError(error?.message || 'Could not disconnect Instagram. Please try again.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const accountName = firebaseUser?.displayName || user.name || 'Account owner';
  const accountEmail = firebaseUser?.email || user.email || 'Signed-in account';

  return (
    <div className="settings-about-shell">
      <header className="settings-about-hero">
        <div className="settings-about-hero-inner">
          <div className="settings-about-eyebrow"><span className="settings-about-hero-mark"><Settings2 className="h-5 w-5" /></span> YOUR WORKSPACE</div>
          <h1>Everything you need.<br/><span>Beautifully in control.</span></h1>
          <p>Personalize your account, connect Instagram securely, and keep your AI conversations on your terms. All your essentials, one clear place.</p>
          <nav aria-label="Settings quick links" className="settings-about-quicklinks">
            <a href="#settings-account"><ShieldCheck className="h-4 w-4"/> My account</a>
            <a href="#settings-ai"><SlidersHorizontal className="h-4 w-4"/> AI preferences</a>
            <a href="#settings-notifications"><Mail className="h-4 w-4"/> Email preferences</a>
            <a href="#settings-privacy"><Download className="h-4 w-4"/> Data & privacy</a>
            <a href="/contact"><Mail className="h-4 w-4"/> Support</a>
          </nav>
        </div>
      </header>
      <div className="settings-about-body">

      <InstagramAccounts />
      <section aria-label="Data and integrations" className="grid gap-4 md:grid-cols-2"><CustomerDataCard/><GoogleSheetsSetup/></section>

      <section id="manage-subscription" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarClock className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Manage subscription</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{usage.unlimited?'Administrator · Unlimited. No plan purchase or renewal required.':usage.plan.id==='free'?'Free plan · no purchase required.':`${usage.plan.name} plan · ${usage.plan.price} for 30 days. Renew manually when you need it; no automatic charges.`}</p>
              {usage.expiresAt && <p className="mt-2 text-sm text-slate-500">Access until {new Date(usage.expiresAt).toLocaleString()}</p>}
            </div>
          </div>
          <a href="/refunds" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refund &amp; cancellation policy</a>
        </div>
      </section>


      <section id="settings-account" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Account</h2>
            <p className="mt-1 text-sm text-slate-500">Your signed-in Auto Replies account.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
            <ShieldCheck className="h-4 w-4" /> Secure session
          </span>
        </div>

        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar
              src={firebaseUser?.photoURL || user.avatar_url}
              username={accountName}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-bold text-slate-900">{accountName}</h3>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold capitalize text-indigo-700">{usage.unlimited?'Administrator':`${user.plan} plan`}</span>
              </div>
              <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-slate-500">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="truncate">{accountEmail}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">Signed in with your connected authentication account.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-950">Instagram account</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">The Instagram profile used for DMs, comments, stories and automations.</p>
        </div>

        {instagramAccount ? (
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <UserAvatar
                  src={instagramAccount.profile_pic_url}
                  username={instagramAccount.username}
                  showInstagramBadge
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-bold text-slate-900">@{instagramAccount.username}</h3>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{(instagramAccount.followers_count || 0).toLocaleString()} followers</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => startInstagramConnection('reconnect')}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-700 hover:bg-indigo-100 sm:w-auto"
              >
                <RefreshCw className="h-4 w-4" />
                Reconnect this account
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white">
                <Instagram className="h-6 w-6" />
              </span>
              <h3 className="mt-3 text-base font-bold text-slate-900">No Instagram account connected</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Connect the Instagram business or creator profile that should receive and automate customer messages.</p>
              <button
                type="button"
                onClick={() => startInstagramConnection('connect')}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                <Instagram className="h-4 w-4" />
                Connect Instagram
              </button>
            </div>
          </div>
        )}
      </section>

      <section id="settings-ai" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-950">Default AI preferences</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Used as the starting defaults when you create a new AI DM Conversation.</p>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Globe2 className="h-4 w-4 text-slate-400" /> Reply language</span>
            <select
              value={defaultLanguage}
              onChange={(event) => { setDefaultLanguage(event.target.value); flashSaved('Language saved'); }}
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
            >
              <option>Auto detect</option>
              <option>English</option>
              <option>Hindi</option>
              <option>Hinglish</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">Reply tone</span>
            <select
              value={defaultTone}
              onChange={(event) => { setDefaultTone(event.target.value); flashSaved('Tone saved'); }}
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
            >
              <option>Friendly</option>
              <option>Professional</option>
              <option>Sales Expert</option>
              <option>Customer Support</option>
            </select>
          </label>

          <div className="sm:col-span-2 min-h-5">
            {savedPreference && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{savedPreference}</span>}
          </div>
        </div>
      </section>

      <section id="settings-notifications" className="rounded-2xl border border-orange-100 bg-white shadow-sm">
        <div className="border-b border-orange-100 p-5 sm:p-6">
          <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-orange-700"/><h2 className="text-lg font-bold text-slate-950">Email notifications</h2></div>
          <p className="mt-2 text-sm leading-6 text-slate-600">A welcome email is sent when your account first signs in. Payment invoices and important service emails are separate from optional product tips.</p>
        </div>
        <div className="p-5 sm:p-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={mailOptIn} disabled={mailLoading||mailSaving||!firebaseUser?.email} onChange={e=>void changeMailPreference(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-orange-700"/>
            <span className="min-w-0"><strong className="block text-base font-bold text-slate-900">Send me helpful tips if I haven't visited</strong><span className="mt-1 block text-sm leading-6 text-slate-600">Optional onboarding emails, up to four reminders after approximately 3, 6, 9 and 12 days without visiting. Stop automatically when you return. You can turn these emails off anytime, or use the one-click Unsubscribe link.</span></span>
          </label>
          {mailLoading&&<p className="mt-3 text-sm text-slate-500">Loading preferences…</p>}
          {mailError&&<p role="alert" className="mt-3 text-sm text-rose-700">{mailError}</p>}
          <p className="mt-4 text-xs text-slate-500">These promotional learning reminders are OFF unless you actively check this box. Transactional purchase receipts still arrive if our email provider is configured.</p>
        </div>
      </section>
      <section id="settings-privacy" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">Data & privacy</h2>
          <p className="mt-1 text-sm text-slate-500">Download a copy of the workspace data currently available to Auto Replies.</p>
        </div>

        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Export workspace data</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Includes your profile metadata, connected Instagram account metadata, automations, contacts and inbox messages. Instagram access tokens are excluded.</p>
          </div>
          <button
            type="button"
            onClick={handleExportData}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            Export data
          </button>
        </div>
      </section>

      {disconnectError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{disconnectError}</p>}
      {instagramAccount && (
        <section className="rounded-2xl border border-rose-200 bg-white shadow-sm">
          <div className="border-b border-rose-100 p-5 sm:p-6">
            <h2 className="text-lg font-bold text-rose-700">Danger zone</h2>
            <p className="mt-1 text-sm text-slate-500">Actions here can stop live Instagram automations.</p>
          </div>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Disconnect Instagram</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Remove @{instagramAccount.username} from Auto Replys. Use Connect Instagram to connect it or another account again.</p>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 sm:w-auto"
            >
              <Trash2 className="h-4 w-4" />
              {isDisconnecting ? 'Disconnecting…' : 'Disconnect Instagram'}
            </button>
          </div>
        </section>
      )}
      <div className="settings-about-outro">
        <div><span className="settings-about-kicker">WE'RE HERE TO HELP</span><h2>A calmer way to get things done.</h2><p>Questions about connections, billing or security? Talk directly with our support team.</p></div>
        <a href="/contact">Contact support <Mail className="h-4 w-4" /></a>
      </div>
      </div>
    </div>
  );
};
