import React, { useMemo, useState } from 'react';
import { Activity, Bot, MessageCircle, Send, Users, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Period = 7 | 30 | 90;

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const AnalyticsPage: React.FC = () => {
  const { inboxMessages, contacts, automations } = useApp();
  const [period, setPeriod] = useState<Period>(30);

  const data = useMemo(() => {
    const now = new Date();
    const cutoff = startOfDay(new Date(now.getTime() - (period - 1) * 86400000)).getTime();
    const messages = (inboxMessages || []).filter((m) => new Date(m.timestamp || 0).getTime() >= cutoff);
    const incoming = messages.filter((m) => m.direction === 'in');
    const outgoing = messages.filter((m) => m.direction === 'out');
    const ai = outgoing.filter((m) => m.is_automated);
    const newLeads = (contacts || []).filter((c) => new Date(c.first_interaction_at || 0).getTime() >= cutoff);

    const days = Array.from({ length: period }, (_, index) => {
      const d = startOfDay(new Date(cutoff + index * 86400000));
      const next = d.getTime() + 86400000;
      const inCount = incoming.filter((m) => {
        const ts = new Date(m.timestamp || 0).getTime();
        return ts >= d.getTime() && ts < next;
      }).length;
      const outCount = outgoing.filter((m) => {
        const ts = new Date(m.timestamp || 0).getTime();
        return ts >= d.getTime() && ts < next;
      }).length;
      return { label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), incoming: inCount, outgoing: outCount };
    });

    const maxDaily = Math.max(1, ...days.map((d) => d.incoming + d.outgoing));
    return { incoming, outgoing, ai, newLeads, days, maxDaily };
  }, [inboxMessages, contacts, period]);

  const activeAutomations = (automations || []).filter((a) => a.status === 'active').length;
  const topAutomations = [...(automations || [])]
    .sort((a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0))
    .slice(0, 5);

  const cards = [
    { label: 'Incoming DMs', value: data.incoming.length, icon: MessageCircle },
    { label: 'Replies sent', value: data.outgoing.length, icon: Send },
    { label: 'AI replies', value: data.ai.length, icon: Bot },
    { label: 'New leads', value: data.newLeads.length, icon: Users },
    { label: 'Active automations', value: activeAutomations, icon: Zap },
  ];

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">Workspace insights</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Analytics</h1>
            <p className="mt-1 text-sm text-slate-500">Real message and lead activity from the selected period.</p>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {[7, 30, 90].map((value) => (
              <button
                key={value}
                onClick={() => setPeriod(value as Period)}
                className={'min-h-9 rounded-lg px-3 text-xs font-bold ' + (period === value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50')}
              >
                {value} days
              </button>
            ))}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="h-4.5 w-4.5" /></span>
              <p className="mt-4 text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.55fr_.85fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-indigo-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Message activity</h2>
                <p className="text-xs text-slate-500">Incoming + outgoing messages per day.</p>
              </div>
            </div>
            <div className="mt-6 flex h-52 items-end gap-1 overflow-hidden">
              {data.days.map((day) => {
                const total = day.incoming + day.outgoing;
                const height = Math.max(total ? 8 : 2, Math.round((total / data.maxDaily) * 100));
                return (
                  <div key={day.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end">
                    <div
                      className="w-full max-w-5 rounded-t-md bg-indigo-500/80 transition hover:bg-indigo-600"
                      style={{ height: height + '%' }}
                      title={day.label + ': ' + day.incoming + ' in, ' + day.outgoing + ' out'}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>{data.days[0]?.label}</span><span>{data.days[data.days.length - 1]?.label}</span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Top automations</h2>
            <p className="mt-1 text-xs text-slate-500">All-time run count for your workflows.</p>
            <div className="mt-4 space-y-3">
              {topAutomations.length ? topAutomations.map((auto, index) => (
                <div key={auto.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">{index + 1}. {auto.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{auto.trigger_type.replaceAll('_', ' ')}</p>
                  </div>
                  <span className="shrink-0 text-xs font-black text-indigo-700">{(auto.stats?.runs || 0).toLocaleString()} runs</span>
                </div>
              )) : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No automation activity yet.</p>}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
};
