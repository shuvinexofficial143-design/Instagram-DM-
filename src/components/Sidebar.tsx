import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Zap,
  Users,
  MessageSquare,
  Settings,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Plus,
  Info,
  CreditCard,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserAvatar } from './Common/UserAvatar';

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    user,
    firebaseUser,
    logout,
    instagramAccount,
    inboxMessages,
    setIsConnectModalOpen,
    isAdmin,
  } = useApp();

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
    id: 'home' | 'automations' | 'contacts' | 'inbox' | 'billing' | 'settings' | 'about' | 'admin';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    tag?: string;
  }

  const baseNavItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: LayoutDashboard },
    { id: 'automations', label: 'Automations', icon: Zap },
    { id: 'contacts', label: 'Contacts', icon: Users },
    {
      id: 'inbox',
      label: 'Inbox',
      icon: MessageSquare,
      badge: (inboxMessages || []).filter((m) => m?.direction === 'in').length,
    },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard, tag: String(user?.plan || 'free') },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'about', label: 'About Us', icon: Info },
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

  const accountName =
    firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || user?.name || 'Account';
  const accountEmail = firebaseUser?.email || user?.email || '';
  const accountPhoto = firebaseUser?.photoURL || user?.avatar_url || '';

  return (
    <aside
      className={`relative bg-white border-r border-slate-200 shadow-sm flex flex-col justify-between h-screen sticky top-0 z-30 select-none transition-all duration-300 ease-in-out ${
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
      <div className="overflow-x-hidden">
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

      {/* Bottom User Card & Plan Notice */}
      <div className="p-2.5 border-t border-slate-200/80 space-y-2.5 overflow-x-hidden">
        {/* Profile Card */}
        <div className="relative group">
          <div
            className={`flex items-center ${
              isCollapsed ? 'justify-center p-1.5' : 'justify-between p-2'
            } rounded-xl bg-slate-50 border border-slate-100`}
          >
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0 text-left'} cursor-pointer group-hover:opacity-90`}
              title="Account Settings"
            >
              <UserAvatar
                src={accountPhoto}
                name={accountName}
                size="md"
              />
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-950 truncate group-hover:text-indigo-600 transition-colors">
                    {accountName}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-600 truncate">
                    {accountEmail ? accountEmail.split('@')[0] : `${user.plan} plan`}
                  </p>
                </div>
              )}
            </button>
            {!isCollapsed && (
              <button
                onClick={() => {
                  if (window.confirm('Sign out of AutoReply.io?')) {
                    logout();
                  }
                }}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tooltip when collapsed */}
          {isCollapsed && (
            <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 flex flex-col gap-0.5">
              <span>{accountName}</span>
              <span className="text-[10px] text-slate-300 font-normal">{accountEmail ? accountEmail.split('@')[0] : `${user.plan} Plan`}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

