import React, { useState } from 'react';
import {
  X,
  Instagram,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserAvatar } from './UserAvatar';

export const ConnectChannelModal: React.FC = () => {
  const {
    isConnectModalOpen,
    setIsConnectModalOpen, instagramConnectMode, workspaceId,
    instagramAccount,
    disconnectChannel,
  } = useApp();

  const [isLaunching, setIsLaunching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const readableError = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;

    if (typeof value === 'object') {
      const candidate = value as any;
      const nested =
        candidate.message ||
        candidate.error_description ||
        candidate.description ||
        candidate.details ||
        candidate.code;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();

      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  };

  if (!isConnectModalOpen) return null;

  const handleOAuthLaunch = async () => {
    setFeedback(null);
    setIsLaunching(true);

    const width = 600;
    const height = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    // Open synchronously from the click so mobile/desktop popup blockers do not reject it.
    const popup = window.open(
      '',
      'MetaInstagramOAuth',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );

    try {
      // This same-origin fetch is automatically decorated with the active Supabase
      // access token by App.tsx. The server then signs the OAuth state for this UID.
      const token = await (await import('../../lib/supabase')).auth.currentUser?.getIdToken();
      if (!token) throw new Error('Your login session is missing. Please sign in with Google again.');

      const response = await fetch('/api/auth/instagram?intent=' + (instagramConnectMode || 'reconnect'), {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`, 'X-Autoreply-Workspace':workspaceId,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.url) {
        const serverMessage = readableError(payload?.error || payload);
        const serverCode = readableError(payload?.code);
        throw new Error(
          [serverCode, serverMessage].filter(Boolean).join(': ') ||
            `Could not start Instagram authorization (HTTP ${response.status}).`
        );
      }

      if (popup && !popup.closed) {
        popup.location.assign(payload.url);
      } else {
        window.location.assign(payload.url);
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Instagram authorization opened. Complete the Meta login and permission screen to connect your account.',
      });
    } catch (err: any) {
      try {
        if (popup && !popup.closed) popup.close();
      } catch {}
      setFeedback({
        type: 'error',
        message: readableError(err) || 'Could not start Instagram authorization.',
      });
    } finally {
      setIsLaunching(false);
    }
  };

  const handleDisconnect = async () => {
    setFeedback(null);
    try {
      await disconnectChannel();
      setFeedback({ type: 'success', message: 'Instagram account disconnected.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Could not disconnect the Instagram account.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/30 p-4 backdrop-blur-[3px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <div className="pointer-events-none absolute h-[360px] w-[360px] rounded-full bg-gradient-to-tr from-amber-300/20 via-pink-400/20 to-violet-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative my-auto w-[calc(100%-32px)] max-w-[500px] overflow-hidden rounded-[22px] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(49,46,129,0.18)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
        <button
          onClick={() => setIsConnectModalOpen(false)}
          aria-label="Close Instagram connection"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-slate-50/90 text-slate-500 transition duration-150 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[17px] bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white shadow-[0_10px_25px_rgba(214,41,118,0.18)]">
              <Instagram className="h-7 w-7 stroke-[2.2]" />
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Connect Instagram</p>
            <h2 className="mt-1.5 text-[22px] font-bold tracking-tight text-slate-950 sm:text-[24px]">
              {instagramAccount ? 'Instagram connected' : 'Connect your Instagram'}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] font-medium leading-5 text-slate-500 sm:text-[14px]">
              Start automating your DMs and comments with AI.
            </p>
          </div>

          {instagramAccount ? (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar src={instagramAccount.profile_pic_url} username={instagramAccount.username} showInstagramBadge size="md" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5"><span className="truncate text-sm font-bold text-slate-950">@{instagramAccount.username}</span><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /></div>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">{instagramAccount.followers_count?.toLocaleString() || 0} followers · Connected</p>
                </div>
              </div>
              <button onClick={handleDisconnect} className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Disconnect</button>
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/55 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-indigo-100"><ShieldCheck className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-bold text-slate-900">Secure connection through Meta</h3>
                    <p className="mt-1 text-xs font-medium leading-[18px] text-slate-600 sm:text-[13px]">You’ll continue to Instagram/Meta authorization and choose the account to connect. Your Instagram password is not entered or stored on AutoReply.</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-semibold text-slate-600 sm:text-xs">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Secure OAuth</span>
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Official Meta authorization</span>
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />No password stored</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                {['Sign in','Choose account','Connect'].map((label, i) => (
                  <React.Fragment key={label}>
                    <div className="min-w-0"><span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-violet-50 text-xs font-bold text-violet-700 ring-1 ring-violet-200">{i + 1}</span><span className="mt-1 block truncate text-xs font-semibold text-slate-600 sm:text-xs">{label}</span></div>
                    {i < 2 && <span className="h-px w-4 bg-indigo-200 sm:w-8" aria-hidden="true" />}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}

          {feedback && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="leading-5">{feedback.message}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleOAuthLaunch}
            disabled={isLaunching}
            className="mt-5 flex h-[52px] w-full cursor-pointer items-center justify-between rounded-[13px] bg-gradient-to-r from-[#FEDA75] via-[#FA7E1E] via-25% to-[#4F5BD5] px-4 text-[14px] font-bold text-white shadow-[0_9px_24px_rgba(214,41,118,0.20)] transition duration-200 hover:-translate-y-px hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D62976] focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
            style={{ backgroundImage: 'linear-gradient(100deg, #FEDA75 0%, #FA7E1E 20%, #D62976 48%, #962FBF 72%, #4F5BD5 100%)' }}
          >
            <span className="flex items-center gap-2.5">{isLaunching ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Instagram className="h-5 w-5" />}<span>{isLaunching ? 'Connecting...' : instagramAccount ? 'Reconnect Instagram' : 'Continue with Instagram'}</span></span>
            <ExternalLink className="h-4 w-4 opacity-85" />
          </button>

          <p className="mt-3 text-center text-xs font-medium text-slate-500 sm:text-xs">Business or Creator Instagram account required</p>
        </div>
      </div>
    </div>
  );
};
