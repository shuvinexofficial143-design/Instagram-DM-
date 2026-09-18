import React, { useEffect, useState } from 'react';
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
import { AboutUsPage } from './components/About/AboutUsPage';
import { AdminPage } from './components/Admin/AdminPage';

const MainContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <main className="min-w-0 flex-1 bg-[#F7FAFF] pb-24 md:pb-0">
      <PlanBanner />

      <ErrorBoundary>
        {(!activeTab || activeTab === 'home') && <HomePage />}
        {activeTab === 'automations' && <AutomationsPage />}
        {activeTab === 'contacts' && <ContactsPage />}
        {activeTab === 'inbox' && <InboxPage />}
        {activeTab === 'settings' && <SettingsPage />}
        {activeTab === 'about' && <AboutUsPage />}
        {activeTab === 'admin' && <AdminPage />}
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
  const { authLoading } = useApp();
  const [showSplash, setShowSplash] = useState<boolean>(true);

  if (authLoading) {
    return (
      <ErrorBoundary>
        <IntroSplash onComplete={() => {}} />
      </ErrorBoundary>
    );
  }


  return (
    <ErrorBoundary>
      {showSplash && <IntroSplash onComplete={() => setShowSplash(false)} />}
      <div className="flex min-h-screen w-full overflow-x-hidden bg-[#F7FAFF] font-sans text-slate-900">
        <div className="hidden shrink-0 md:block">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
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
