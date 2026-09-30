import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Bot, CheckCircle2, Copy, GitBranch, GripVertical, Play, Plus, Save, Sparkles, Trash2, WandSparkles, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth } from '../../lib/supabase';
import { Automation, FlowInstructionNode } from '../../types';

const templates: Array<{ type: FlowInstructionNode['type']; title: string; instruction: string }> = [
  { type: 'business', title: 'Business Context', instruction: 'Explain what the business sells or provides, the service area, important prices, availability and facts the AI may use. Never invent facts that are not provided here.' },
  { type: 'qualification', title: 'Qualification', instruction: 'Ask concise questions to understand the customer need, product/service interest, budget or urgency when relevant. Ask one useful question at a time.' },
  { type: 'lead_capture', title: 'Lead Capture', instruction: 'When the customer shows buying intent, collect the minimum useful lead information conversationally. Confirm details before finishing. Never invent missing customer data.' },
  { type: 'sales', title: 'Sales Guidance', instruction: 'Help the customer choose the most relevant option from known products/services. Explain value clearly without pressure or false scarcity.' },
  { type: 'handoff', title: 'Human Handoff', instruction: 'Hand over to a human when the customer explicitly asks for a person, information is unavailable, or the request is sensitive/high-risk. Do not pretend a human has responded.' },
  { type: 'guardrail', title: 'Guardrails', instruction: 'Do not invent prices, stock, policies, guarantees, delivery times or personal details. If unsure, say what is known and ask a short clarifying question.' },
  { type: 'custom', title: 'Custom Instruction', instruction: 'Add your custom instruction here.' },
];

const newNode = (template = templates[templates.length - 1]): FlowInstructionNode => ({
  id: 'node_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
  type: template.type,
  title: template.title,
  instruction: template.instruction,
  enabled: true,
});

const defaultNodes = () => [
  newNode(templates[0]),
  newNode(templates[1]),
  newNode(templates[4]),
  newNode(templates[5]),
];

export const FlowBuilderPage: React.FC = () => {
  const { automations, createAutomation, updateAutomation } = useApp();
  const aiAutomations = automations.filter((item) => item.trigger_type === 'dm_ai_conversation');
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('AI Sales Conversation');
  const [nodes, setNodes] = useState<FlowInstructionNode[]>(defaultNodes);
  const [tone, setTone] = useState('Friendly');
  const [language, setLanguage] = useState('Auto detect');
  const [fallback, setFallback] = useState('Thanks for your message! Our team will get back to you shortly.');
  const [handoff, setHandoff] = useState(true);
  const [testInput, setTestInput] = useState('');
  const [testReply, setTestReply] = useState('');
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState('');

  const editing = aiAutomations.find((item) => item.id === editingId);

  const compilePrompt = useMemo(() => {
    const activeNodes = nodes.filter((node) => node.enabled && node.instruction.trim());
    const blocks = activeNodes.map((node, index) => '# STEP ' + (index + 1) + ': ' + node.title.toUpperCase() + '\n' + node.instruction.trim());
    return [
      '# ROLE',
      'You are the business Instagram DM assistant. Follow the flow below in order while keeping the conversation natural rather than sounding like a form.',
      '',
      ...blocks.flatMap((block) => [block, '']),
      '# RESPONSE SETTINGS',
      'Tone: ' + tone + '.',
      'Language: ' + language + '. Match the customer language when Auto detect is selected.',
      'Human handoff: ' + (handoff ? 'enabled' : 'disabled') + '.',
      'Keep replies concise and suitable for Instagram DMs. Do not expose internal flow steps to customers.',
    ].join('\n').trim();
  }, [nodes, tone, language, handoff]);

  const loadAutomation = (automation?: Automation) => {
    if (!automation) {
      setEditingId('');
      setName('AI Sales Conversation');
      setNodes(defaultNodes());
      setTone('Friendly');
      setLanguage('Auto detect');
      setFallback('Thanks for your message! Our team will get back to you shortly.');
      setHandoff(true);
      return;
    }
    setEditingId(automation.id);
    setName(automation.name);
    const savedNodes = automation.trigger_config.flow_nodes;
    const ai = automation.actions.find((action) => action.type === 'ai_chatbot');
    const fallbackAction = automation.actions.find((action) => action.type === 'send_dm');
    setNodes(Array.isArray(savedNodes) && savedNodes.length
      ? savedNodes
      : [{ id: 'legacy_' + automation.id, type: 'custom', title: 'Existing AI Prompt', instruction: ai?.ai_system_instruction || '', enabled: true }]);
    setTone(automation.trigger_config.flow_settings?.tone || 'Friendly');
    setLanguage(automation.trigger_config.flow_settings?.language || 'Auto detect');
    setHandoff(automation.trigger_config.flow_settings?.handoff ?? true);
    setFallback(fallbackAction?.message_text || 'Thanks for your message! Our team will get back to you shortly.');
  };

  useEffect(() => {
    const requested = sessionStorage.getItem('autoreply:flow-edit-id');
    if (!requested) return;
    const automation = aiAutomations.find((item) => item.id === requested);
    if (automation) loadAutomation(automation);
    sessionStorage.removeItem('autoreply:flow-edit-id');
  }, [automations.length]);

  const updateNode = (id: string, updates: Partial<FlowInstructionNode>) => {
    setNodes((prev) => prev.map((node) => node.id === id ? { ...node, ...updates } : node));
  };

  const moveNode = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return;
    setNodes((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const duplicateNode = (node: FlowInstructionNode) => {
    const copy = { ...node, id: 'node_' + Date.now() + '_copy', title: node.title + ' Copy' };
    const index = nodes.findIndex((item) => item.id === node.id);
    setNodes((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
  };

  const validate = () => {
    if (!name.trim()) return 'Flow name is required.';
    if (!nodes.some((node) => node.enabled && node.instruction.trim())) return 'Add at least one enabled instruction node.';
    if (!fallback.trim()) return 'Fallback message is required.';
    return '';
  };

  const saveFlow = (status: 'active' | 'paused') => {
    const error = validate();
    if (error) { setSaved(error); return; }

    const data = {
      name: name.trim(),
      trigger_type: 'dm_ai_conversation' as const,
      trigger_config: {
        all_or_keywords: 'ai_conversation' as const,
        keywords: [],
        smart_matching: true,
        flow_version: 1 as const,
        flow_nodes: nodes,
        flow_settings: { tone, language, handoff },
      },
      actions: [
        { id: 'ai_' + Date.now(), type: 'ai_chatbot' as const, ai_model: 'gpt-4o-mini', ai_system_instruction: compilePrompt },
        { id: 'fallback_' + Date.now(), type: 'send_dm' as const, message_text: fallback.trim() },
      ],
      status,
    };

    if (editing) updateAutomation(editing.id, data);
    else createAutomation(data);
    setSaved(status === 'active' ? 'Published. This is now the live DM AI flow.' : 'Saved as paused draft.');
    window.setTimeout(() => setSaved(''), 3500);
  };

  const testFlow = async () => {
    if (!testInput.trim() || testing) return;
    const error = validate();
    if (error) { setTestReply(error); return; }
    setTesting(true);
    setTestReply('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        credentials: 'same-origin',
        body: JSON.stringify({
          text: testInput.trim(),
          history: [],
          systemInstruction: compilePrompt,
          personality: tone,
          language,
          assistantName: 'Flow Assistant',
          maxReplyLength: 'short',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.reply) throw new Error(payload?.error || 'Flow test failed');
      setTestReply(payload.reply);
    } catch (error: any) {
      setTestReply(error?.message || 'Flow test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1450px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">Runtime-backed visual editor</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Advanced Automation Flow Builder</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Build one live Instagram DM AI flow from ordered instruction nodes. Publishing compiles the nodes into the same AI automation format the live webhook already executes.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => loadAutomation(undefined)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700">New Flow</button><button onClick={() => saveFlow('paused')} className="flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-bold text-indigo-700"><Save className="h-4 w-4" />Save Draft</button><button onClick={() => saveFlow('active')} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white"><Zap className="h-4 w-4" />Publish Live</button></div>
        </header>

        {saved && <div className={'rounded-xl border px-4 py-3 text-xs font-bold ' + (saved.includes('required') || saved.includes('Add at least') ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>{saved}</div>}

        <section className="grid gap-5 xl:grid-cols-[330px_1fr_360px]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-800">Flow settings</p>
              <label className="mt-3 block"><span className="text-[10px] font-bold text-slate-500">Flow name</span><input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-xs" /></label>
              <label className="mt-3 block"><span className="text-[10px] font-bold text-slate-500">Edit existing flow</span><select value={editingId} onChange={(e) => { const auto = aiAutomations.find((item) => item.id === e.target.value); if (auto) loadAutomation(auto); else loadAutomation(undefined); }} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-2 text-xs"><option value="">New flow</option>{aiAutomations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
              <div className="mt-3 grid grid-cols-2 gap-2"><label><span className="text-[10px] font-bold text-slate-500">Tone</span><select value={tone} onChange={(e) => setTone(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-2 text-xs"><option>Friendly</option><option>Professional</option><option>Sales Expert</option><option>Customer Support</option></select></label><label><span className="text-[10px] font-bold text-slate-500">Language</span><select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-2 text-xs"><option>Auto detect</option><option>English</option><option>Hindi</option><option>Hinglish</option></select></label></div>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} />Human handoff enabled</label>
              <label className="mt-3 block"><span className="text-[10px] font-bold text-slate-500">Fallback message</span><textarea rows={3} value={fallback} onChange={(e) => setFallback(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs" /></label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-800">Add instruction node</p>
              <div className="mt-3 space-y-2">{templates.map((template) => <button key={template.type + template.title} onClick={() => setNodes((prev) => [...prev, newNode(template)])} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-left hover:border-indigo-300"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Plus className="h-3.5 w-3.5" /></span><span><span className="block text-xs font-bold text-slate-800">{template.title}</span><span className="block text-[9px] uppercase tracking-wide text-slate-400">{template.type.replace('_', ' ')}</span></span></button>)}</div>
            </div>
          </aside>

          <main className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-800">Live conversation flow</p><p className="mt-1 text-[11px] text-slate-500">Nodes run as ordered AI instructions. Reorder them to change priority and conversation behavior.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Runtime compatible</span></div>

            <div className="mt-5">
              <div className="mx-auto max-w-2xl rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 text-center"><div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><Bot className="h-4 w-4" /></div><p className="mt-2 text-xs font-black text-slate-900">Instagram DM received</p><p className="mt-1 text-[10px] text-slate-500">Live trigger: DM AI Conversation</p></div>
              <div className="mx-auto h-7 w-px bg-slate-300" />
              <div className="space-y-0">
                {nodes.map((node, index) => (
                  <React.Fragment key={node.id}>
                    <article className={'mx-auto max-w-2xl rounded-2xl border p-4 transition ' + (node.enabled ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50 opacity-60')}>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 text-slate-300"><GripVertical className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-500">Step {index + 1}</span><input value={node.title} onChange={(e) => updateNode(node.id, { title: e.target.value })} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-bold text-slate-900 outline-none" /><label className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><input type="checkbox" checked={node.enabled} onChange={(e) => updateNode(node.id, { enabled: e.target.checked })} />Enabled</label></div>
                          <textarea rows={4} value={node.instruction} onChange={(e) => updateNode(node.id, { instruction: e.target.value })} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-700 outline-none focus:border-indigo-400" />
                          <div className="mt-3 flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-wide text-indigo-500">{node.type.replace('_', ' ')}</span><div className="flex gap-1"><button onClick={() => moveNode(index, -1)} disabled={index === 0} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button onClick={() => moveNode(index, 1)} disabled={index === nodes.length - 1} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button><button onClick={() => duplicateNode(node)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><Copy className="h-3.5 w-3.5" /></button><button onClick={() => setNodes((prev) => prev.filter((item) => item.id !== node.id))} className="rounded-lg border border-rose-200 p-1.5 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
                        </div>
                      </div>
                    </article>
                    {index < nodes.length - 1 && <div className="mx-auto h-7 w-px bg-slate-300" />}
                  </React.Fragment>
                ))}
              </div>
              <div className="mx-auto h-7 w-px bg-slate-300" />
              <div className="mx-auto max-w-2xl rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" /><p className="mt-2 text-xs font-black text-slate-900">Reply through live webhook</p><p className="mt-1 text-[10px] text-slate-500">gpt-4o-mini → Instagram DM → fallback if AI fails</p></div>
            </div>
          </main>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><Play className="h-4 w-4 text-indigo-600" /><p className="text-xs font-bold text-slate-800">Test flow</p></div>
              <textarea rows={3} value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder="Example: Price kya hai aur delivery Tarana me hogi?" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" />
              <button onClick={() => void testFlow()} disabled={testing || !testInput.trim()} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{testing ? 'Running flow…' : 'Run test'}</button>
              {testReply && <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-slate-700">{testReply}</div>}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-indigo-600" /><p className="text-xs font-bold text-slate-800">Compiled live prompt</p></div>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">This is what the live AI runtime receives. Flow nodes remain editable metadata for future revisions.</p>
              <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-slate-200">{compilePrompt}</pre>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2"><WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="text-xs font-bold text-amber-900">No fake branch nodes</p><p className="mt-1 text-[10px] leading-5 text-amber-800">The current live Supabase webhook executes one active DM AI automation. This builder only publishes a structure that backend actually runs. Unsupported multi-branch runtime is not presented as live.</p></div></div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};
