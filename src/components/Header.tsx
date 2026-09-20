import React from 'react';
import {
  Home,
  Zap,
  Users,
  MessageSquare,
  Settings,
  Info,
  Instagram,
  CreditCard,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    instagramAccount,
    setIsConnectModalOpen,
    inboxMessages,
    firebaseUser,
  } = useApp();

  const navItems = [
    { id: 'home' as const, label: 'Home', icon: Home },
    { id: 'automations' as const, label: 'Automations', icon: Zap },
    { id: 'contacts' as const, label: 'Contacts', icon: Users },
    { id: 'inbox' as const, label: 'Inbox', icon: MessageSquare },
    { id: 'billing' as const, label: 'Billing', icon: CreditCard },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  const unreadCount = (inboxMessages || []).filter((m) => m?.direction === 'in').length;

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 border-b border-indigo-100 bg-gradient-to-r from-[#F7FAFF] via-blue-50 to-violet-50 px-4 py-3 shadow-[0_8px_28px_rgba(72,95,145,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="flex min-w-0 items-center gap-2.5 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm">
              <Zap className="h-5 w-5 fill-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-tight text-slate-950">AutoReply.io</p>
              <p className="truncate text-[11px] font-semibold text-slate-500">Instagram automation workspace</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setIsConnectModalOpen(true)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-sm transition-colors ${
              instagramAccount
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-indigo-200 bg-indigo-50 text-indigo-700'
            }`}
          >
            <Instagram className="h-4 w-4" />
            <span>{instagramAccount ? 'Connected' : 'Connect'}</span>
          </button>
        </div>
      </header>

      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
        <div className="grid grid-cols-6 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const showBadge = item.id === 'inbox' && unreadCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'
                }`}
              >
                <span className="relative">
                  <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.4]' : ''}`} />
                  {showBadge && (
                    <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-indigo-600 px-1 text-[9px] leading-4 text-white">
                      {Math.min(unreadCount, 99)}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
