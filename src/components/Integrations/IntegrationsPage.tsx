import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Instagram, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth } from '../../lib/supabase';

export const IntegrationsPage: React.FC = () => {
  const { instagramAccount, setIsConnectModalOpen } = useApp();
  const [sheets, setSheets] = useState<{ loading: boolean; connected: boolean; email?: string }>({ loading: true, connected: false });

  const refreshSheets = async () => {
    setSheets((prev) => ({ ...prev, loading: true }));
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in required');
      const response = await fetch('/api/google-sheets/status', { headers: { Authorization: 'Bearer ' + token } });
      const payload = await response.json().catch(() => null);
      setSheets({ loading: false, connected: Boolean(response.ok && payload?.connected), email: payload?.email || '' });
    } catch {
      setSheets({ loading: false, connected: false });
    }
  };

  useEffect(() => { void refreshSheets(); }, []);

  const connectSheets = async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const response = await fetch('/api/google-sheets/connect?format=json', { headers: { Authorization: 'Bearer ' + token } });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.url) window.location.assign(payload.url);
  };

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Connections</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Integrations</h1>
          <p className="mt-1 text-sm text-slate-500">Manage external services connected to your AutoReply workspace.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-50 text-pink-600"><Instagram className="h-5 w-5" /></span>
              <span className={'rounded-full px-2.5 py-1 text-xs font-bold uppercase ' + (instagramAccount ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{instagramAccount ? 'Connected' : 'Not connected'}</span>
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">Instagram / Meta</h2>
            <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{instagramAccount ? '@' + instagramAccount.username + ' powers your live DM automations.' : 'Connect a supported professional Instagram account through Meta OAuth.'}</p>
            <button onClick={() => setIsConnectModalOpen(true)} className="mt-4 min-h-10 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white">{instagramAccount ? 'Manage connection' : 'Connect Instagram'}</button>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><FileSpreadsheet className="h-5 w-5" /></span>
              <span className={'rounded-full px-2.5 py-1 text-xs font-bold uppercase ' + (sheets.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{sheets.loading ? 'Checking' : sheets.connected ? 'Connected' : 'Not connected'}</span>
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">Google Sheets</h2>
            <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{sheets.connected ? 'Connected' + (sheets.email ? ' as ' + sheets.email : '') + '. AI lead fields can be appended to Sheets.' : 'Connect Google Sheets to store structured leads captured by AI automations.'}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={connectSheets} className="min-h-10 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white">{sheets.connected ? 'Reconnect' : 'Connect Sheets'}</button>
              <button onClick={() => void refreshSheets()} className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-indigo-600" />
            <div><h2 className="text-sm font-bold text-slate-900">Connection security</h2><p className="mt-1 text-xs leading-5 text-slate-600">OAuth tokens stay server-side. AutoReply never asks you to type your Instagram password into the product.</p></div>
          </div>
        </section>
      </div>
    </div>
  );
};
