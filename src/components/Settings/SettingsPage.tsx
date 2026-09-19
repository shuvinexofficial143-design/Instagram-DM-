import React, { useState } from 'react';
import {
  Instagram,
  RefreshCw,
  Trash2,
  LogOut,
  Mail,
  ShieldCheck,
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
    <div className="mx-auto min-h-screen max-w-5xl space-y-8 bg-[#F9F6FE] p-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

        <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
          <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
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
          <div className="mt-5 space-y-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
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
    </div>
  );
};
