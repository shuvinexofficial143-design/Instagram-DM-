import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { auth, onAuthStateChanged, signInAnonymously } from './lib/supabase';
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

// Install once, before any provider effects run. Every same-origin /api request made by
// an authenticated user carries a Supabase access token.
if (typeof window !== 'undefined' && !(window as any).__autoreplyAuthenticatedFetchInstalled) {
  const originalFetch = window.fetch.bind(window);
  (window as any).__autoreplyAuthenticatedFetchInstalled = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const rawUrl =
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : input instanceof Request
            ? input.url
            : '';
      const resolvedUrl = rawUrl ? new URL(rawUrl, window.location.origin) : null;
      const isSameOriginApi =
        resolvedUrl?.origin === window.location.origin && resolvedUrl.pathname.startsWith('/api/');

      if (isSameOriginApi && auth?.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        if (init?.headers) {
          new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        }
        headers.set('Authorization', `Bearer ${idToken}`);

        return originalFetch(input, {
          ...init,
          headers,
          credentials: init?.credentials || 'same-origin',
        });
      }
    } catch (error) {
      console.warn('[AUTHENTICATED_FETCH_WARN]', error);
    }

    return originalFetch(input, init);
  };
}

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

const AuthIsolatedApp: React.FC = () => {
  const [providerKey, setProviderKey] = useState<string>('auth-boot');
  const [identityReady, setIdentityReady] = useState<boolean>(false);

  useEffect(() => {
    if (!auth) {
      setProviderKey('public-workspace');
      setIdentityReady(true);
      return;
    }

    let identitySequence = 0;
    let anonymousAttempted = false;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const runId = ++identitySequence;
      setIdentityReady(false);

      void (async () => {
        if (currentUser) {
          if (runId !== identitySequence) return;
          setProviderKey(`supabase-user:${currentUser.uid}`);
          setIdentityReady(true);
          return;
        }

        if (!anonymousAttempted) {
          anonymousAttempted = true;
          try {
            await signInAnonymously();
            return;
          } catch (error) {
            console.warn('[ANONYMOUS_AUTH_FALLBACK]', error);
          }
        }

        if (runId !== identitySequence) return;
        try {
          localStorage.setItem('autoreply_guest_mode', 'true');
        } catch {}
        setProviderKey('public-workspace');
        setIdentityReady(true);
      })();
    });

    return () => {
      identitySequence += 1;
      unsubscribe();
    };
  }, []);

  if (!identityReady) {
    return (
      <ErrorBoundary>
        <IntroSplash onComplete={() => {}} />
      </ErrorBoundary>
    );
  }

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
