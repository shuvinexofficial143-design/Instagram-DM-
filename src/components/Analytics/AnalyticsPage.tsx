import React, { useId, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Period = 7 | 30 | 90 | 'custom';

type DailyPoint = {
  label: string;
  incoming: number;
  outgoing: number;
  ai: number;
  leads: number;
};

const DAY = 86400000;

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const asLocalDate = (value: string) => {
  const parsed = new Date(value + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? startOfDay(new Date()) : startOfDay(parsed);
};

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
};

const percentChange = (current: number, previous: number) => {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const average = (values: number[]) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const formatDuration = (ms: number) => {
  if (!ms) return '—';
  if (ms < 1000) return Math.round(ms) + ' ms';
  return (ms / 1000).toFixed(ms >= 10000 ? 1 : 2) + ' s';
};

const triggerLabel = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const classifyIntent = (text: string) => {
  const value = (text || '').toLowerCase();
  if (/price|cost|rate|₹|rs\.?|rupee|कितना|कीमत/.test(value)) return 'Price';
  if (/order|buy|purchase|book|checkout|लेना|चाहिए|ऑर्डर/.test(value)) return 'Order';
  if (/delivery|shipping|cod|dispatch|courier|deliver|डिलीवरी/.test(value)) return 'Delivery';
  if (/product|detail|available|stock|size|color|photo|catalog|प्रोडक्ट/.test(value)) return 'Product';
  if (/help|issue|problem|refund|return|support|complaint|समस्या/.test(value)) return 'Support';
  return 'Other';
};

const TrendBadge: React.FC<{ value: number; inverse?: boolean }> = ({ value, inverse = false }) => {
  if (!value) return <span className="text-xs font-semibold text-slate-400">No change</span>;
  const positive = value > 0;
  const good = inverse ? !positive : positive;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ' +
        (good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')
      }
    >
      <Icon className="h-3 w-3" />
      {positive ? '+' : ''}{value}%
    </span>
  );
};

export const AnalyticsPage: React.FC = () => {
  const { inboxMessages, contacts, automations, webhookLogs, setActiveTab } = useApp();
  const [period, setPeriod] = useState<Period>(30);
  const [customFrom, setCustomFrom] = useState(() => toDateInput(new Date(Date.now() - 29 * DAY)));
  const [customTo, setCustomTo] = useState(() => toDateInput(new Date()));

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    if (period === 'custom') {
      const rawStart = asLocalDate(customFrom);
      const rawEnd = endOfDay(asLocalDate(customTo));
      const start = rawStart.getTime() <= rawEnd.getTime() ? rawStart : startOfDay(rawEnd);
      const end = rawStart.getTime() <= rawEnd.getTime() ? rawEnd : endOfDay(rawStart);
      const days = Math.max(1, Math.min(365, Math.round((startOfDay(end).getTime() - start.getTime()) / DAY) + 1));
      return { start, end, days };
    }
    const days = period;
    return {
      start: startOfDay(new Date(today.getTime() - (days - 1) * DAY)),
      end: endOfDay(today),
      days,
    };
  }, [period, customFrom, customTo]);

  const analytics = useMemo(() => {
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();
    const previousEnd = startMs - 1;
    const previousStart = previousEnd - range.days * DAY + 1;

    const messageTime = (item: { timestamp?: string }) => new Date(item.timestamp || 0).getTime();
    const contactTime = (item: { first_interaction_at?: string }) => new Date(item.first_interaction_at || 0).getTime();
    const logTime = (item: { timestamp?: string }) => new Date(item.timestamp || 0).getTime();

    const selectedMessages = (inboxMessages || []).filter((item) => {
      const ts = messageTime(item);
      return ts >= startMs && ts <= endMs;
    });
    const previousMessages = (inboxMessages || []).filter((item) => {
      const ts = messageTime(item);
      return ts >= previousStart && ts <= previousEnd;
    });

    const selectedContacts = (contacts || []).filter((item) => {
      const ts = contactTime(item);
      return ts >= startMs && ts <= endMs;
    });
    const previousContacts = (contacts || []).filter((item) => {
      const ts = contactTime(item);
      return ts >= previousStart && ts <= previousEnd;
    });

    const selectedLogs = (webhookLogs || []).filter((item) => {
      const ts = logTime(item);
      return ts >= startMs && ts <= endMs;
    });
    const previousLogs = (webhookLogs || []).filter((item) => {
      const ts = logTime(item);
      return ts >= previousStart && ts <= previousEnd;
    });

    const splitMessages = (items: typeof selectedMessages) => {
      const incoming = items.filter((item) => item.direction === 'in');
      const outgoing = items.filter((item) => item.direction === 'out');
      const ai = outgoing.filter((item) => item.is_automated);
      const manual = outgoing.filter((item) => !item.is_automated);
      const failed = outgoing.filter((item) => item.delivery_status === 'failed');
      return { incoming, outgoing, ai, manual, failed };
    };

    const current = splitMessages(selectedMessages);
    const previous = splitMessages(previousMessages);

    const timingValues = selectedLogs
      .map((log) => Number(log.total_processing_duration_ms || log.timing_breakdown?.total_pipeline_duration_ms || 0))
      .filter((value) => value > 0);
    const previousTimingValues = previousLogs
      .map((log) => Number(log.total_processing_duration_ms || log.timing_breakdown?.total_pipeline_duration_ms || 0))
      .filter((value) => value > 0);

    const avgResponseMs = average(timingValues);
    const previousAvgResponseMs = average(previousTimingValues);

    const converted = selectedContacts.filter((contact) => contact.status === 'converted').length;
    const previousConverted = previousContacts.filter((contact) => contact.status === 'converted').length;
    const contacted = selectedContacts.filter((contact) => contact.status === 'contacted' || contact.status === 'converted').length;
    const conversionRate = selectedContacts.length ? Math.round((converted / selectedContacts.length) * 1000) / 10 : 0;
    const previousConversionRate = previousContacts.length ? Math.round((previousConverted / previousContacts.length) * 1000) / 10 : 0;

    const daily: DailyPoint[] = Array.from({ length: range.days }, (_, index) => {
      const dayStart = startOfDay(new Date(startMs + index * DAY));
      const dayEnd = dayStart.getTime() + DAY;
      const incoming = current.incoming.filter((item) => {
        const ts = messageTime(item);
        return ts >= dayStart.getTime() && ts < dayEnd;
      }).length;
      const outgoing = current.outgoing.filter((item) => {
        const ts = messageTime(item);
        return ts >= dayStart.getTime() && ts < dayEnd;
      }).length;
      const ai = current.ai.filter((item) => {
        const ts = messageTime(item);
        return ts >= dayStart.getTime() && ts < dayEnd;
      }).length;
      const leads = selectedContacts.filter((item) => {
        const ts = contactTime(item);
        return ts >= dayStart.getTime() && ts < dayEnd;
      }).length;
      return {
        label: dayStart.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        incoming,
        outgoing,
        ai,
        leads,
      };
    });

    const intentCounts = current.incoming.reduce<Record<string, number>>((acc, message) => {
      const key = classifyIntent(message.message_text || '');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const intents = ['Price', 'Order', 'Delivery', 'Product', 'Support', 'Other']
      .map((label) => ({ label, value: intentCounts[label] || 0 }))
      .sort((a, b) => b.value - a.value);

    const sources = [
      { label: 'Direct messages', value: selectedContacts.reduce((sum, item) => sum + Number(item.interactions?.dms || 0), 0) },
      { label: 'Comments', value: selectedContacts.reduce((sum, item) => sum + Number(item.interactions?.comments || 0), 0) },
      { label: 'Story replies', value: selectedContacts.reduce((sum, item) => sum + Number(item.interactions?.stories || 0), 0) },
    ];

    const heatmap = Array.from({ length: 7 }, (_, dayIndex) =>
      Array.from({ length: 4 }, (_, blockIndex) =>
        current.incoming.filter((message) => {
          const date = new Date(message.timestamp || 0);
          const mondayIndex = (date.getDay() + 6) % 7;
          const hour = date.getHours();
          const block = hour < 6 ? 3 : hour < 12 ? 0 : hour < 18 ? 1 : 2;
          return mondayIndex === dayIndex && block === blockIndex;
        }).length
      )
    );

    const uniqueIncoming = new Set(current.incoming.map((item) => item.from_username || item.from_ig_id).filter(Boolean)).size;
    const uniqueAi = new Set(current.ai.map((item) => item.from_username || item.from_ig_id).filter(Boolean)).size;

    const recent = [
      ...selectedMessages.map((item) => ({
        id: 'message-' + item.id,
        timestamp: item.timestamp,
        title: item.direction === 'in'
          ? 'DM received from @' + (item.from_username || 'Instagram user')
          : (item.is_automated ? 'AI reply sent' : 'Manual reply sent') + ' · @' + (item.from_username || 'Instagram user'),
        detail: (item.message_text || '').trim().slice(0, 90) || 'Message activity',
        kind: item.direction === 'in' ? 'incoming' : item.is_automated ? 'ai' : 'outgoing',
      })),
      ...selectedContacts.map((item) => ({
        id: 'contact-' + item.id,
        timestamp: item.first_interaction_at,
        title: 'New lead · @' + (item.ig_username || 'Instagram user'),
        detail: item.status === 'converted' ? 'Converted lead' : item.status === 'contacted' ? 'Lead contacted' : 'Lead captured',
        kind: 'lead',
      })),
    ]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 8);

    return {
      current,
      previous,
      selectedContacts,
      previousContacts,
      selectedLogs,
      daily,
      avgResponseMs,
      previousAvgResponseMs,
      converted,
      contacted,
      conversionRate,
      previousConversionRate,
      intents,
      sources,
      heatmap,
      uniqueIncoming,
      uniqueAi,
      recent,
    };
  }, [inboxMessages, contacts, webhookLogs, range]);

  const activeAutomations = (automations || []).filter((automation) => automation.status === 'active').length;
  const topAutomations = [...(automations || [])]
    .sort((a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0))
    .slice(0, 6);

  const incomingTrend = percentChange(analytics.current.incoming.length, analytics.previous.incoming.length);
  const repliesTrend = percentChange(analytics.current.outgoing.length, analytics.previous.outgoing.length);
  const aiTrend = percentChange(analytics.current.ai.length, analytics.previous.ai.length);
  const leadsTrend = percentChange(analytics.selectedContacts.length, analytics.previousContacts.length);
  const conversionTrend = Math.round(analytics.conversionRate - analytics.previousConversionRate);
  const responseTrend = analytics.previousAvgResponseMs
    ? Math.round(((analytics.avgResponseMs - analytics.previousAvgResponseMs) / analytics.previousAvgResponseMs) * 100)
    : 0;

  const aiHandleRate = analytics.current.outgoing.length
    ? Math.round((analytics.current.ai.length / analytics.current.outgoing.length) * 100)
    : 0;
  const aiPerformanceHue = Math.round(Math.max(0, Math.min(100, aiHandleRate)) * 1.35);
  const aiPerformanceColor = `hsl(${aiPerformanceHue} 78% 46%)`;
  const aiPerformanceSoft = `hsl(${aiPerformanceHue} 85% 95%)`;
  const topIntent = analytics.intents.find((item) => item.value > 0);
  const maxIntent = Math.max(1, ...analytics.intents.map((item) => item.value));
  const maxSource = Math.max(1, ...analytics.sources.map((item) => item.value));
  const maxHeat = Math.max(1, ...analytics.heatmap.flat());

  const cards = [
    {
      label: 'Incoming DMs',
      value: analytics.current.incoming.length.toLocaleString(),
      icon: MessageCircle,
      trend: incomingTrend,
      note: 'vs previous period',
    },
    {
      label: 'Replies sent',
      value: analytics.current.outgoing.length.toLocaleString(),
      icon: Send,
      trend: repliesTrend,
      note: 'AI + manual replies',
    },
    {
      label: 'AI replies',
      value: analytics.current.ai.length.toLocaleString(),
      icon: Bot,
      trend: aiTrend,
      note: aiHandleRate + '% of replies',
    },
    {
      label: 'New leads',
      value: analytics.selectedContacts.length.toLocaleString(),
      icon: Users,
      trend: leadsTrend,
      note: analytics.converted + ' converted',
    },
    {
      label: 'Conversion rate',
      value: analytics.conversionRate.toFixed(analytics.conversionRate % 1 ? 1 : 0) + '%',
      icon: Target,
      trend: conversionTrend,
      note: 'lead → converted',
    },
    {
      label: 'Avg response time',
      value: formatDuration(analytics.avgResponseMs),
      icon: Clock3,
      trend: responseTrend,
      inverse: true,
      note: analytics.selectedLogs.length ? analytics.selectedLogs.length + ' webhook events' : 'Timing data not available',
    },
  ];

  const exportCsv = () => {
    const rows = [
      ['Auto Replies analytics'],
      ['Period', range.start.toLocaleDateString(), range.end.toLocaleDateString()],
      [],
      ['Metric', 'Value'],
      ['Incoming DMs', analytics.current.incoming.length],
      ['Replies sent', analytics.current.outgoing.length],
      ['AI replies', analytics.current.ai.length],
      ['New leads', analytics.selectedContacts.length],
      ['Converted leads', analytics.converted],
      ['Conversion rate', analytics.conversionRate + '%'],
      ['Average response time', formatDuration(analytics.avgResponseMs)],
      ['Active automations', activeAutomations],
      [],
      ['Date', 'Incoming DMs', 'Replies sent', 'AI replies', 'New leads'],
      ...analytics.daily.map((day) => [day.label, day.incoming, day.outgoing, day.ai, day.leads]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => '"' + String(cell ?? '').replaceAll('"', '""') + '"').join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'autoreplies-analytics-' + toDateInput(range.start) + '-to-' + toDateInput(range.end) + '.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const funnel = [
    { label: 'DM conversations', value: analytics.uniqueIncoming, note: 'Unique people who messaged' },
    { label: 'AI handled', value: analytics.uniqueAi, note: 'Unique conversations with an AI reply' },
    { label: 'New leads', value: analytics.selectedContacts.length, note: 'Contacts captured in this period' },
    { label: 'Contacted', value: analytics.contacted, note: 'Lead follow-up started' },
    { label: 'Converted', value: analytics.converted, note: 'Marked as converted' },
  ];
  const funnelMax = Math.max(1, ...funnel.map((stage) => stage.value));

  const dateLabel =
    range.start.toLocaleDateString([], { month: 'short', day: 'numeric', year: range.start.getFullYear() !== range.end.getFullYear() ? 'numeric' : undefined }) +
    ' – ' +
    range.end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  const insight = analytics.current.incoming.length
    ? (incomingTrend >= 0 ? 'DM volume is up ' + incomingTrend + '% versus the previous period. ' : 'DM volume is down ' + Math.abs(incomingTrend) + '% versus the previous period. ') +
      'AI handled ' + aiHandleRate + '% of sent replies' +
      (topIntent ? ', and ' + topIntent.label.toLowerCase() + ' questions are the most common customer intent.' : '.')
    : 'Once Instagram conversations start coming in, this page will show message trends, AI performance, lead conversion and the busiest customer times.';

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] space-y-5 sm:space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-700">Workspace insights</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Analytics</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live data
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Instagram DM, AI reply, automation and lead performance · {dateLabel}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div className="flex w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-auto">
                {[7, 30, 90].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriod(value as Period)}
                    className={
                      'min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition ' +
                      (period === value ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white')
                    }
                  >
                    {value} days
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPeriod('custom')}
                  className={
                    'min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition ' +
                    (period === 'custom' ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white')
                  }
                >
                  Custom
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:flex-none">
                  <Download className="h-4 w-4" /> Export CSV
                </button>
                <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50" aria-label="Refresh analytics">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {period === 'custom' && (
            <div className="mt-4 grid gap-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3 sm:grid-cols-2 lg:max-w-xl">
              <label className="text-xs font-bold text-slate-600">
                From
                <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="min-h-10 w-full bg-transparent text-sm text-slate-800 outline-none" />
                </span>
              </label>
              <label className="text-xs font-bold text-slate-600">
                To
                <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="min-h-10 w-full bg-transparent text-sm text-slate-800 outline-none" />
                </span>
              </label>
            </div>
          )}
        </header>

        <section className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-white p-4 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-700 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-violet-700">AI insight</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-800 sm:text-[15px]">{insight}</p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {cards.map(({ label, value, icon: Icon, trend, inverse, note }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon className="h-5 w-5" /></span>
                <TrendBadge value={trend} inverse={inverse} />
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-1 text-[26px] font-bold tracking-tight text-slate-950">{value}</p>
              <p className="mt-1 text-xs text-slate-400">{note}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
          <MessageActivityChart days={analytics.daily} />

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Lead funnel</h2>
                <p className="mt-1 text-xs text-slate-500">From conversation to conversion.</p>
              </div>
              <span className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-bold text-orange-700">{analytics.converted} converted</span>
            </div>
            <div className="mt-5 space-y-3">
              {funnel.map((stage, index) => (
                <div key={stage.label}>
                  <div className="mb-1.5 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{stage.label}</p>
                      <p className="text-[11px] text-slate-400">{stage.note}</p>
                    </div>
                    <span className="text-sm font-bold text-slate-950">{stage.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300"
                      style={{ width: Math.max(stage.value ? 6 : 0, Math.min(100, (stage.value / funnelMax) * 100)) + '%' }}
                    />
                  </div>
                  {index < funnel.length - 1 && <div className="mx-auto mt-2 h-2 w-px bg-slate-200" />}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Automation performance</h2>
                <p className="mt-1 text-xs text-slate-500">Which Instagram workflows are driving activity.</p>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><Zap className="h-3.5 w-3.5" /> {activeAutomations} active</span>
            </div>

            {topAutomations.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Automation</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Runs</th>
                      <th className="px-4 py-3 text-right">DMs sent</th>
                      <th className="px-4 py-3 text-right">Unique users</th>
                      <th className="px-5 py-3 text-right">Open rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topAutomations.map((automation) => (
                      <tr key={automation.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <p className="max-w-[260px] truncate text-sm font-bold text-slate-800">{automation.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{triggerLabel(automation.trigger_type)}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold ' + (automation.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                            <span className={'h-1.5 w-1.5 rounded-full ' + (automation.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                            {automation.status === 'active' ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-semibold text-slate-700">{(automation.stats?.runs || 0).toLocaleString()}</td>
                        <td className="px-4 py-4 text-right text-sm font-semibold text-slate-700">{(automation.stats?.dms_sent || 0).toLocaleString()}</td>
                        <td className="px-4 py-4 text-right text-sm font-semibold text-slate-700">{(automation.stats?.unique_users || 0).toLocaleString()}</td>
                        <td className="px-5 py-4 text-right text-sm font-bold text-violet-800">{Number(automation.stats?.open_rate || 0).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                <Zap className="h-9 w-9 text-violet-300" />
                <h3 className="mt-3 text-sm font-bold text-slate-800">No automation activity yet</h3>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Create and activate an Instagram automation to start tracking runs, replies and audience reach.</p>
                <button type="button" onClick={() => setActiveTab('automations')} className="mt-4 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-800">Open automations</button>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">AI performance</h2>
            <p className="mt-1 text-xs text-slate-500">How much of the conversation workload AI is handling.</p>
            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-slate-100 p-4" style={{ backgroundColor: aiPerformanceSoft }}>
              <div
                className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full shadow-sm"
                style={{ background: `conic-gradient(${aiPerformanceColor} ${aiHandleRate}%, #e5e7eb ${aiHandleRate}% 100%)` }}
                title={`AI handled ${aiHandleRate}% of replies`}
              >
                <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-center shadow-inner">
                  <span className="text-lg font-bold" style={{ color: aiPerformanceColor }}>{aiHandleRate}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">AI-handled replies</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{analytics.current.ai.length.toLocaleString()} automated replies of {analytics.current.outgoing.length.toLocaleString()} total replies.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-500">Manual replies</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{analytics.current.manual.length.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-500">Failed sends</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{analytics.current.failed.length.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-500">Avg response</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{formatDuration(analytics.avgResponseMs)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-500">Automation active</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{activeAutomations}</p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">Customer intent</h2>
            <p className="mt-1 text-xs text-slate-500">What people are asking about in incoming DMs.</p>
            <div className="mt-5 space-y-3">
              {analytics.intents.map((intent) => (
                <div key={intent.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">{intent.label}</span>
                    <span className="font-bold text-slate-800">{intent.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300" style={{ width: (intent.value / maxIntent) * 100 + '%' }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">Lead source mix</h2>
            <p className="mt-1 text-xs text-slate-500">Interaction channels used by leads in this period.</p>
            <div className="mt-5 space-y-4">
              {analytics.sources.map((source) => (
                <div key={source.label}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-600">{source.label}</span>
                    <span className="text-sm font-bold text-slate-900">{source.value.toLocaleString()}</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-300 to-amber-300" style={{ width: (source.value / maxSource) * 100 + '%' }} />
                  </div>
                </div>
              ))}
              {!analytics.sources.some((source) => source.value) && <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Lead source activity will appear after contacts interact through DMs, comments or stories.</p>}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2 xl:col-span-1">
            <h2 className="text-base font-bold text-slate-900">Peak DM times</h2>
            <p className="mt-1 text-xs text-slate-500">When incoming conversations are most active.</p>
            <div className="mt-4 grid grid-cols-[42px_repeat(4,minmax(0,1fr))] gap-1.5 text-center text-[10px]">
              <span />
              {['6–12', '12–18', '18–24', '0–6'].map((label) => <span key={label} className="font-semibold text-slate-400">{label}</span>)}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].flatMap((day, dayIndex) => [
                <span key={day} className="flex items-center justify-start font-semibold text-slate-500">{day}</span>,
                ...analytics.heatmap[dayIndex].map((value, blockIndex) => {
                  const strength = value ? 0.16 + (value / maxHeat) * 0.74 : 0.05;
                  return (
                    <span
                      key={day + blockIndex}
                      title={day + ' · ' + ['6 AM–12 PM', '12–6 PM', '6 PM–12 AM', '12–6 AM'][blockIndex] + ': ' + value + ' DMs'}
                      className="grid h-9 place-items-center rounded-lg border border-indigo-50 text-[10px] font-bold"
                      style={{ backgroundColor: 'rgba(79,70,229,' + strength + ')', color: strength > 0.48 ? '#ffffff' : '#64748b' }}
                    >
                      {value || ''}
                    </span>
                  );
                }),
              ])}
            </div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-violet-700" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Lead health</h2>
                <p className="text-xs text-slate-500">Current selected-period lead status.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-500">New</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{Math.max(0, analytics.selectedContacts.length - analytics.contacted).toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-[11px] font-semibold text-amber-700">Contacted</p>
                <p className="mt-1 text-xl font-bold text-amber-900">{Math.max(0, analytics.contacted - analytics.converted).toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[11px] font-semibold text-emerald-700">Converted</p>
                <p className="mt-1 text-xl font-bold text-emerald-900">{analytics.converted.toLocaleString()}</p>
              </div>
            </div>
            <button type="button" onClick={() => setActiveTab('crm')} className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Open sales pipeline</button>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Recent activity</h2>
                <p className="mt-1 text-xs text-slate-500">Latest conversation and lead events in this period.</p>
              </div>
              <button type="button" onClick={() => setActiveTab('activity')} className="text-xs font-bold text-violet-700 hover:text-violet-800">View activity</button>
            </div>

            <div className="mt-4 divide-y divide-slate-100">
              {analytics.recent.length ? analytics.recent.map((item) => {
                const icon =
                  item.kind === 'lead' ? <Users className="h-4 w-4" /> :
                  item.kind === 'ai' ? <Bot className="h-4 w-4" /> :
                  item.kind === 'incoming' ? <MessageCircle className="h-4 w-4" /> :
                  <Send className="h-4 w-4" />;
                return (
                  <div key={item.id} className="flex gap-3 py-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <p className="truncate text-xs font-bold text-slate-800">{item.title}</p>
                        <time className="shrink-0 text-[11px] text-slate-400">{new Date(item.timestamp || 0).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{item.detail}</p>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <AlertCircle className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-700">No recent activity</p>
                  <p className="mt-1 text-xs text-slate-500">Events will appear here when Instagram messages or leads are recorded.</p>
                </div>
              )}
            </div>
          </article>
        </section>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-slate-800">Analytics uses your workspace data only</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Message, lead and automation metrics update from the data already recorded by Auto Replies. No demo numbers are added to this page.</p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-400">Selected: {dateLabel}</span>
        </div>
      </div>
    </div>
  );
};


// Independent daily chart. Curves interpolate actual counts without averaging or overshoot.
const MessageActivityChart = ({ days }: { days: DailyPoint[] }) => {
  const id = useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null);
  const width = 800, height = 320, top = 12, bottom = 308;
  const peak = Math.max(0, ...days.flatMap(day => [day.incoming, day.outgoing]));
  const targetStep = Math.max(1, peak * 1.1 / 4);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const normalized = targetStep / magnitude;
  const step = Math.ceil((normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude);
  const maximum = step * 4;
  const ticks = [maximum, step * 3, step * 2, step, 0];
  const indexes = Array.from(new Set(Array.from({length: Math.min(6, days.length)}, (_, i) => Math.round(i * (days.length - 1) / Math.max(1, Math.min(6, days.length) - 1)))));
  const x = (i: number) => days.length > 1 ? 4 + i / (days.length - 1) * (width - 8) : width / 2;
  const y = (count: number) => bottom - count / maximum * (bottom - top);
  const curve = (field: 'incoming' | 'outgoing') => {
    if (!days.length) return '';
    let path = `M ${x(0)} ${y(days[0][field])}`;
    for (let i = 1; i < days.length; i++) {
      const mid = (x(i - 1) + x(i)) / 2;
      path += ` C ${mid} ${y(days[i - 1][field])} ${mid} ${y(days[i][field])} ${x(i)} ${y(days[i][field])}`;
    }
    return path;
  };
  const incoming = curve('incoming'), replies = curve('outgoing');
  const area = (path: string) => path ? `${path} L ${x(days.length - 1)} ${bottom} L ${x(0)} ${bottom} Z` : '';
  const equal = days.length > 0 && days.every(day => day.incoming === day.outgoing);
  const selected = active === null ? null : days[active];
  const selectPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setActive(Math.max(0, Math.min(days.length - 1, Math.round((event.clientX - bounds.left) / bounds.width * (days.length - 1)))));
  };
  return <article className="min-w-0 rounded-[26px] border border-slate-100 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,.05)] sm:p-8" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-emerald-50 text-[#10C981]"><Activity className="h-8 w-8" strokeWidth={2.5}/></span>
        <div><h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Message activity</h2><p className="mt-1 text-sm leading-6 text-slate-500 sm:text-base">Incoming DMs compared with replies sent.</p></div>
      </div>
      <div className="flex items-center gap-6 text-sm font-medium text-slate-500 sm:text-base" aria-label="Chart legend">
        <span className="inline-flex items-center gap-2.5"><i className="h-3.5 w-3.5 rounded-full bg-[#12B6B8]"/>Incoming</span>
        <span className="inline-flex items-center gap-2.5"><i className="h-3.5 w-3.5 rounded-full bg-[#10C981]"/>Replies</span>
      </div>
    </div>
    <div className="mt-8 grid min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-3 sm:mt-10 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-4">
      <div className="relative h-[260px] text-right text-sm font-medium text-slate-500 sm:h-[320px]">{ticks.map((tick,i)=><span key={tick} className="absolute right-0 -translate-y-1/2" style={{top:`${(top + i * (bottom - top) / 4) / height * 100}%`}}>{tick}</span>)}</div>
      <div className="min-w-0">
        <div className="relative h-[260px] sm:h-[320px]">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Daily incoming Instagram DMs and replies" tabIndex={days.length?0:undefined} onPointerMove={days.length?selectPoint:undefined} onPointerDown={days.length?selectPoint:undefined} onPointerLeave={()=>setActive(null)} onBlur={()=>setActive(null)} onKeyDown={event=>{if(!days.length)return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();setActive(current=>Math.max(0,Math.min(days.length-1,(current??0)+(event.key==='ArrowRight'?1:-1))));}if(event.key==='Escape')setActive(null);}}>
            <title>Message activity</title><desc>Actual daily counts. Teal represents incoming DMs and green represents replies. Use left and right arrow keys to inspect dates.</desc>
            <defs>
              <linearGradient id={`${id}-incoming`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#12B6B8" stopOpacity=".24"/><stop offset="100%" stopColor="#12B6B8" stopOpacity=".025"/></linearGradient>
              <linearGradient id={`${id}-replies`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10C981" stopOpacity=".20"/><stop offset="100%" stopColor="#10C981" stopOpacity=".025"/></linearGradient>
            </defs>
            {ticks.map((tick)=><line key={tick} x1="4" x2={width-4} y1={y(tick)} y2={y(tick)} stroke="#e7ebef" strokeDasharray="4 5" vectorEffect="non-scaling-stroke"/>)}
            {indexes.map(i=><line key={i} x1={x(i)} x2={x(i)} y1={top} y2={bottom} stroke="#e7ebef" strokeDasharray="4 5" vectorEffect="non-scaling-stroke"/>)}
            <path d={area(incoming)} fill={`url(#${id}-incoming)`}/><path d={area(replies)} fill={`url(#${id}-replies)`}/>
            <path d={incoming} fill="none" stroke="#12B6B8" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
            <path d={replies} fill="none" stroke="#10C981" strokeWidth="3" strokeDasharray={equal?'7 7':undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
            {days.length===1&&<><ellipse cx={x(0)} cy={y(days[0].incoming)} rx="4" ry="4" fill="#12B6B8"/><ellipse cx={x(0)} cy={y(days[0].outgoing)} rx="3" ry="3" fill="#10C981"/></>}
            {selected&&active!==null&&<><line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#94a3b8" strokeDasharray="3 4" vectorEffect="non-scaling-stroke"/><ellipse cx={x(active)} cy={y(selected.incoming)} rx="5" ry="4" fill="#12B6B8" stroke="white" vectorEffect="non-scaling-stroke"/><ellipse cx={x(active)} cy={y(selected.outgoing)} rx="4" ry="3" fill="#10C981" stroke="white" vectorEffect="non-scaling-stroke"/></>}
          </svg>
          {selected&&active!==null&&<div role="status" className="pointer-events-none absolute top-2 z-10 max-w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-lg" style={{left:`${Math.min(74, Math.max(0, x(active)/width*100))}%`,transform:active>days.length/2?'translateX(-100%)':undefined}}><p className="mb-1 font-bold text-slate-800">{selected.label}</p><p className="text-[#0e9295]">Incoming: {selected.incoming}</p><p className="text-emerald-600">Replies: {selected.outgoing}</p></div>}
          {peak===0&&<p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center text-sm text-slate-500">No message activity in this period.</p>}
        </div>
        <div className="relative mt-3 h-6 text-xs font-medium text-slate-500 sm:text-sm">{indexes.map((index,i)=><span key={index} className="absolute whitespace-nowrap" style={{left:`${x(index)/width*100}%`,transform:i===0?'none':i===indexes.length-1?'translateX(-100%)':'translateX(-50%)'}}>{days[index].label}</span>)}</div>
      </div>
    </div>
  </article>;
};
