import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { auth, onAuthStateChanged } from './lib/firebase';
import { Sidebar } from './components/Sidebar';
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
import { LoginPage } from './components/Auth/LoginPage';

const MainContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <main className="flex-1 min-w-0 bg-[#F9F6FE]">
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

      {/* Modals & Overlays */}
      <ErrorBoundary>
        <AutomationBuilder />
        <ConnectChannelModal />
        <PlanRenewModal />
      </ErrorBoundary>
    </main>
  );
};

const AppShell: React.FC = () => {
  const { firebaseUser, authLoading } = useApp();
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // Production auth gate: never allow guest/fast-pass state to unlock user data.
  // Only a real Firebase authenticated user may enter the dashboard.
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
        <LoginPage onSuccess={() => setShowSplash(false)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {showSplash && <IntroSplash onComplete={() => setShowSplash(false)} />}
      <div className="flex min-h-screen font-sans text-slate-900 bg-[#F9F6FE]">
        <Sidebar />
        <MainContent />
      </div>
    </ErrorBoundary>
  );
};

const AuthIsolatedApp: React.FC = () => {
  const [providerKey, setProviderKey] = useState<string>('auth-boot');

  useEffect(() => {
    if (!auth) {
      setProviderKey('auth-unavailable');
      return;
    }

    // Remount the complete application provider whenever the Firebase identity changes.
    // This guarantees that Instagram account state, inbox, contacts, automations and
    // other in-memory user data from Gmail A can never survive into Gmail B's session.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const nextKey = currentUser ? `firebase-user:${currentUser.uid}` : 'firebase-signed-out';

      // Remove only deprecated global storage. User-specific keys remain isolated by UID.
      try {
        localStorage.removeItem('autoreply_connected_instagram_account');
        localStorage.removeItem('autoreply_guest_mode');
      } catch {}

      setProviderKey(nextKey);
    });

    return () => unsubscribe();
  }, []);

  return (
    <ErrorBoundary>
      <AppProvider key={providerKey}>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
};

export default function App() {
  return <AuthIsolatedApp />;
}
