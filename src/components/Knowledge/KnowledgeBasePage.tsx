import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Save, Sparkles, Building2, HelpCircle, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth, saveUserDocument, subscribeToUserCollection } from '../../lib/supabase';

type KnowledgeDoc = {
  id: string;
  business_name: string;
  business_description: string;
  products_services: string;
  faqs: string;
  policies: string;
  tone: string;
  handoff_rule: string;
  updated_at?: string;
};

const emptyKnowledge: KnowledgeDoc = {
  id: 'primary',
  business_name: '',
  business_description: '',
  products_services: '',
  faqs: '',
  policies: '',
  tone: 'Friendly, concise and helpful',
  handoff_rule: 'Hand off to a human when information is missing, sensitive, or the customer asks for a person.',
};

export const KnowledgeBasePage: React.FC = () => {
  const { setActiveTab, setIsBuilderOpen, workspaceId } = useApp();
  const [value, setValue] = useState<KnowledgeDoc>(emptyKnowledge);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(emptyKnowledge); setSaved(false);
    const uid = workspaceId || auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToUserCollection<KnowledgeDoc>(uid, 'knowledge_base', (rows) => {
      const current = rows.find((row) => row.id === 'primary');
      if (current) setValue({ ...emptyKnowledge, ...current });
    });
  }, [workspaceId]);

  const prompt = useMemo(() => [
    '# BUSINESS IDENTITY',
    value.business_name || 'Business name not provided',
    value.business_description || 'Business description not provided',
    '',
    '# PRODUCTS & SERVICES',
    value.products_services || 'Only discuss products/services explicitly provided by the business.',
    '',
    '# FAQS',
    value.faqs || 'No FAQ content provided.',
    '',
    '# POLICIES',
    value.policies || 'Do not invent delivery, refund, pricing or availability policies.',
    '',
    '# RESPONSE STYLE',
    value.tone,
    '',
    '# HUMAN HANDOFF',
    value.handoff_rule,
    '',
    '# RULES',
    '- Do not invent business facts.',
    '- Ask one concise clarifying question when needed.',
    '- Reply in the language used by the customer unless they request another language.',
  ].join('\n'), [value]);

  const save = async () => {
    const uid = workspaceId || auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    setSaved(false);
    try {
      const next = { ...value, id: 'primary', updated_at: new Date().toISOString() };
      await saveUserDocument(uid, 'knowledge_base', next);
      setValue(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } finally {
      setSaving(false);
    }
  };

  const useInAutomation = () => {
    sessionStorage.setItem('autoreply:prefill-ai-prompt', prompt);
    setActiveTab('automations');
    setIsBuilderOpen(true);
  };

  const field = (label: string, key: keyof KnowledgeDoc, rows = 3, placeholder = '') => (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span>
      <textarea
        rows={rows}
        value={String(value[key] || '')}
        onChange={(e) => setValue((prev) => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">AI knowledge</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Knowledge Base</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Your single source of truth for the business. AI uses these facts to answer correctly; catalogs stay separate for product collections.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving...' : saved ? 'Saved' : 'Save'}</button>
            <button onClick={useInAutomation} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white"><Sparkles className="h-4 w-4" />Use in AI Automation</button>
          </div>
        </header>

        {saved && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Knowledge base saved.</div>}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><Building2 className="h-5 w-5 text-indigo-600"/><p className="mt-3 text-xs font-bold text-slate-900">1. Add business facts</p><p className="mt-1 text-xs leading-5 text-slate-500">Name, description, hours, location and services the AI is allowed to use.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><HelpCircle className="h-5 w-5 text-indigo-600"/><p className="mt-3 text-xs font-bold text-slate-900">2. Add FAQs & policies</p><p className="mt-1 text-xs leading-5 text-slate-500">Give approved answers for delivery, returns, booking, payment and common questions.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><ShieldCheck className="h-5 w-5 text-indigo-600"/><p className="mt-3 text-xs font-bold text-slate-900">3. Use in AI</p><p className="mt-1 text-xs leading-5 text-slate-500">Click “Use in AI Automation”. The builder receives this context and you can still edit it there.</p></div>
        </section>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900"><strong>Knowledge Base vs Catalog:</strong> Keep one Knowledge Base for business-wide facts and policies. Create multiple Catalogs for separate product groups, brands or campaigns.</div>

        <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {field('Business name', 'business_name', 2, 'Example: SCM Pharmacy')}
            {field('Brand tone', 'tone', 2, 'Friendly, concise and helpful')}
          </div>
          {field('Business description', 'business_description', 4, 'What the business does, who it serves, location, hours and important context.')}
          {field('Products & services', 'products_services', 6, 'List products/services, prices, variants and important product facts.')}
          {field('FAQs', 'faqs', 6, 'Common customer questions and approved answers.')}
          {field('Policies', 'policies', 5, 'Delivery, return/refund, booking, payment, availability and other policies.')}
          {field('Human handoff rule', 'handoff_rule', 3, 'When must AI stop and hand over to a human?')}
        </section>

        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
          <div className="flex items-start gap-3"><BookOpen className="mt-0.5 h-5 w-5 text-indigo-600" /><div><h2 className="text-sm font-bold text-slate-900">Generated AI context</h2><p className="mt-1 text-xs leading-5 text-slate-600">The builder receives this structured context when you choose “Use in AI Automation”. Existing automations are not changed automatically.</p></div></div>
        </section>
      </div>
    </div>
  );
};
