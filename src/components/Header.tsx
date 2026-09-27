import React, { useState } from 'react';
import {
  Home,
  Zap,
  Users,
  MessageSquare,
  Settings,
  Info,
  Instagram,
  CreditCard,
  Menu,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserAvatar } from './Common/UserAvatar';

export const Header: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
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
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"><Menu className="h-5 w-5" /></button>
          <button type="button" onClick={() => setActiveTab('home')} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white"><Zap className="h-4 w-4 fill-white" /></div>
            <span className="text-sm font-black tracking-tight text-slate-950">AutoReply.io</span>
          </button>
          <button type="button" onClick={() => setActiveTab('settings')} aria-label="Open profile settings" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <UserAvatar src={firebaseUser?.photoURL || ''} name={firebaseUser?.displayName || firebaseUser?.email || 'Account'} size="sm" />
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button aria-label="Close navigation" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]" />
          <aside className="absolute inset-y-0 left-0 flex w-[82vw] max-w-[310px] flex-col bg-white p-4 shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white"><Zap className="h-4.5 w-4.5 fill-white" /></div><div><p className="text-sm font-black text-slate-950">AutoReply.io</p><p className="text-[10px] font-semibold text-slate-500">Instagram automation</p></div></div>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close navigation" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <nav className="mt-4 space-y-1">
              {navItems.map(item => {
                const Icon=item.icon, active=activeTab===item.id;
                const showBadge=item.id==='inbox' && unreadCount>0;
                return <button key={item.id} onClick={() => { setActiveTab(item.id); setDrawerOpen(false); }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-semibold transition ${active?'bg-indigo-50 text-indigo-700':'text-slate-600 hover:bg-slate-50'}`}><span className="flex items-center gap-3"><Icon className="h-5 w-5" />{item.label}</span>{showBadge&&<span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] text-white">{Math.min(unreadCount,99)}</span>}</button>;
              })}
            </nav>
            <div className="mt-auto border-t border-slate-100 pt-4">
              <button onClick={() => { setActiveTab('settings'); setDrawerOpen(false); }} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left"><UserAvatar src={firebaseUser?.photoURL || ''} name={firebaseUser?.displayName || firebaseUser?.email || 'Account'} size="sm" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{firebaseUser?.displayName || 'Account'}</p><p className="truncate text-[10px] text-slate-500">{firebaseUser?.email || ''}</p></div></button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
