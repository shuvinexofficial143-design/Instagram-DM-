import React, { useState } from 'react';
import {
  Zap,
  Search,
  Filter,
  Plus,
  ToggleLeft,
  ToggleRight,
  MoreVertical,
  Play,
  Edit2,
  Copy,
  Trash2,
  CheckCircle2,
  Sparkles,
  MessageCircle,
  Eye,
  Send,
  Users,
  Layers,
  ArrowUpDown,
  X,
  ArrowRight,
  Clock,
  Wand2,
  Instagram,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Automation, TriggerType } from '../../types';

export const AutomationsPage: React.FC = () => {
  const {
    automations,
    toggleAutomationStatus,
    deleteAutomation,
    createAutomation,
    setEditingAutomation,
    setIsBuilderOpen,
  } = useApp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | TriggerType>('all');
  const [sortBy, setSortBy] = useState<'runs' | 'newest' | 'name'>('runs');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<'all' | 'comment' | 'dm' | 'story_reply' | 'custom'>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Filter & Sort Automations
  const filteredAutomations = (automations || [])
    .filter((auto) => {
      if (!auto) return false;
      const name = auto.name || '';
      const keywords = Array.isArray(auto.trigger_config?.keywords) ? auto.trigger_config.keywords : [];
      const matchesSearch = name.toLowerCase().includes(search.toLowerCase()) ||
        keywords.some((k) => (k || '').toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || auto.status === statusFilter;
      const matchesTrigger = triggerFilter === 'all' || auto.trigger_type === triggerFilter;
      return matchesSearch && matchesStatus && matchesTrigger;
    })
    .sort((a, b) => {
      if (sortBy === 'runs') return (b?.stats?.runs || 0) - (a?.stats?.runs || 0);
      if (sortBy === 'newest') return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
      return (a?.name || '').localeCompare(b?.name || '');
    });

  // Global Header Stats
  const activeCount = (automations || []).filter((a) => a?.status === 'active').length;
  const totalRuns = (automations || []).reduce((acc, a) => acc + (a?.stats?.runs || 0), 0);
  const totalDmsSent = (automations || []).reduce((acc, a) => acc + (a?.stats?.dms_sent || 0), 0);
  const totalUniqueUsers = (automations || []).reduce((acc, a) => acc + (a?.stats?.unique_users || 0), 0);

  const templates = [
    {
      id: 'tpl_1',
      title: 'Reel Comment "LINK" → Instant Lead Magnet DM',
      description: 'Auto-reply to Instagram comments containing keywords like "LINK", "GUIDE", or "PDF" with an instant download link in DM.',
      trigger_type: 'comment' as TriggerType,
      keywords: ['LINK', 'GUIDE', 'PDF', 'INFO'],
      badge: 'Most Popular',
      badgeColor: 'bg-indigo-50 text-[#3B5BFF] border-indigo-200/80',
      category: 'comment',
      icon: MessageCircle,
      iconBg: 'bg-indigo-50 text-[#3B5BFF]',
      flowPreview: { trigger: 'Comment "LINK"', action: 'Send PDF Link DM' },
    },
    {
      id: 'tpl_2',
      title: 'DM Keyword "PRICE" → Consultation & Quote',
      description: 'Automatically answer DM inquiries asking about pricing or rates with an interactive price sheet and booking link.',
      trigger_type: 'dm' as TriggerType,
      keywords: ['PRICE', 'RATES', 'COST', 'QUOTE'],
      badge: 'High Conversion',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      category: 'dm',
      icon: Send,
      iconBg: 'bg-emerald-50 text-emerald-600',
      flowPreview: { trigger: 'DM Keyword "PRICE"', action: 'Send Price Sheet' },
    },
    {
      id: 'tpl_3',
      title: 'Story Reply "VIP" → Exclusive Promo Code',
      description: 'Send secret discount coupon codes to anyone who replies to your Instagram stories with keywords like "VIP" or "DEAL".',
      trigger_type: 'story_reply' as TriggerType,
      keywords: ['VIP', 'DEAL', 'CODE', 'PROMO'],
      badge: 'Engagement Booster',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200/80',
      category: 'story_reply',
      icon: Sparkles,
      iconBg: 'bg-amber-50 text-amber-600',
      flowPreview: { trigger: 'Story Reply "VIP"', action: 'Send Coupon Code' },
    },
    {
      id: 'tpl_4',
      title: 'Auto Welcome DM for New Followers',
      description: 'Greet new followers or initial DM senders with a warm welcome message and instant links menu.',
      trigger_type: 'dm' as TriggerType,
      keywords: ['HI', 'HELLO', 'START', 'INFO'],
      badge: 'Audience Growth',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200/80',
      category: 'dm',
      icon: Instagram,
      iconBg: 'bg-purple-50 text-purple-600',
      flowPreview: { trigger: 'New DM Inquiry', action: 'Send Welcome Menu' },
    },
    {
      id: 'tpl_5',
      title: 'Custom Blank Canvas',
      description: 'Build a completely custom multi-step trigger and automated response sequence from scratch with custom logic.',
      trigger_type: 'dm' as TriggerType,
      keywords: [],
      badge: 'Custom Flow',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
      category: 'custom',
      icon: Wand2,
      iconBg: 'bg-slate-100 text-slate-800',
      flowPreview: { trigger: 'Custom Trigger', action: 'Custom Actions' },
    },
  ];

  const filteredTemplates = templates.filter(
    (t) => templateCategory === 'all' || t.category === templateCategory
  );

  const handleSelectTemplate = (tpl: typeof templates[0]) => {
    setIsTemplateModalOpen(false);
    if (tpl.category === 'custom') {
      setEditingAutomation(null);
      setIsBuilderOpen(true);
    } else {
      const newAuto: Automation = {
        id: `auto_${Date.now()}`,
        name: tpl.title,
        trigger_type: tpl.trigger_type,
        trigger_config: {
          all_or_keywords: tpl.keywords.length > 0 ? 'keywords' : 'all',
          keywords: tpl.keywords,
        },
        actions: [
          {
            id: `act_${Date.now()}_1`,
            type: 'send_dm',
            message_text: `Thanks for reaching out! Here is your requested information: https://autoreply.io/info`,
          },
        ],
        status: 'active',
        stats: {
          runs: 0,
          dms_sent: 0,
          unique_users: 0,
          open_rate: 100,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setEditingAutomation(newAuto);
      setIsBuilderOpen(true);
    }
  };

  const handleDuplicate = (auto: Automation) => {
    createAutomation({
      name: `${auto.name} (Copy)`,
      trigger_type: auto.trigger_type,
      trigger_config: { ...auto.trigger_config },
      actions: [...auto.actions],
      status: 'paused',
    });
    setOpenMenuId(null);
  };

  return (
    <div className="p-8 space-y-8 bg-[#F7FAFF] min-h-screen">
      {/* 1. Unified Active Automations & Metrics Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        {/* Active Automations Header (Top of Banner) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-300/80 shrink-0 shadow-2xs">
              <Zap className="w-5 h-5 text-emerald-700 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">Active Automations</h3>
              <p className="text-xs text-slate-600 font-semibold">Real-time comment & DM auto-responders running</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300/90 px-3.5 py-1.5 rounded-full text-xs font-black text-emerald-800 shrink-0 self-start sm:self-auto shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{activeCount} Active Automations</span>
          </div>
        </div>

        {/* Metrics Grid inside Single Banner */}
        <div className="space-y-4">
          {/* Row 1: Total Runs (Left) & DMs Sent (Right) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Total Runs */}
            <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-2 hover:border-indigo-300 shadow-2xs transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Total Runs</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-[#3B5BFF] flex items-center justify-center font-bold">
                  <Zap className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight">{totalRuns.toLocaleString()}</div>
              <p className="text-[11px] text-slate-600 font-semibold">Total automated trigger executions</p>
            </div>

            {/* DMs Sent */}
            <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-2 hover:border-emerald-300 shadow-2xs transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">DMs Sent</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Send className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight">{totalDmsSent.toLocaleString()}</div>
              <p className="text-[11px] text-slate-600 font-semibold">Direct messages delivered automatically</p>
            </div>
          </div>

          {/* Row 2: Unique Users (Left) & Comment Replies (Right) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Unique Users */}
            <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-2 hover:border-amber-300 shadow-2xs transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Unique Users</span>
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight">{totalUniqueUsers.toLocaleString()}</div>
              <p className="text-[11px] text-slate-600 font-semibold">Unique Instagram accounts engaged</p>
            </div>

            {/* Comment Replies */}
            <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-2 hover:border-purple-300 shadow-2xs transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Comment Replies</span>
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <MessageCircle className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight">{totalRuns.toLocaleString()}</div>
              <p className="text-[11px] text-slate-600 font-semibold">Automated public post & Reel comment replies</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Controls & Search Filter Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        {/* Row 1: Search Automation/Keyword Input (Left) & Create Automation Button (Top Right) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 stroke-[2.2]" />
            <input
              type="text"
              placeholder="Search automations or keywords (e.g. LINK, PRICE)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-[#3B5BFF] focus:outline-hidden"
            />
          </div>

          <button
            onClick={() => {
              setEditingAutomation(null);
              setIsBuilderOpen(true);
            }}
            className="w-full sm:w-auto bg-[#3B5BFF] hover:bg-indigo-700 text-white font-black text-xs py-2.5 px-5 rounded-xl btn-primary-elevated flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Automation</span>
          </button>
        </div>

        {/* Row 2: Three Filter Buttons Side-by-Side in a Line */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-200">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-[#3B5BFF] focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="paused">Paused Only</option>
          </select>

          {/* Trigger Filter */}
          <select
            value={triggerFilter}
            onChange={(e) => setTriggerFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-[#3B5BFF] focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Triggers</option>
            <option value="comment">Comment Triggers</option>
            <option value="dm">DM Triggers</option>
            <option value="story_reply">Story Reply Triggers</option>
            <option value="dm_ai_conversation">DM AI Conversation</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-[#3B5BFF] focus:outline-hidden cursor-pointer"
          >
            <option value="runs">Most Runs</option>
            <option value="newest">Recently Created</option>
            <option value="name">Alphabetical</option>
          </select>
        </div>
      </div>

      {/* 3. Automation List Cards */}
      <div className="space-y-4">
        {filteredAutomations.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 space-y-3">
            <Zap className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">No Automations Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search query or filter settings, or pick a template to create your first Instagram DM flow.
            </p>
            <button
              onClick={() => {
                setEditingAutomation(null);
                setIsBuilderOpen(true);
              }}
              className="bg-[#3B5BFF] text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md mt-2"
            >
              + Create Automation
            </button>
          </div>
        ) : (
          filteredAutomations.map((auto) => {
            const isActive = auto.status === 'active';
            const isAiConv = auto.trigger_type === 'dm_ai_conversation' || auto.trigger_config?.all_or_keywords === 'ai_conversation';
            const triggerLabel =
              auto.trigger_type === 'comment'
                ? 'COMMENT TRIGGER'
                : isAiConv
                ? 'DM AI CONVERSATION'
                : auto.trigger_type === 'dm'
                ? 'USER DIRECT MESSAGE'
                : 'STORY REPLY';

            const triggerBoxText =
              isAiConv
                ? 'DM AI Conversation...'
                : auto.trigger_type === 'dm'
                ? 'User Direct Messa...'
                : auto.trigger_type === 'comment'
                ? `Comment "${auto.trigger_config.keywords[0] || 'Trigger'}"...`
                : `Story Reply...`;

            return (
              <div
                key={auto.id}
                className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                {/* 1. Header & Name Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Active Green Dot */}
                    <span
                      className={`w-2.5 h-2.5 rounded-full inline-block ${
                        isActive ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50 animate-pulse' : 'bg-slate-300'
                      }`}
                    ></span>

                    {/* Name */}
                    <h3 className="text-base font-black text-slate-950 tracking-tight">{auto.name}</h3>

                    {/* Pill Tag */}
                    <span className="bg-emerald-100/80 text-emerald-800 border border-emerald-300 text-[10px] md:text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      {triggerLabel}
                    </span>

                    {/* Time */}
                    <span className="text-xs text-slate-500 font-bold">
                      Last updated: 3 hours ago
                    </span>
                  </div>

                  {/* Toggle Switch & Menu */}
                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <button
                      onClick={() => toggleAutomationStatus(auto.id)}
                      title={isActive ? 'Pause Automation' : 'Activate Automation'}
                      className="transition-opacity hover:opacity-80"
                    >
                      {isActive ? (
                        <ToggleRight className="w-9 h-9 text-[#22C55E]" />
                      ) : (
                        <ToggleLeft className="w-9 h-9 text-slate-400" />
                      )}
                    </button>

                    {/* Action Dropdown Menu */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === auto.id ? null : auto.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>

                      {openMenuId === auto.id && (
                        <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg w-44 py-1.5 z-20 text-xs font-semibold text-slate-700">
                          <button
                            onClick={() => {
                              setEditingAutomation(auto);
                              setIsBuilderOpen(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Edit Flow</span>
                          </button>

                          <button
                            onClick={() => handleDuplicate(auto)}
                            className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Duplicate</span>
                          </button>

                          <div className="border-t border-slate-100 my-1"></div>

                          <button
                            onClick={() => {
                              deleteAutomation(auto.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Flow</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Flow Workflow Map (Workflow Map) */}
                <div className="flex flex-wrap items-center gap-2.5 py-1">
                  <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-900">
                    <MessageCircle className="w-3.5 h-3.5 text-blue-600 stroke-[2.2]" />
                    <span>[ {triggerBoxText} ]</span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 stroke-[2.5]" />

                  <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl text-xs font-black text-[#3B5BFF]">
                    <Zap className="w-3.5 h-3.5 fill-[#3B5BFF]" />
                    <span>[ ⚡ {Array.isArray(auto.actions) ? auto.actions.length : 1} action ]</span>
                  </div>
                </div>

                {/* 3. Bottom Stats Bar (Metrics Bar) */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-3 md:gap-5 text-xs font-bold text-slate-600">
                  <span className="flex items-center gap-1 font-black text-slate-950">
                    <Zap className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                    {auto.stats?.runs ?? 0} runs
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-slate-800 font-bold">
                    <Users className="w-3.5 h-3.5 text-slate-600 stroke-[2.2]" />
                    {auto.stats?.unique_users ?? 0} Users
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-slate-500 font-bold">
                    <Clock className="w-3.5 h-3.5" />
                    Recently active
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Template Picker Modal */}
      {/* 4. Select Automation Template Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 sm:p-6 transition-all">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200/90 overflow-hidden space-y-5 max-h-[92vh] flex flex-col">
            {/* Close Button */}
            <button
              onClick={() => setIsTemplateModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors z-10"
              title="Close template window"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-8 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#3B5BFF] via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Select Automation Template
                    </h2>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      PRO FUNNELS
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                    Launch high-converting Instagram comment & DM auto-responder sequences in seconds.
                  </p>
                </div>
              </div>
            </div>

            {/* Category Filter Tabs inside Modal */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { id: 'all', label: 'All Templates', count: templates.length },
                { id: 'comment', label: 'Reel Comments', count: templates.filter((t) => t.category === 'comment').length },
                { id: 'dm', label: 'Direct Messages', count: templates.filter((t) => t.category === 'dm').length },
                { id: 'story_reply', label: 'Story Replies', count: templates.filter((t) => t.category === 'story_reply').length },
                { id: 'custom', label: 'Custom Canvas', count: 1 },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setTemplateCategory(cat.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    templateCategory === cat.id
                      ? 'bg-[#3B5BFF] text-white shadow-sm shadow-indigo-500/20'
                      : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-600'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      templateCategory === cat.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Template Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-1 py-1 max-h-[460px]">
              {filteredTemplates.map((tpl) => {
                const IconComponent = tpl.icon;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    className="p-5 rounded-2xl border border-slate-200/80 hover:border-[#3B5BFF] bg-white hover:bg-gradient-to-br hover:from-white hover:via-indigo-50/20 hover:to-purple-50/20 cursor-pointer transition-all duration-200 group relative flex flex-col justify-between shadow-2xs hover:shadow-xl hover:shadow-indigo-500/10 space-y-4 hover:-translate-y-0.5"
                  >
                    {/* Top Row: Icon + Badge */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`w-10 h-10 rounded-xl ${tpl.iconBg} flex items-center justify-center border border-slate-200/60 shadow-2xs`}>
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <span className={`text-[10px] font-extrabold border px-2.5 py-0.5 rounded-full uppercase tracking-wider ${tpl.badgeColor}`}>
                          {tpl.badge}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-[#3B5BFF] transition-colors leading-snug">
                          {tpl.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {tpl.description}
                        </p>
                      </div>

                      {/* Flow Mini Preview */}
                      <div className="bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl flex items-center justify-between text-[11px] font-semibold text-slate-600 gap-2">
                        <span className="truncate bg-white px-2 py-0.5 rounded border border-slate-200/80 text-slate-700 font-bold">
                          {tpl.flowPreview.trigger}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate bg-indigo-50 text-[#3B5BFF] px-2 py-0.5 rounded border border-indigo-200/60 font-bold">
                          {tpl.flowPreview.action}
                        </span>
                      </div>
                    </div>

                    {/* Footer CTA */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3B5BFF]">
                      <span className="flex items-center gap-1">
                        Use Template
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 group-hover:bg-[#3B5BFF] text-[#3B5BFF] group-hover:text-white flex items-center justify-center transition-colors">
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Footer Info Bar */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium bg-slate-50/60 -mx-6 -mb-6 p-4 px-6 rounded-b-3xl">
              <div className="flex items-center gap-2 text-slate-600">
                <Zap className="w-4 h-4 text-emerald-500 fill-emerald-500" />
                <span>All templates include automated Instagram DM triggers and live analytics.</span>
              </div>
              <button
                onClick={() => {
                  handleSelectTemplate(templates[templates.length - 1]);
                }}
                className="text-[#3B5BFF] hover:underline font-bold text-xs"
              >
                + Start from Scratch (Blank Canvas)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
