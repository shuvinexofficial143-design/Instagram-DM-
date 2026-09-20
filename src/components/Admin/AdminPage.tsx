import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AdminPage: React.FC = () => {
  const { isAdmin, setActiveTab } = useApp();

  if (!isAdmin) {
    return (
      <div className="min-h-full bg-[#F7FAFF] p-6">
        <div className="mx-auto mt-16 max-w-lg rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Admin access required</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">This area is available only to the authorized owner account.</p>
          <button onClick={() => setActiveTab('home')} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl rounded-3xl border border-indigo-100 bg-white p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-indigo-700">
          <ShieldCheck className="h-4 w-4" /> Owner only
        </div>
        <h1 className="mt-4 text-3xl font-black text-slate-950">Admin Panel is being rebuilt</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
          The previous admin implementation has been removed. This clean placeholder intentionally makes no admin API requests while the new control center is rebuilt from scratch.
        </p>
      </div>
    </div>
  );
};
