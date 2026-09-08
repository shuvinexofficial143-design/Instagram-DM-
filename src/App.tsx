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

// Install once, before any provider effects run. Every same-origin /api request made by
// an authenticated user carries a Firebase ID token. The server verifies that token and
// replaces any client-supplied userId with the verified Firebase UID.
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
  const { firebaseUser, isGuestMode, authLoading } = useApp();
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // While Firebase is verifying the initial identity, do not render another user's state.
  if (authLoading && !isGuestMode) {
    return (
      <ErrorBoundary>
        <IntroSplash onComplete={() => {}} />
      </ErrorBoundary>
    );
  }

  const isAuthenticated = Boolean(firebaseUser || isGuestMode);

  if (!isAuthenticated) {
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
  const [identityReady, setIdentityReady] = useState<boolean>(false);

  useEffect(() => {
    if (!auth) {
      setProviderKey('auth-unavailable');
      setIdentityReady(true);
      return;
    }

    let identitySequence = 0;

    // Remount the complete application provider whenever the Firebase identity changes.
    // This makes every in-memory collection and Instagram state belong to exactly one UID.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const runId = ++identitySequence;
      setIdentityReady(false);

      void (async () => {
        try {
          localStorage.removeItem('autoreply_connected_instagram_account');
          if (currentUser) localStorage.removeItem('autoreply_guest_mode');
        } catch {}

        if (currentUser) {
          // Establish the signed HttpOnly server session before the dashboard is usable.
          // This guarantees Instagram OAuth opens already bound to the verified Firebase UID.
          try {
            await window.fetch(`/api/instagram/account?userId=${encodeURIComponent(currentUser.uid)}`, {
              method: 'GET',
              cache: 'no-store',
              credentials: 'same-origin',
            });
          } catch (error) {
            console.warn('[AUTH_SESSION_PRIME_WARN]', error);
          }

          if (runId !== identitySequence) return;
          setProviderKey(`firebase-user:${currentUser.uid}`);
          setIdentityReady(true);
          return;
        }

        // Firebase signed out: explicitly destroy the server-side signed session cookie
        // before showing login/guest UI, so a previous Gmail can never leak into the next flow.
        try {
          await window.fetch('/api/instagram/account', {
            method: 'GET',
            headers: { 'X-AutoReply-Clear-Session': '1' },
            cache: 'no-store',
            credentials: 'same-origin',
          });
        } catch (error) {
          console.warn('[AUTH_SESSION_CLEAR_WARN]', error);
        }

        if (runId !== identitySequence) return;
        setProviderKey('firebase-signed-out');
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
