import React, { useEffect, useState } from 'react';
// Deployment refresh: 2026-09-20T08:59Z
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PlanBanner } from './components/Common/PlanBanner';
import { PlanRenewModal } from './components/Common/PlanRenewModal';
import { ConnectChannelModal } from './components/Common/ConnectChannelModal';
import { IntroSplash } from './components/Common/IntroSplash';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import { HomePage } from './components/Home/HomePage';
import { AutomationsPage } from './components/Automations/AutomationsPage';
import { AutomationBuilder } from './components/Automations/AutomationBuilder';
import { ContactsPage } from './components/Contacts/ContactsPage';
import { InboxPage } from './components/Inbox/InboxPage';
import { SettingsPage } from './components/Settings/SettingsPage';
import { BillingUsagePage } from './components/Billing/BillingUsagePage';
import { AboutUsPage } from './components/About/AboutUsPage';
import { AdminPage } from './components/Admin/AdminPage';
import { LoginPage } from './components/Auth/LoginPage';

const MainContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <main className="app-unified-theme min-w-0 flex-1 bg-[#F7FAFF] pb-24 md:pb-0 md:overflow-y-auto md:overscroll-contain">
      <PlanBanner />

      <ErrorBoundary>
        {(!activeTab || activeTab === 'home') && <HomePage />}
        {activeTab === 'automations' && <AutomationsPage />}
        {activeTab === 'contacts' && <ContactsPage />}
        {activeTab === 'inbox' && <InboxPage />}
        {activeTab === 'billing' && <BillingUsagePage />}
        {activeTab === 'settings' && <SettingsPage />}
        {activeTab === 'about' && <AboutUsPage />}
      </ErrorBoundary>

      <ErrorBoundary>
        <AutomationBuilder />
        <ConnectChannelModal />
        <PlanRenewModal />
      </ErrorBoundary>
    </main>
  );
};

const AppShell: React.FC = () => {
  const { authLoading, firebaseUser, isAdmin } = useApp();
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const isAdminRoute =
    typeof window !== 'undefined' && window.location.pathname === '/admin';

  if (authLoading) {
    return (
      <ErrorBoundary>
        <IntroSplash onComplete={() => {}} />
      </ErrorBoundary>
    );
  }


  if (!firebaseUser) {
    return (
      <ErrorBoundary>
        <LoginPage />
      </ErrorBoundary>
    );
  }

  if (isAdminRoute) {
    return (
      <ErrorBoundary>
        <div className="min-h-[100dvh] bg-[#F7FAFF]">
          <AdminPage />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {showSplash && <IntroSplash onComplete={() => setShowSplash(false)} />}
      <div className="flex min-h-[100dvh] w-full overflow-x-clip bg-[#F7FAFF] font-sans text-slate-900 md:h-[100dvh] md:overflow-hidden">
        <div className="hidden shrink-0 md:block"><Sidebar /></div>
        <div className="flex min-w-0 flex-1 flex-col md:h-[100dvh] md:min-h-0">
          <Header />
          <MainContent />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
