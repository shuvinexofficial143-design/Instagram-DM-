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
    firebaseUser,
  } = useApp();

  const [isLaunching, setIsLaunching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isConnectModalOpen) return null;

  const handleOAuthLaunch = () => {
    if (!firebaseUser?.uid) {
      setFeedback({
        type: 'error',
        message: 'Please sign in to AutoReply.io before connecting an Instagram account.',
      });
      return;
    }

    setFeedback(null);
    setIsLaunching(true);

    const popupUrl = '/api/auth/instagram';
    const width = 600;
    const height = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    const popup = window.open(
      popupUrl,
      'MetaInstagramOAuth',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.assign(popupUrl);
      return;
    }

    setFeedback({
      type: 'success',
      message: 'Instagram authorization opened. Complete the Meta login and permission screen to connect your account.',
    });
    setTimeout(() => setIsLaunching(false), 1200);
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
    <div className="fixed inset-0 bg-slate-900/75 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => setIsConnectModalOpen(false)}
          aria-label="Close modal"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer border border-slate-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-5 pr-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-rose-500/20 ring-2 ring-rose-500/20">
            <Instagram className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950 tracking-tight">Connect Instagram Account</h2>
            <p className="text-xs font-semibold text-slate-500">
              Secure connection through the official Meta OAuth flow
            </p>
          </div>
        </div>

        {instagramAccount && (
          <div className="mb-5 p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar
                src={instagramAccount.profile_pic_url}
                username={instagramAccount.username}
                showInstagramBadge={true}
                size="md"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-slate-950 truncate">@{instagramAccount.username}</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full border border-emerald-300">
                    Meta verified
                  </span>
                </div>
                <p className="text-[11px] font-bold text-slate-600 truncate">
                  {instagramAccount.followers_count?.toLocaleString() || 0} followers
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer shadow-2xs"
            >
              Disconnect
            </button>
          </div>
        )}

        {feedback && (
          <div
            className={`mb-4 p-3 rounded-xl border text-xs font-bold flex items-start gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{feedback.message}</span>
          </div>
        )}

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-3 mb-5">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-slate-900">Official Meta authorization only</h3>
              <p className="text-xs text-slate-600 font-semibold mt-1 leading-relaxed">
                AutoReply.io will only mark an Instagram account as connected after Meta returns a valid OAuth token and the Instagram Graph API verifies the professional account.
              </p>
            </div>
          </div>
          <ul className="text-[11px] text-slate-600 font-semibold space-y-1.5 pl-7 list-disc">
            <li>No username-only fake connection.</li>
            <li>No access-token field in the browser.</li>
            <li>Business or Creator Instagram account required.</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={handleOAuthLaunch}
          disabled={isLaunching}
          className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-rose-500 hover:from-purple-500 hover:via-pink-500 hover:to-rose-400 text-white font-black py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLaunching ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Opening Meta authorization...</span>
            </>
          ) : (
            <>
              <ExternalLink className="w-4 h-4 stroke-[2.5]" />
              <span>{instagramAccount ? 'Reauthorize with Instagram' : 'Connect with Instagram'}</span>
            </>
          )}
        </button>

        <p className="text-[10px] text-slate-400 font-semibold text-center mt-3 leading-relaxed">
          Your Instagram password is entered only on Meta/Instagram. AutoReply.io never asks for or stores your Instagram password.
        </p>
      </div>
    </div>
  );
};
