import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthGate } from './components/AuthGate';
import { CustomerPortal } from './components/customer/CustomerPortal';
import { AdminPortal } from './components/admin/AdminPortal';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { HostedWidgetPage } from './widget-renderer/HostedWidgetPage';
import { UnsubscribePage } from './campaigns/UnsubscribePage';

function AppShell() {
  const { isAuthenticated, workspace, loading } = useAuth();
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
    }
  };

  // Public One-Click / Confirmation Unsubscribe Page (/unsubscribe?token=...)
  if (pathname === '/unsubscribe' || pathname === '/unsubscribe/') {
    return <UnsubscribePage />;
  }

  // Public Hosted Widget Pages (/w/:publicId) render without requiring login
  const hostedWidgetMatch = pathname.match(/^\/w\/([a-zA-Z0-9_-]{4,64})\/?$/);
  if (hostedWidgetMatch) {
    return <HostedWidgetPage publicId={hostedWidgetMatch[1]} />;
  }

  const isAdminRoute = pathname.startsWith('/admin');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-[#525252]">
          <div className="w-6 h-6 rounded bg-[#A90706] flex items-center justify-center text-white font-bold text-xs">
            B
          </div>
          <span>Loading BrosDev Services...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !workspace) {
    return <AuthGate isAdminRoute={isAdminRoute} />;
  }

  if (isAdminRoute) {
    return <AdminPortal onExitAdmin={() => navigate('/')} />;
  }

  return <CustomerPortal onEnterAdmin={() => navigate('/admin')} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
