import React from 'react';
import { Instagram, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GoogleSheetsSetup } from '../Automations/GoogleSheetsSetup';
import { CustomerDataCard } from '../CustomerData/CustomerDataCard';

export const IntegrationsPage: React.FC = () => {
  const { instagramAccount, setActiveTab } = useApp();
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
            <button onClick={() => setActiveTab('settings')} className="mt-4 min-h-10 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white">{instagramAccount ? 'Manage connection' : 'Connect Instagram'}</button>
          </article>

          <CustomerDataCard/>
          <GoogleSheetsSetup/>
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
