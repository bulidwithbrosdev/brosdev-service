import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthGate } from './components/AuthGate';
import { CustomerPortal } from './components/customer/CustomerPortal';
import { AdminPortal } from './components/admin/AdminPortal';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

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

  const isAdminRoute = pathname.startsWith('/admin');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-[#525252]">
          <div className="w-6 h-6 rounded bg-[#A90706] flex items-center justify-center text-white font-bold text-xs">
            B
          </div>
          <span>Loading BrosDev Forms...</span>
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
