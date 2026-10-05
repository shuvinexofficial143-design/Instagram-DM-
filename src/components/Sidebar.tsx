import React, { useState, useEffect } from 'react';
// Sidebar UI revision: 2026-09-20-profile-footer-v2
import {
  LayoutDashboard,
  Zap,
  Users,
  MessageSquare,
  Settings,
  ChartNoAxesCombined,
  Activity,
  Plug,
  BookOpen,
  Package,
  ClipboardList,
  KanbanSquare,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Plus,
  CreditCard,
  CircleHelp,
  Bot,
  Send,
  Gauge,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserAvatar } from './Common/UserAvatar';
import { useWorkspaceUsage } from '../hooks/useWorkspaceUsage';
import { usageLevel, usagePercent } from '../lib/planUsage';

const usagePalette = (pct: number) => {
  const level = usageLevel(pct);
  if (level === 'critical') return {
    bar: 'bg-rose-500',
    text: 'text-rose-700',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    ring: '#f43f5e',
  };
  if (level === 'warning') return {
    bar: 'bg-amber-500',
    text: 'text-amber-700',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    ring: '#f59e0b',
  };
  return {
    bar: 'bg-emerald-500',
    text: 'text-emerald-700',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    ring: '#10b981',
  };
};

const UsageRow = ({
  icon: Icon,
  label,
  used,
  limit,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  used: number;
  limit: number | null;
  detail?: string;
}) => {
  const pct = usagePercent(used, limit);
  const palette = usagePalette(pct);
  const remaining = limit === null ? null : Math.max(0, limit - used);
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-[0_2px_8px_rgba(15,23,42,.025)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="truncate text-[10px] font-black text-slate-700">{label}</span>
        </div>
        <span className={"shrink-0 text-[10px] font-black " + palette.text}>
          {used.toLocaleString()} / {limit === null ? '∞' : limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={"h-full rounded-full transition-all duration-500 " + (limit === null ? 'bg-indigo-500' : palette.bar)}
          style={{ width: limit === null ? '18%' : Math.max(pct, used > 0 ? 3 : 0) + '%' }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] font-bold text-slate-400">
        <span className="truncate">{detail || (remaining === null ? 'Unlimited' : remaining.toLocaleString() + ' left')}</span>
        <span>{limit === null ? 'Unlimited' : pct + '%'}</span>
      </div>
    </div>
  );
};


export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    automations,
    user,
    firebaseUser,
    logout,
    instagramAccount,
    inboxMessages,
    setIsConnectModalOpen,
    isAdmin,
  } = useApp();

  const usage = useWorkspaceUsage();
  const aiWorkflowCount = (automations || []).filter((automation) => automation.trigger_type === 'dm_ai_conversation').length;
  const usagePcts = [
    usagePercent(usage.messageUsed, usage.messageLimit),
    usagePercent(usage.aiUsed, usage.aiLimit),
    usagePercent(usage.automationUsed, usage.automationLimit),
  ];
  const highestUsagePct = Math.max(...usagePcts);
  const highestPalette = usagePalette(highestUsagePct);
  const accountName =
    firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || user?.name || 'Account';
  const accountEmail = firebaseUser?.email || user?.email || '';
  const accountPhoto = firebaseUser?.photoURL || user?.avatar_url || '';

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', String(isCollapsed));
    } catch (err) {
      console.warn('Could not save sidebar state to localStorage', err);
    }
  }, [isCollapsed]);

  interface NavItem {
    id: 'home' | 'analytics' | 'automations' | 'activity' | 'knowledge' | 'catalog' | 'lead-forms' | 'contacts' | 'crm' | 'inbox' | 'integrations' | 'billing' | 'settings' | 'about' | 'help' | 'faq' | 'billing-help' | 'privacy' | 'terms' | 'admin';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    tag?: string;
  }

  const baseNavItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: ChartNoAxesCombined },
    { id: 'automations', label: 'Automations', icon: Zap },
    { id: 'activity', label: 'Activity Logs', icon: Activity },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'catalog', label: 'Catalog', icon: Package },
    { id: 'lead-forms', label: 'Lead Forms', icon: ClipboardList },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'crm', label: 'CRM Pipeline', icon: KanbanSquare },
    {
      id: 'inbox',
      label: 'Inbox',
      icon: MessageSquare,
      badge: (inboxMessages || []).filter((m) => m?.direction === 'in' && !m?.is_read).length,
    },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard, tag: usage.plan.id },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help Center', icon: CircleHelp },
    { id: 'about', label: 'About Us', icon: CircleHelp },
  ];

  const navItems: NavItem[] = isAdmin
    ? [
        ...baseNavItems,
        {
          id: 'admin',
          label: 'Admin Panel',
          icon: ShieldCheck,
          tag: 'Owner',
        },
      ]
    : baseNavItems;

  return (
    <aside
      className={`relative bg-white border-r border-slate-200 shadow-sm flex flex-col h-[100dvh] sticky top-0 z-30 select-none transition-[width] duration-200 ease-out ${
        isCollapsed ? 'w-[72px]' : 'w-[250px]'
      }`}
    >
      {/* Floating Circular Collapse/Expand Toggle Button in Vertical Center */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-40 w-7 h-7 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition-colors cursor-pointer group"
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-slate-800 group-hover:text-indigo-600 stroke-[2.5]" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-slate-800 group-hover:text-indigo-600 stroke-[2.5]" />
        )}
      </button>

      {/* Top Header & Logo */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className={`p-4 border-b border-slate-200 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0">
              <Zap className="w-5 h-5 fill-white stroke-[2.2]" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 transition-opacity duration-200">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-base text-slate-950 tracking-tight whitespace-nowrap">AutoReply.io</span>
                  <span className="text-[10px] uppercase tracking-wider bg-indigo-100 text-indigo-800 font-black px-1.5 py-0.5 rounded border border-indigo-200">
                    SaaS
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-bold whitespace-nowrap">Meta DM Automation</p>
              </div>
            )}
          </div>
        </div>

        {/* Channel Status Pill */}
        <div className={`p-3 border-b border-slate-200 bg-slate-50 flex ${isCollapsed ? 'justify-center' : ''}`}>
          {instagramAccount ? (
            <div
              className={`relative group bg-white border border-slate-200 rounded-xl shadow-2xs transition-all ${
                isCollapsed ? 'p-2 flex justify-center' : 'p-2.5 flex items-center justify-between w-full'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
                <div className="shrink-0">
                  <UserAvatar
                    src={instagramAccount.profile_pic_url}
                    username={instagramAccount.username}
                    showInstagramBadge={true}
                    size="sm"
                  />
                </div>
                {!isCollapsed && (
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">@{instagramAccount.username}</p>
                    <p className="text-[10px] text-slate-600 font-bold truncate">
                      {instagramAccount.followers_count.toLocaleString()} followers
                    </p>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <button
                  onClick={() => setIsConnectModalOpen(true)}
                  title="Switch or add account"
                  className="text-slate-500 hover:text-indigo-600 p-1 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}

              {/* Tooltip when collapsed */}
              {isCollapsed && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 flex flex-col gap-0.5">
                  <span>@{instagramAccount.username}</span>
                  <span className="text-[10px] text-slate-400">{instagramAccount.followers_count.toLocaleString()} followers</span>
                </div>
              )}
            </div>
          ) : (
            <div className="relative group w-full flex justify-center">
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className={`bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold text-xs rounded-xl border border-indigo-200/60 flex items-center justify-center transition-all cursor-pointer ${
                  isCollapsed ? 'w-10 h-10 p-0' : 'w-full py-2 px-3 gap-2'
                }`}
                aria-label="Connect Instagram"
              >
                <Plus className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span>Connect Instagram</span>}
              </button>
              {isCollapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                  Connect Instagram
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <div key={item.id} className="relative group">
                <button
                  onClick={() => setActiveTab(item.id)}
                  aria-label={item.label}
                  className={`w-full flex items-center ${
                    isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
                  } rounded-xl font-semibold text-sm md:text-[15px] transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#EEF2FF] text-[#3B5BFF] font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                  }`}
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center relative' : 'gap-3'}`}>
                    <Icon className={`w-[21px] h-[21px] shrink-0 ${isActive ? 'text-[#3B5BFF]' : 'text-slate-400'}`} />
                    {!isCollapsed && <span>{item.label}</span>}
                    {isCollapsed && item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-[#3B5BFF] rounded-full ring-2 ring-white"></span>
                    ) : null}
                  </div>
                  {!isCollapsed && item.tag ? (
                    <span className="bg-amber-100 text-amber-800 border border-amber-300/60 text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-wider uppercase">
                      {item.tag}
                    </span>
                  ) : !isCollapsed && item.badge && item.badge > 0 ? (
                    <span className="bg-[#3B5BFF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  ) : null}
                </button>

                {/* Hover Tooltip when Collapsed */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="bg-[#3B5BFF] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Bottom Account Identity */}
      <div className="shrink-0 border-t border-slate-200/80 bg-white px-2.5 pt-2.5">
        {!isCollapsed ? (
          <div className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
            <button
              onClick={() => setActiveTab('settings')}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              title="Account settings"
            >
              <div className="shrink-0">
                <UserAvatar src={accountPhoto} name={accountName} size="md" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-sm font-black text-slate-950">{accountName}</p>
                <p className="mt-0.5 truncate text-[11px] font-bold text-slate-600" title={accountEmail}>
                  {accountEmail || 'Signed in with Google'}
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                if (window.confirm('Sign out of AutoReply.io?')) logout();
              }}
              title="Sign Out"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setActiveTab('settings')}
            className="flex w-full justify-center rounded-xl border border-slate-200 bg-slate-50 p-1.5"
            title={accountEmail || accountName}
          >
            <UserAvatar src={accountPhoto} name={accountName} size="md" />
          </button>
        )}
      </div>

      {/* Bottom Workspace Usage */}
      <div className="shrink-0 border-t border-slate-200/80 bg-white p-2.5">
        {!isCollapsed ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-[.12em] text-slate-600">
                  Workspace Usage
                </span>
              </div>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-700">
                {usage.plan.name}
              </span>
            </div>

            <div className="mt-2 space-y-1.5">
              <UsageRow
                icon={Send}
                label="Messages"
                used={usage.messageUsed}
                limit={usage.messageLimit}
              />
              <UsageRow
                icon={Bot}
                label="AI Replies"
                used={usage.aiUsed}
                limit={usage.aiLimit}
              />
              <UsageRow
                icon={GitBranch}
                label="Workflows"
                used={usage.automationUsed}
                limit={usage.automationLimit}
                detail={
                  aiWorkflowCount +
                  ' AI flow' +
                  (aiWorkflowCount === 1 ? '' : 's') +
                  (usage.automationLimit === null
                    ? ' · unlimited'
                    : ' · ' + Math.max(0, usage.automationLimit - usage.automationUsed) + ' left')
                }
              />
            </div>

            {highestUsagePct >= 90 && (
              <button
                onClick={() => setActiveTab('billing')}
                className="mt-2 flex w-full items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-left text-[9px] font-black text-rose-700"
              >
                <span>{highestUsagePct >= 100 ? 'Monthly limit reached' : 'Usage is close to the limit'}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}

            <div className="mt-2 flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('billing')}
                className="flex min-h-8 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-black text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700"
              >
                <span>{usage.source === 'server' ? 'Monthly usage' : 'View usage'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="group relative flex justify-center">
            <button
              onClick={() => setActiveTab('billing')}
              className="relative flex h-11 w-11 items-center justify-center rounded-full p-[3px]"
              style={{
                background:
                  'conic-gradient(' +
                  highestPalette.ring +
                  ' ' +
                  Math.max(highestUsagePct, 4) * 3.6 +
                  'deg, #e2e8f0 0deg)',
              }}
              aria-label="Open workspace usage"
            >
              <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-[9px] font-black text-slate-700">
                {highestUsagePct}%
              </span>
            </button>
            <div className="pointer-events-none absolute bottom-0 left-full z-50 ml-3 w-52 rounded-xl bg-slate-950 p-3 text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-300">{usage.plan.name} usage</p>
              <p className="mt-1 text-[10px] text-slate-300">Messages {usage.messageUsed.toLocaleString()} / {usage.messageLimit.toLocaleString()}</p>
              <p className="text-[10px] text-slate-300">AI {usage.aiUsed.toLocaleString()} / {usage.aiLimit.toLocaleString()}</p>
              <p className="text-[10px] text-slate-300">Workflows {usage.automationUsed.toLocaleString()} / {usage.automationLimit === null ? '∞' : usage.automationLimit.toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};


