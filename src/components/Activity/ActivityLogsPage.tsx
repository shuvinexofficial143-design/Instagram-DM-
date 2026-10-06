import React, { useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock3, Search, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ActivityLogsPage: React.FC = () => {
  const { webhookLogs } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'triggered' | 'success' | 'ignored' | 'error'>('all');

  const logs = useMemo(() => (webhookLogs || []).filter((log) => {
    const haystack = ((log.from_username || '') + ' ' + (log.incoming_text || '') + ' ' + (log.matched_automation_name || '') + ' ' + (log.reason || '') + ' ' + (log.error_message || '')).toLowerCase();
    return (!search.trim() || haystack.includes(search.trim().toLowerCase())) && (status === 'all' || log.status === status);
  }), [webhookLogs, search, status]);

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Automation observability</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Activity Logs</h1>
          <p className="mt-1 text-sm text-slate-500">Inspect automation triggers, replies, failures and processing timing.</p>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username, message or automation" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-indigo-400" />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
            <option value="all">All statuses</option>
            <option value="triggered">Triggered</option>
            <option value="success">Success</option>
            <option value="ignored">Ignored</option>
            <option value="error">Error</option>
          </select>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {logs.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="mx-auto h-9 w-9 text-slate-300" />
              <h2 className="mt-3 text-sm font-bold text-slate-800">No matching activity</h2>
              <p className="mt-1 text-xs text-slate-500">New Instagram events will appear here. Try changing the filters if you expected an earlier event.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => {
                const ok = log.status === 'success' || log.status === 'triggered';
                const Icon = log.status === 'error' ? AlertCircle : ok ? CheckCircle2 : Zap;
                return (
                  <article key={log.id} className="grid gap-3 p-4 hover:bg-slate-50/70 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <span className={'flex h-9 w-9 items-center justify-center rounded-xl ' + (log.status === 'error' ? 'bg-rose-50 text-rose-600' : ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">@{log.from_username || 'instagram_user'}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase text-slate-600">{log.trigger_type}</span>
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-bold uppercase text-slate-500">{log.status}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-600">{log.incoming_text || 'No message text'}</p>
                      {log.reason && <p className="mt-2 text-xs text-amber-700">Reason: {log.reason.replace(/_/g,' ')}</p>}
                      {log.error_message && <p className="mt-2 break-words text-xs text-rose-700">Error: {log.error_message}</p>}
                      {log.response_sent && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-indigo-600">Reply sent</summary><p className="mt-1 whitespace-pre-wrap break-words">{log.response_sent}</p></details>}
                      {log.matched_automation_name && <p className="mt-1 text-xs font-semibold text-indigo-600">{log.matched_automation_name}</p>}
                    </div>
                    <div className="text-left md:text-right">
                      <p className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{new Date(log.timestamp).toLocaleString()}</p>
                      {typeof log.total_processing_duration_ms === 'number' && <p className="mt-1 text-xs font-bold text-slate-600">{Math.round(log.total_processing_duration_ms)} ms</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
