import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { updatePassword } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

export const ResetPasswordPage: React.FC = () => {
  const { firebaseUser, setActiveTab } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      window.history.replaceState({}, '', '/');
    } catch (err: any) {
      setError(err?.message || 'Could not update your password. The recovery link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7FAFF] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><KeyRound className="h-5 w-5" /></span>
        <h1 className="mt-5 text-center text-2xl font-bold text-slate-950">{done ? 'Password updated' : 'Set a new password'}</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">{done ? 'Your account password has been changed successfully.' : 'Choose a new password for your AutoReply account.'}</p>

        {done ? (
          <div className="mt-6">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Recovery complete</div>
            <button onClick={() => setActiveTab('home')} className="mt-4 min-h-11 w-full rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white">Continue to dashboard</button>
          </div>
        ) : firebaseUser ? (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">New password</span><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-indigo-400" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Confirm password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-indigo-400" /></label>
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
            <button disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? 'Updating...' : 'Update password'}</button>
          </form>
        ) : (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>This recovery link is invalid or expired. Request a new password reset email from the sign-in screen.</p></div>
            <button onClick={() => window.location.assign('/')} className="mt-4 min-h-10 w-full rounded-xl bg-slate-950 px-4 text-xs font-bold text-white">Back to sign in</button>
          </div>
        )}
      </section>
    </div>
  );
};
