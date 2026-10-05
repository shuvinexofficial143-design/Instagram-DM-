import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth, removeUserDocument, saveUserDocument, subscribeToUserCollection } from '../../lib/supabase';

type LeadForm = { id: string; name: string; fields: string[]; required: string[]; sheet_enabled: boolean; updated_at?: string };
const defaults = ['Name', 'Phone', 'Address', 'City', 'Pincode'];

export const LeadFormsPage: React.FC = () => {
  const { setActiveTab, setIsBuilderOpen } = useApp();
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [name, setName] = useState('Customer Address Form');
  const [fields, setFields] = useState<string[]>(defaults);
  const [required, setRequired] = useState<string[]>(['Name', 'Phone', 'Address', 'City', 'Pincode']);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToUserCollection<LeadForm>(uid, 'lead_forms', setForms);
  }, []);

  const create = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !name.trim() || !fields.length) return;
    const form: LeadForm = { id: 'form_' + Date.now(), name: name.trim(), fields, required, sheet_enabled: true, updated_at: new Date().toISOString() };
    await saveUserDocument(uid, 'lead_forms', form);
  };

  const remove = async (form: LeadForm) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !window.confirm('Delete ' + form.name + '?')) return;
    await removeUserDocument(uid, 'lead_forms', form.id);
  };

  const addCustom = () => {
    const value = custom.trim();
    if (!value || fields.some((f) => f.toLowerCase() === value.toLowerCase())) return;
    setFields((prev) => [...prev, value]);
    setCustom('');
  };

  const promptFor = (form: LeadForm) => {
    const requiredText = form.required.length ? form.required.join(', ') : 'none';
    return '# LEAD COLLECTION\nCollect these fields conversationally: ' + form.fields.join(', ') + '.\nRequired fields: ' + requiredText + '.\nAsk one question at a time. Confirm the collected details before finishing. Never invent missing customer data.';
  };

  const useInAi = (form: LeadForm) => {
    sessionStorage.setItem('autoreply:prefill-ai-prompt', promptFor(form));
    sessionStorage.setItem('autoreply:prefill-sheet-fields', JSON.stringify(form.fields));
    setActiveTab('automations');
    setIsBuilderOpen(true);
  };

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Lead capture</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Lead & Address Forms</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Define the customer fields your AI should collect in Instagram DMs, including full address details.</p></header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Create form</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
          <div className="mt-4 flex flex-wrap gap-2">
            {fields.map((field) => {
              const isRequired = required.includes(field);
              return <button key={field} onClick={() => setRequired((prev) => isRequired ? prev.filter((x) => x !== field) : [...prev, field])} className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (isRequired ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500')}>{field}{isRequired ? ' · Required' : ' · Optional'}</button>;
            })}
          </div>
          <div className="mt-4 flex gap-2"><input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="Add custom field" className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm" /><button onClick={addCustom} className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold"><Plus className="h-4 w-4" />Add</button></div>
          <button onClick={create} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white"><Save className="h-4 w-4" />Save form</button>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {forms.length ? forms.map((form) => (
            <article key={form.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ClipboardList className="h-4.5 w-4.5" /></span><button onClick={() => void remove(form)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>
              <h2 className="mt-4 text-base font-bold text-slate-900">{form.name}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{form.fields.join(' · ')}</p>
              <p className="mt-2 text-xs font-semibold text-indigo-600">Required: {form.required.join(', ') || 'None'}</p>
              <button onClick={() => useInAi(form)} className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white"><Sparkles className="h-4 w-4" />Use in AI Automation</button>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 md:col-span-2">No lead forms saved yet.</div>}
        </section>
      </div>
    </div>
  );
};
