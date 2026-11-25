import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Inbox,
  Activity,
  Mail,
  Send,
  BarChart3,
  CreditCard,
  Repeat,
  Receipt,
  FileSpreadsheet,
  Gauge,
  Settings,
  ShieldCheck,
  ScrollText,
  ArrowLeft,
  Menu,
  X,
  LogOut,
  Lock,
  LayoutGrid,
  Megaphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { AdminDashboardView } from './AdminDashboardView';
import { AdminResendView } from './AdminResendView';
import { AdminEmailLogsView, AdminEmailUsageView } from './AdminEmailViews';
import {
  AdminInvoicesView,
  AdminPlansView,
  AdminSubscriptionsView,
  AdminTransactionsView,
} from './AdminBillingViews';
import {
  AdminApiMonitoringView,
  AdminFormsView,
  AdminSubmissionsView,
  AdminUsersView,
} from './AdminPlatformViews';
import {
  AdminAuditLogsView,
  AdminGlobalSettingsView,
  AdminRolesView,
  AdminUsageLimitsView,
} from './AdminSystemViews';
import { AdminWidgetsView } from '../../widget-admin/AdminWidgetsView';
import { AdminCampaignsView } from '../../campaigns/AdminCampaignsView';

type AdminSection =
  | 'dashboard'
  | 'users'
  | 'widgets'
  | 'forms'
  | 'submissions'
  | 'api-monitoring'
  | 'campaigns'
  | 'resend'
  | 'email-logs'
  | 'email-usage'
  | 'plans'
  | 'subscriptions'
  | 'transactions'
  | 'invoices'
  | 'usage-limits'
  | 'global-settings'
  | 'admin-roles'
  | 'audit-logs';

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{ id: AdminSection; label: string; icon: React.ComponentType<any>; perm?: string }>;
}> = [
  {
    title: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'admin.dashboard.view' }],
  },
  {
    title: 'Platform',
    items: [
      { id: 'users', label: 'Users', icon: Users, perm: 'admin.users.view' },
      { id: 'widgets', label: 'Website Widgets', icon: LayoutGrid, perm: 'admin.forms.view' },
      { id: 'forms', label: 'Forms', icon: FileText, perm: 'admin.forms.view' },
      { id: 'submissions', label: 'Submissions', icon: Inbox, perm: 'admin.submissions.view' },
      { id: 'api-monitoring', label: 'API Monitoring', icon: Activity, perm: 'admin.api.view' },
    ],
  },
  {
    title: 'Email',
    items: [
      { id: 'campaigns', label: 'Email Campaigns', icon: Megaphone, perm: 'admin.emails.view' },
      { id: 'resend', label: 'Resend Configuration', icon: Send, perm: 'admin.resend.view' },
      { id: 'email-logs', label: 'Email Logs', icon: Mail, perm: 'admin.emails.view' },
      { id: 'email-usage', label: 'Email Usage', icon: BarChart3, perm: 'admin.emails.view' },
    ],
  },
  {
    title: 'Billing',
    items: [
      { id: 'plans', label: 'Plans & Pricing', icon: CreditCard, perm: 'admin.billing.view' },
      { id: 'subscriptions', label: 'Subscriptions', icon: Repeat, perm: 'admin.billing.view' },
      { id: 'transactions', label: 'Transactions', icon: Receipt, perm: 'admin.billing.view' },
      { id: 'invoices', label: 'Invoices', icon: FileSpreadsheet, perm: 'admin.billing.view' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'usage-limits', label: 'Usage Limits', icon: Gauge, perm: 'admin.billing.view' },
      { id: 'global-settings', label: 'Global Settings', icon: Settings, perm: 'admin.settings.manage' },
      { id: 'admin-roles', label: 'Admin Roles', icon: ShieldCheck, perm: 'admin.roles.manage' },
      { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText, perm: 'admin.audit.view' },
    ],
  },
];

export const AdminPortal: React.FC<{ onExitAdmin: () => void }> = ({ onExitAdmin }) => {
  const { workspace, logout, refreshWorkspace } = useAuth();
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);

  const admin = workspace?.admin;

  if (!admin) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-8 max-w-md w-full text-center space-y-4">
          <Lock className="w-8 h-8 text-[#A90706] mx-auto" />
          <h1 className="text-lg font-bold text-[#111111]">Administrator Access Required</h1>
          <p className="text-sm text-[#525252]">
            Your account ({workspace?.user.email}) does not have platform administrator privileges.
          </p>
          <button
            onClick={onExitAdmin}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#111111] rounded-lg cursor-pointer"
          >
            Return to Customer Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Enforce 2FA verification screen if TOTP is enabled on this admin account
  if (admin.totpEnabled && !admin.totpVerified) {
    const verify = async (e: React.FormEvent) => {
      e.preventDefault();
      setTotpError(null);
      try {
        await apiRequest('/api/admin/2fa/verify', { method: 'POST', body: { code: totpCode } });
        await refreshWorkspace();
      } catch (err: any) {
        setTotpError(err.message || 'Invalid 6-digit code');
      }
    };
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
        <form
          onSubmit={verify}
          className="bg-white border border-[#E5E5E5] rounded-xl p-8 max-w-sm w-full space-y-4"
        >
          <h1 className="text-lg font-bold text-[#111111]">Admin 2FA Verification</h1>
          <p className="text-xs text-[#525252]">
            Enter the 6-digit TOTP code from your authenticator app to unlock the Super Admin Panel.
          </p>
          {totpError && (
            <div className="p-3 bg-[#FEF2F2] text-xs text-[#A90706] rounded">{totpError}</div>
          )}
          <input
            type="text"
            maxLength={6}
            required
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="000000"
            className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-widest border border-[#D4D4D4] rounded-lg"
          />
          <button
            type="submit"
            className="w-full py-2.5 text-sm font-semibold text-white bg-[#A90706] rounded-lg cursor-pointer"
          >
            Verify Session
          </button>
        </form>
      </div>
    );
  }

  const hasPerm = (perm?: string) =>
    !perm || admin.roleSlug === 'super_admin' || admin.permissions.includes(perm);

  const activeItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === section);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-[#E5E5E5]">
      <div className="h-16 px-5 border-b border-[#E5E5E5] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#A90706] flex items-center justify-center text-white font-bold text-sm">
            B
          </div>
          <span className="font-bold text-sm text-[#111111] whitespace-nowrap">
            BrosDev Admin
          </span>
        </div>
        <button
          onClick={() => setMobileMenu(false)}
          className="lg:hidden p-1 text-[#525252] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => hasPerm(item.perm));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold text-[#737373] tracking-wide">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSection(item.id);
                        setMobileMenu(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#FEF2F2] text-[#A90706] font-semibold'
                          : 'text-[#333333] hover:bg-[#F5F5F5]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#E5E5E5] space-y-1">
        <button
          onClick={onExitAdmin}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] rounded-md cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Customer Dashboard
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#525252] hover:text-[#A90706] rounded-md cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileMenu(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-[#E5E5E5] px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenu(true)}
              className="lg:hidden p-1.5 text-[#525252] hover:text-[#111111] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-bold text-[#111111] truncate">
              Super Admin / {activeItem?.label || 'Dashboard'}
            </div>
          </div>

          <div className="text-xs text-[#525252] whitespace-nowrap shrink-0">
            <span className="font-semibold text-[#A90706]">{admin.roleName}</span> ·{' '}
            <span>{workspace?.user.email}</span>
          </div>
        </header>

        <main className="p-6 md:p-8 max-w-[1400px] w-full mx-auto">
          {section === 'dashboard' && <AdminDashboardView />}
          {section === 'users' && <AdminUsersView />}
          {section === 'widgets' && <AdminWidgetsView />}
          {section === 'forms' && <AdminFormsView />}
          {section === 'submissions' && <AdminSubmissionsView />}
          {section === 'api-monitoring' && <AdminApiMonitoringView />}
          {section === 'campaigns' && <AdminCampaignsView />}
          {section === 'resend' && <AdminResendView />}
          {section === 'email-logs' && <AdminEmailLogsView />}
          {section === 'email-usage' && <AdminEmailUsageView />}
          {section === 'plans' && <AdminPlansView />}
          {section === 'subscriptions' && <AdminSubscriptionsView />}
          {section === 'transactions' && <AdminTransactionsView />}
          {section === 'invoices' && <AdminInvoicesView />}
          {section === 'usage-limits' && <AdminUsageLimitsView />}
          {section === 'global-settings' && <AdminGlobalSettingsView />}
          {section === 'admin-roles' && <AdminRolesView on2faChanged={refreshWorkspace} />}
          {section === 'audit-logs' && <AdminAuditLogsView />}
        </main>
      </div>
    </div>
  );
};
