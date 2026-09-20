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
    setIsConnectModalOpen,
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

      const response = await fetch('/api/auth/instagram', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[460px] overflow-hidden rounded-[28px] border border-blue-100 bg-[#FCFDFF] shadow-[0_24px_70px_rgba(30,64,175,0.16)] animate-in fade-in zoom-in-95 duration-200">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

        <button
          onClick={() => setIsConnectModalOpen(false)}
          aria-label="Close modal"
          className="absolute right-4 top-5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8">
          <div className="mb-6 flex items-center gap-4 pr-11">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-rose-500 text-white shadow-lg shadow-violet-500/15">
              <Instagram className="h-7 w-7 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-indigo-500">Instagram</p>
              <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                {instagramAccount ? 'Instagram connected' : 'Connect your account'}
              </h2>
            </div>
          </div>

          {instagramAccount ? (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar
                  src={instagramAccount.profile_pic_url}
                  username={instagramAccount.username}
                  showInstagramBadge={true}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-950">@{instagramAccount.username}</span>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">
                    {instagramAccount.followers_count?.toLocaleString() || 0} followers · Connected
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="shrink-0 cursor-pointer rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="mb-5 rounded-2xl border border-blue-100 bg-[#F7FAFF] p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-blue-100">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Secure Meta connection</h3>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-slate-600">
                    Sign in through Instagram and approve access. Your password stays with Meta.
                  </p>
                </div>
              </div>
            </div>
          )}

          {feedback && (
            <div className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-[13px] font-semibold ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}>
              {feedback.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="leading-5">{feedback.message}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleOAuthLaunch}
            disabled={isLaunching}
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-5 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLaunching ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Instagram className="h-5 w-5" />
                <span>{instagramAccount ? 'Reconnect Instagram' : 'Continue with Instagram'}</span>
                <ExternalLink className="h-4 w-4 opacity-80" />
              </>
            )}
          </button>

          <div className="mt-4 flex items-center justify-center gap-2 text-center text-xs font-medium text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
            <span>Official Meta authorization · Business or Creator account</span>
          </div>
        </div>
      </div>
    </div>
  );
};
