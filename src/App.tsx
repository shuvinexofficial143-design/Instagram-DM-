import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
// Deployment refresh: 2026-09-20T08:59Z
import { publicSupportPage } from './lib/navigation';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PlanBanner } from './components/Common/PlanBanner';
import { PlanRenewModal } from './components/Common/PlanRenewModal';
import { ConnectChannelModal } from './components/Common/ConnectChannelModal';
import { WorkspaceTabs } from './components/WorkspaceNavigation';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import { AppSplashScreen } from './components/Common/AppSplashScreen';
import { HomePage } from './components/Home/HomePage';
import { LoginPage } from './components/Auth/LoginPage';
import { PublicLandingPage } from './components/Public/PublicLandingPage';

const AnalyticsPage = lazy(() => import('./components/Analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const ActivityLogsPage = lazy(() => import('./components/Activity/ActivityLogsPage').then((m) => ({ default: m.ActivityLogsPage })));
const IntegrationsPage = lazy(() => import('./components/Integrations/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));
const CatalogPage = lazy(() => import('./components/Catalog/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const AutomationsPage = lazy(() => import('./components/Automations/AutomationsPage').then((m) => ({ default: m.AutomationsPage })));
const AutomationBuilder = lazy(() => import('./components/Automations/AutomationBuilder').then((m) => ({ default: m.AutomationBuilder })));
const ContactsPage = lazy(() => import('./components/Contacts/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const CrmPage = lazy(() => import('./components/CRM/CrmPage').then((m) => ({ default: m.CrmPage })));
const InboxPage = lazy(() => import('./components/Inbox/InboxPage').then((m) => ({ default: m.InboxPage })));
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const CheckoutPage = lazy(() => import('./components/Billing/CheckoutPage').then(m => ({ default: m.CheckoutPage })));
const BillingUsagePage = lazy(() => import('./components/Billing/BillingUsagePage').then((m) => ({ default: m.BillingUsagePage })));
const AboutUsPage = lazy(() => import('./components/About/AboutUsPage').then((m) => ({ default: m.AboutUsPage })));
const AdminPage = lazy(() => import('./components/Admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const ResetPasswordPage = lazy(() => import('./components/Auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const SupportPage = lazy(() => import('./components/Support/SupportPage').then((m) => ({ default: m.SupportPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="animate-pulse space-y-4 px-4 py-6 sm:px-6 lg:px-8" aria-hidden="true">
    <div className="h-7 w-40 rounded-lg bg-slate-200/80" />
    <div className="h-4 w-72 max-w-full rounded bg-slate-200/70" />
    <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
      <div className="h-28 rounded-2xl border border-slate-200 bg-white" />
      <div className="h-28 rounded-2xl border border-slate-200 bg-white" />
      <div className="h-28 rounded-2xl border border-slate-200 bg-white" />
    </div>
    <div className="h-64 rounded-2xl border border-slate-200 bg-white" />
  </div>
);

const MainContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <main className="app-unified-theme min-w-0 flex-1 bg-[#F8FAFC] pb-6 md:pb-0 md:overflow-y-auto md:overscroll-contain">
      <PlanBanner />
      <WorkspaceTabs />

      <ErrorBoundary>
        <Suspense fallback={<PageLoadingFallback />}>
          {(!activeTab || activeTab === 'home') && <HomePage />}
          {activeTab === 'analytics' && <AnalyticsPage />}
          {activeTab === 'automations' && <AutomationsPage />}
          {activeTab === 'activity' && <ActivityLogsPage />}
          {['catalog','knowledge','lead-forms'].includes(activeTab) && <CatalogPage />}
          {activeTab === 'contacts' && <ContactsPage />}
          {activeTab === 'crm' && <CrmPage />}
          {activeTab === 'inbox' && <InboxPage />}
          {activeTab === 'integrations' && <IntegrationsPage />}
          {activeTab === 'billing' && <BillingUsagePage />}
          {activeTab === 'checkout' && <CheckoutPage />}
          {activeTab === 'contact' && <SupportPage page="contact" />}
          {activeTab === 'refunds' && <SupportPage page="refunds" />}
          {activeTab === 'settings' && <SettingsPage />}
          {activeTab === 'about' && <AboutUsPage />}
          {activeTab === 'help' && <SupportPage page="help" />}
          {activeTab === 'faq' && <SupportPage page="faq" />}
          {activeTab === 'billing-help' && <SupportPage page="billing-help" />}
          {activeTab === 'privacy' && <SupportPage page="privacy" />}
          {activeTab === 'terms' && <SupportPage page="terms" />}
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary>
        <Suspense fallback={null}>
          <AutomationBuilder />
        </Suspense>
        <ConnectChannelModal />
        <PlanRenewModal />
      </ErrorBoundary>
    </main>
  );
};

const AppShell: React.FC = () => {
  const { authLoading, firebaseUser, activeTab } = useApp();
  const splashStartedAt = useRef(Date.now());
  const [splashPhase, setSplashPhase] = useState<'show' | 'exit' | 'done'>(() => typeof document === 'undefined' ? 'done' : 'show');
  const isAdminRoute =
    typeof window !== 'undefined' && window.location.pathname === '/admin';

  useEffect(() => {
    if (authLoading || splashPhase !== 'show') return;

    const elapsed = Date.now() - splashStartedAt.current;
    const remaining = Math.max(0, 1050 - elapsed);
    const timer = window.setTimeout(() => setSplashPhase('exit'), remaining);

    return () => window.clearTimeout(timer);
  }, [authLoading, splashPhase]);

  useEffect(() => {
    if (splashPhase !== 'exit') return;
    const timer = window.setTimeout(() => setSplashPhase('done'), 420);
    return () => window.clearTimeout(timer);
  }, [splashPhase]);

  // Build the destination underneath the overlay before fading it out.
  const renderDestination = () => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
    const isResetPasswordRoute = pathname === '/reset-password';
    const supportPage = publicSupportPage(pathname);
    const isPublicLandingRoute = pathname === '/';

    if (isResetPasswordRoute) return <ErrorBoundary><ResetPasswordPage /></ErrorBoundary>;

    if (!firebaseUser && (supportPage || pathname === '/about')) {
      return <ErrorBoundary><div className="min-h-[100dvh] bg-slate-50">
        <header className="public-page-header"><a href="/" className="brand">Auto Replies</a><a href="/login" className="button-secondary">Log in</a></header>
        <Suspense fallback={<PageLoadingFallback />}>
          {pathname === '/about' ? <AboutUsPage /> : <SupportPage page={supportPage} />}
        </Suspense>
      </div></ErrorBoundary>;
    }

    if (!firebaseUser) {
      return (
        <ErrorBoundary>
          {isPublicLandingRoute ? <PublicLandingPage /> : <LoginPage />}
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
  return <>
    {!authLoading ? renderDestination() : null}
    {splashPhase !== 'done' ? <AppSplashScreen exiting={splashPhase === 'exit'} /> : null}
  </>;
};

export default function App() {
  return (
    <AppProvider>
      <Suspense fallback={<AppSplashScreen />}>
        <AppShell />
      </Suspense>
    </AppProvider>
  );
}
