import React, { useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Lightbulb,
  Target,
  MessageSquare,
  BookOpen,
  User,
  ArrowRight,
  Zap,
  Bot,
} from 'lucide-react';
import { PromptAnalysisResult } from '../../types';

interface SmartPromptAnalyzerProps {
  currentPrompt: string;
  onApplyStructuredPrompt: (structuredPrompt: string) => void;
  onUpdatePersonality?: (personality: string) => void;
}

const ItemList: React.FC<{
  items: string[];
  dotClass?: string;
}> = ({ items, dotClass = 'bg-indigo-500' }) => (
  <ul className="mt-2 space-y-1.5">
    {(items || []).map((item, idx) => (
      <li key={idx} className="flex items-start gap-2.5 text-[13px] leading-6 text-slate-650">
        <span className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export const SmartPromptAnalyzer: React.FC<SmartPromptAnalyzerProps> = ({
  currentPrompt,
  onApplyStructuredPrompt,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PromptAnalysisResult | null>(null);
  const [provider, setProvider] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [showStructuredPrompt, setShowStructuredPrompt] = useState(false);

  const handleAnalyzePrompt = async () => {
    if (!currentPrompt.trim()) {
      setError('पहले System Prompt में instructions लिखें, फिर Analyze करें.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setApplied(false);

    try {
      const res = await fetch('/api/openai/analyze-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ prompt: currentPrompt }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.analysis) {
        throw new Error(data?.error || `Prompt analysis failed (HTTP ${res.status})`);
      }

      setAnalysisResult(data.analysis);
      setProvider(String(data?.provider || 'gpt-4o-mini'));
      setShowStructuredPrompt(false);
    } catch (err: any) {
      console.error('[PROMPT_ANALYZER_CLIENT_ERROR]', err);
      setError(err?.message || 'Prompt analyze नहीं हो पाया. कृपया दोबारा कोशिश करें.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyPrompt = () => {
    if (!analysisResult?.enhanced_structured_prompt) return;
    onApplyStructuredPrompt(analysisResult.enhanced_structured_prompt);
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  const handleCopyPrompt = async () => {
    if (!analysisResult?.enhanced_structured_prompt) return;
    await navigator.clipboard.writeText(analysisResult.enhanced_structured_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleAnalyzePrompt}
          disabled={isAnalyzing || !currentPrompt.trim()}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-500/15 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Prompt समझ रहा हूँ...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              <span>Analyze & Structure Prompt</span>
            </>
          )}
        </button>

        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-gradient-to-r from-blue-50 to-violet-50 px-3 py-1.5 text-[11px] font-black text-indigo-700 shadow-sm">
          <Zap className="h-3 w-3" />
          GPT-4o mini Prompt Analyzer
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 px-3.5 py-3 text-[13px] font-semibold text-indigo-700 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-violet-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 text-[11px] font-black uppercase tracking-wide text-violet-600"
          >
            Close
          </button>
        </div>
      )}

      {analysisResult && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-blue-50/70 via-white/95 to-violet-50/75 shadow-[0_14px_40px_rgba(73,92,160,0.08)]">
          <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-violet-200/25 blur-3xl" />
          <div className="relative border-b border-indigo-100/70 px-4 py-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md shadow-indigo-500/15">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-base font-black text-transparent">AI ने आपके prompt को ऐसे समझा</h4>
                    <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
                      {analysisResult.quality_score}/100
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-slate-600">
                    {analysisResult.analysis_summary}
                  </p>
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                    Engine: {provider === 'gpt-4o-mini' ? 'GPT-4o mini' : 'Smart fallback analyzer'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyPrompt}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-[12px] font-black text-white shadow-md shadow-indigo-500/15"
              >
                {applied ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                {applied ? 'Applied' : 'Use Structured Prompt'}
              </button>
            </div>
          </div>

          <div className="relative grid gap-3 p-3.5 md:grid-cols-2">
            <section className="rounded-xl border border-blue-100/90 bg-gradient-to-br from-blue-50/95 via-white/85 to-indigo-50/80 p-4 shadow-[0_10px_28px_rgba(78,104,219,0.07)] backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-indigo-600" />
                <h5 className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-[13px] font-black uppercase tracking-wider text-transparent">1. Role & Audience</h5>
              </div>
              <p className="mt-2 text-[14px] font-black text-blue-900">{analysisResult.role_identity.role}</p>
              <p className="mt-1 text-[13px] leading-6 text-slate-600">
                <span className="font-black text-indigo-700">Style:</span> {analysisResult.role_identity.persona}
              </p>
              <p className="text-[13px] leading-6 text-slate-600">
                <span className="font-black text-indigo-700">For:</span> {analysisResult.role_identity.target_audience}
              </p>
            </section>

            <section className="rounded-xl border border-violet-100/90 bg-gradient-to-br from-violet-50/90 via-white/85 to-blue-50/80 p-4 shadow-[0_10px_28px_rgba(124,91,214,0.07)] backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <h5 className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-[13px] font-black uppercase tracking-wider text-transparent">2. Reply Style</h5>
              </div>
              <p className="mt-2 text-[14px] font-black text-violet-900">{analysisResult.behavior_tone.tone}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(analysisResult.behavior_tone.style_guidelines || []).map((item, idx) => (
                  <span key={idx} className="rounded-full border border-indigo-100 bg-gradient-to-r from-blue-50 to-violet-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-slate-600">
                {analysisResult.behavior_tone.reply_length_guideline}
              </p>
            </section>

            <section className="rounded-xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/75 via-white/85 to-blue-50/75 p-4 shadow-[0_10px_28px_rgba(16,185,129,0.06)] backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-600" />
                <h5 className="bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-[13px] font-black uppercase tracking-wider text-transparent">3. What AI Will Do</h5>
              </div>
              <ItemList items={analysisResult.primary_objectives || []} dotClass="bg-emerald-500" />
            </section>

            <section className="rounded-xl border border-violet-100/90 bg-gradient-to-br from-violet-50/80 via-white/85 to-fuchsia-50/65 p-4 shadow-[0_10px_28px_rgba(168,85,247,0.06)] backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-violet-600" />
                <h5 className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-[13px] font-black uppercase tracking-wider text-transparent">4. What AI Must Not Do</h5>
              </div>
              <ItemList items={analysisResult.guardrails_constraints || []} dotClass="bg-rose-500" />
            </section>

            <section className="rounded-xl border border-indigo-100/90 bg-gradient-to-r from-blue-50/80 via-indigo-50/65 to-violet-50/80 p-4 shadow-[0_10px_30px_rgba(78,104,219,0.07)] backdrop-blur-sm md:col-span-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-violet-600" />
                <h5 className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-[13px] font-black uppercase tracking-wider text-transparent">5. Business Knowledge Found</h5>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-indigo-500">Products / Services</p>
                  {(analysisResult.knowledge_context.products_or_services || []).length ? (
                    <ItemList items={analysisResult.knowledge_context.products_or_services} dotClass="bg-violet-500" />
                  ) : (
                    <p className="mt-2 text-[12px] leading-5 text-slate-600">Prompt में specific products/services नहीं मिले.</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">FAQs / Policies</p>
                  {(analysisResult.knowledge_context.faqs_or_policies || []).length ? (
                    <ItemList items={analysisResult.knowledge_context.faqs_or_policies} dotClass="bg-blue-500" />
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500">Delivery, return, pricing या FAQ rules अभी नहीं मिले.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-violet-100 bg-gradient-to-r from-blue-50/75 via-violet-50/85 to-fuchsia-50/65 p-4 shadow-[0_10px_30px_rgba(124,91,214,0.06)] md:col-span-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4.5 w-4.5 text-violet-600" />
                <h5 className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-[13px] font-black uppercase tracking-wider text-transparent">6. Prompt में क्या Improve करें</h5>
              </div>
              <ItemList items={analysisResult.suggestions || []} dotClass="bg-amber-500" />
            </section>
          </div>

          <div className="relative border-t border-indigo-100/70 bg-white/55 px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowStructuredPrompt((prev) => !prev)}
                className="text-[12px] font-black text-indigo-700"
              >
                {showStructuredPrompt ? 'Hide structured prompt' : 'Show full structured prompt'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-1.5 text-[11px] font-black text-indigo-700 shadow-sm"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleApplyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-1.5 text-[11px] font-black text-white"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Apply
                </button>
              </div>
            </div>

            {showStructuredPrompt && (
              <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-indigo-100 bg-gradient-to-br from-blue-50 via-indigo-50/80 to-violet-50 p-4 text-[12px] leading-6 text-slate-700 shadow-inner">
                {analysisResult.enhanced_structured_prompt}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
