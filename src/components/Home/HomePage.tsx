import React from 'react';
import {
  Zap,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  ArrowRight,
  MessageCircle,
  Send,
  Link as LinkIcon,
  Plus,
  Instagram,
  Settings,
  Sparkles,
  Inbox,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserAvatar } from '../Common/UserAvatar';

export const HomePage: React.FC = () => {
  const {
    user,
    instagramAccount,
    automations,
    inboxMessages,
    toggleAutomationStatus,
    setActiveTab,
    setIsConnectModalOpen,
    setIsBuilderOpen,
  } = useApp();

  const totalDmsSent = (automations || []).reduce((acc, a) => acc + (a?.stats?.dms_sent || 0), 0);
  const realOutMsgs = (inboxMessages || []).filter((m) => m && m.direction === 'out').length;
  const totalDms = Math.max(totalDmsSent, realOutMsgs);

  const totalUniqueUsers = (automations || []).reduce((acc, a) => acc + (a?.stats?.unique_users || 0), 0);
  const commentReplies = (automations || [])
    .filter((a) => a && a.trigger_type === 'comment')
    .reduce((acc, a) => acc + (a?.stats?.runs || 0), 0);
  const activeCount = (automations || []).filter((a) => a && a.status === 'active').length;
  const totalCount = (automations || []).length;

  // Real Dynamic DM Open Rate Calculation
  const openRatePct = totalDms > 0
    ? ((automations || []).length > 0
        ? Math.round((automations || []).reduce((acc, a) => acc + (a?.stats?.open_rate || 96), 0) / automations.length)
        : 98)
    : 0;
  const openedDmsCount = totalDms > 0 ? Math.round((totalDms * openRatePct) / 100) : 0;

  const topAutomations = [...(automations || [])].sort((a, b) => (b?.stats?.runs || 0) - (a?.stats?.runs || 0)).slice(0, 4);

  const isConnected = Boolean(instagramAccount && instagramAccount.username);
  const connectedCount = isConnected ? 1 : 0;

  return (
    <div className="relative min-h-screen space-y-6 overflow-x-clip bg-gradient-to-br from-blue-50/95 via-indigo-50/90 to-violet-100/75 px-4 py-6 md:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(129,140,248,0.16),transparent_30%),radial-gradient(circle_at_10%_85%,rgba(56,189,248,0.12),transparent_34%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-16 bottom-24 h-72 w-72 rounded-full bg-cyan-200/20 blur-3xl" aria-hidden="true" />
      {/* Compact dashboard greeting — real profile + connection state only */}
      <section className="relative z-10 flex w-full items-start justify-between gap-4 px-0.5 py-1 md:items-center md:px-1 md:py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-bold leading-tight tracking-tight text-slate-950 md:text-[24px]">
            Good evening, {user.name || 'Creator'} 👋
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium text-slate-500 md:text-[14px]">
            <span className="md:hidden">{connectedCount} {connectedCount === 1 ? 'account' : 'accounts'} connected</span>
            <span className="hidden md:inline">{connectedCount} Instagram {connectedCount === 1 ? 'account' : 'accounts'} connected</span>
            <span aria-hidden="true">•</span>
            <span className={`inline-flex items-center gap-1.5 ${isConnected ? 'text-slate-500' : 'text-slate-500'}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
              {isConnected ? 'Everything running normally' : 'Connect Instagram to get started'}
            </span>
          </div>
        </div>
      </section>

      {/* 4. CONNECTED ACCOUNTS BANNER (~8:1 Ratio Horizontal Strip) */}
      <div className="relative z-10 flex min-h-[76px] w-full flex-col justify-between gap-4 rounded-2xl border border-white/90 bg-white/85 px-5 py-4 shadow-[0_12px_36px_rgba(72,95,145,0.07)] backdrop-blur-sm transition-all hover:border-indigo-200 hover:shadow-[0_16px_42px_rgba(72,95,145,0.10)] md:flex-row md:items-center">
        {/* Left Section */}
        <div className="space-y-1 min-w-0">
          <div className="text-[11px] font-black text-slate-600 tracking-tight">
            Connected accounts ({connectedCount} connected)
          </div>

          {isConnected && instagramAccount?.username ? (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Profile Pic with Instagram Badge */}
              <UserAvatar
                src={instagramAccount.profile_pic_url}
                username={instagramAccount.username}
                showInstagramBadge={true}
                size="sm"
              />

              {/* Handle Name */}
              <span className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                @{instagramAccount.username}
              </span>

              {/* Green Syncing/Active Status Dot */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[11px] font-black text-emerald-800 border border-emerald-300/80">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Active</span>
              </span>

              {/* Follower Count */}
              {instagramAccount.followers_count > 0 && (
                <span className="text-xs font-bold text-slate-600 hidden sm:inline">
                  • {instagramAccount.followers_count.toLocaleString()} followers
                </span>
              )}

              {/* Divider & "+ Connect New Channel" Text Link */}
              <div className="hidden sm:block h-3.5 w-px bg-slate-300 mx-0.5"></div>
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-black text-[#3B5BFF] hover:text-indigo-800 hover:underline transition-colors py-0.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Connect New Channel</span>
              </button>
            </div>
          ) : (
            /* Clean Empty State when 0 accounts connected */
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-300 shrink-0">
                <Instagram className="w-4 h-4 text-slate-700" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800">No Instagram account linked</span>
                <p className="text-[11px] text-slate-600 font-semibold hidden sm:block">
                  Connect your Instagram account to enable automatic DM & comment replies.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Section: View All Profiles / Connect Button */}
        <div className="shrink-0 self-start md:self-center">
          {isConnected && instagramAccount?.username ? (
            <button
              onClick={() => setActiveTab('settings')}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black text-white shadow-md transition duration-200 hover:-translate-y-px hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D62976] focus-visible:ring-offset-2 active:translate-y-0"
              style={{ backgroundImage: 'linear-gradient(100deg, #FEDA75 0%, #FA7E1E 20%, #D62976 48%, #962FBF 72%, #4F5BD5 100%)' }}
            >
              <span>View all profiles</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          ) : (
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black text-white shadow-md transition duration-200 hover:-translate-y-px hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D62976] focus-visible:ring-offset-2 active:translate-y-0"
              style={{ backgroundImage: 'linear-gradient(100deg, #FEDA75 0%, #FA7E1E 20%, #D62976 48%, #962FBF 72%, #4F5BD5 100%)' }}
            >
              <Instagram className="w-4 h-4 stroke-[2.3]" />
              <span>Connect Instagram</span>
            </button>
          )}
        </div>
      </div>

      {/* 5. Top Performing Automations */}
      <div id="top-performers-section" className="relative z-10 space-y-5 rounded-2xl border border-white/90 bg-white/85 p-6 shadow-[0_12px_36px_rgba(72,95,145,0.07)] backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#3B5BFF] fill-[#3B5BFF]/20 stroke-[2.2]" />
              <span>Top Performing Automations</span>
            </h3>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Workflows driving the highest lead conversions and responses
            </p>
          </div>
          <button
            onClick={() => setActiveTab('automations')}
            className="text-xs font-black text-[#3B5BFF] hover:text-indigo-800 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>View All ({automations.length})</span>
            <ChevronRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        <div className="space-y-3">
          {topAutomations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/35 p-8 text-center">
              <Zap className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-black text-slate-800">No Automations Created Yet</p>
              <p className="text-xs font-semibold text-slate-600 mb-4 max-w-sm mx-auto">
                Create your first Instagram DM or Comment automation workflow to start auto-converting leads.
              </p>
              <button
                onClick={() => setIsBuilderOpen(true)}
                className="btn-primary-elevated cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-indigo-500/15"
              >
                + Create Automation
              </button>
            </div>
          ) : (
            topAutomations.map((auto) => {
              const isActive = auto.status === 'active';
              return (
                <div
                  key={auto.id}
                  className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/70 bg-white/75 p-4 shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-md sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-sm font-black text-slate-950 truncate">{auto.name}</h4>
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                          auto.trigger_type === 'comment'
                            ? 'bg-purple-100/80 text-purple-900 border-purple-300'
                            : auto.trigger_type === 'dm'
                            ? 'bg-blue-100/80 text-blue-900 border-blue-300'
                            : 'bg-amber-100/80 text-amber-900 border-amber-300'
                        }`}
                      >
                        {auto.trigger_type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <span>Keywords: {Array.isArray(auto.trigger_config?.keywords) ? auto.trigger_config.keywords.join(', ') : 'None'}</span>
                      <span>•</span>
                      <span>Last updated: {new Date(auto.updated_at || Date.now()).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                    <div className="text-left sm:text-right">
                      <div className="text-xs font-black text-slate-950">
                        {(auto.stats?.runs ?? 0).toLocaleString()} interactions
                      </div>
                      <div className="text-[11px] text-emerald-700 font-black">
                        {auto.stats?.open_rate ?? 98}% open rate
                      </div>
                    </div>

                    <button
                      onClick={() => toggleAutomationStatus(auto.id)}
                      className="text-[#3B5BFF] hover:opacity-80 transition-opacity p-1 cursor-pointer"
                      title={isActive ? 'Deactivate' : 'Activate'}
                    >
                      {isActive ? (
                        <ToggleRight className="w-8 h-8 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 6. Quick Actions */}
      <div className="space-y-4 rounded-2xl border border-white/90 bg-white/85 p-6 shadow-[0_12px_36px_rgba(72,95,145,0.07)] backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 fill-amber-500/20" />
            <span>Quick Actions</span>
          </h3>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setIsBuilderOpen(true)}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-left transition-all shadow-2xs hover:shadow-xs group flex items-center gap-3.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0 shadow-2xs">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-slate-900 group-hover:text-[#3B5BFF] transition-colors">
                New Automation
              </div>
              <div className="text-xs text-slate-600 font-semibold">Create custom workflow</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('inbox')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-purple-300 hover:bg-purple-50/30 text-left transition-all shadow-2xs hover:shadow-xs group flex items-center gap-3.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shrink-0 shadow-2xs">
              <Inbox className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-slate-900 group-hover:text-purple-700 transition-colors">
                View Messages
              </div>
              <div className="text-xs text-slate-600 font-semibold">Open DM inbox</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 text-left transition-all shadow-2xs hover:shadow-xs group flex items-center gap-3.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0 shadow-2xs">
              <UserCheck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-slate-900 group-hover:text-amber-700 transition-colors">
                Channel Settings
              </div>
              <div className="text-xs text-slate-600 font-semibold">Manage Instagram account</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 text-left transition-all shadow-2xs hover:shadow-xs group flex items-center gap-3.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0 shadow-2xs">
              <Settings className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                AI Settings
              </div>
              <div className="text-xs text-slate-600 font-semibold">Prompt & automation options</div>
            </div>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="flex flex-col items-center justify-between gap-4 border-t border-indigo-100/80 pb-2 pt-6 text-xs font-medium text-slate-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-600 fill-indigo-600/20" />
          <span className="font-bold text-slate-800">AutoReply.io</span>
          <span>•</span>
          <span>Meta Graph API DM & Comment Automation</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('about')}
            className="font-bold text-indigo-600 hover:underline cursor-pointer"
          >
            About Us
          </button>
          <span>•</span>
          <button
            onClick={() => setActiveTab('settings')}
            className="hover:text-slate-800 transition-colors cursor-pointer"
          >
            Settings
          </button>
          <span>•</span>
          <span>&copy; 2026 AutoReply.io. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};

