import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth } from '../../lib/supabase';

export function AdminEmailPreferences() {
  const { firebaseUser, isAdmin } = useApp();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isAdmin || !firebaseUser?.uid) return;
    const controller = new AbortController();
    setLoading(true);setError('');setSaved(false);setEnabled(false);
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Sign in again to load email preferences.');
        const response = await fetch('/api/workspace-data?action=mail-preferences', {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(data?.error || 'Unable to load email preferences.');
        if (!controller.signal.aborted) setEnabled(Boolean(data.marketingOptIn));
      } catch (err: any) {
        if (!controller.signal.aborted) setError(err?.message || 'Email preferences are unavailable.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [isAdmin, firebaseUser?.uid]);

  const changePreference = async (checked: boolean) => {
    if (saving || !isAdmin) return;
    setSaving(true);setError('');setSaved(false);
    const owner = firebaseUser?.uid;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in again to update email preferences.');
      const response = await fetch('/api/workspace-data?action=mail-preferences', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketingOptIn: checked }), signal: AbortSignal.timeout(13000),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Could not save email preferences.');
      if (auth.currentUser?.uid === owner) { setEnabled(Boolean(data.marketingOptIn));setSaved(true); }
    } catch (err: any) { if (auth.currentUser?.uid === owner) setError(err?.message || 'Could not save email preferences.'); }
    finally { setSaving(false); }
  };

  if (!isAdmin) return null;
  return <section aria-labelledby="admin-email-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 id="admin-email-heading" className="flex items-center gap-2 text-lg font-bold text-slate-950"><Mail className="h-5 w-5 text-indigo-600"/>Email notifications</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Email preferences for your signed-in administrator account. Welcome emails, invoices and important service emails are separate from optional product tips.</p>
    <label className="mt-5 flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={enabled} disabled={loading || saving || !firebaseUser?.email} onChange={event=>void changePreference(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-indigo-600"/>
      <span><strong className="block text-base font-bold text-slate-900">Send me helpful tips if I haven't visited</strong><span className="mt-1 block text-sm leading-6 text-slate-600">Optional onboarding emails, up to four reminders after approximately 3, 6, 9 and 12 days without visiting. They stop when you return. You can turn them off here or use the Unsubscribe link.</span></span>
    </label>
    {loading && <p role="status" className="mt-3 text-sm text-slate-500">Loading preferences…</p>}
    {saving && <p role="status" className="mt-3 text-sm text-slate-500">Saving…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {saved && <p role="status" className="mt-3 text-sm text-emerald-700">Email preference saved.</p>}
  </section>;
}
