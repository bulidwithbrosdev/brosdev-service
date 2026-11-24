import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Users,
  CreditCard,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Plus,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FormRecord } from '../../types';
import { DashboardView } from './DashboardView';
import { FormsListView } from './FormsListView';
import { FormBuilderView } from './FormBuilderView';
import { IntegrationView } from './IntegrationView';
import { SubmissionsView } from './SubmissionsView';
import { TeamView } from './TeamView';
import { BillingView } from './BillingView';
import { AccountSettingsView } from './AccountSettingsView';
import { UpgradeModal } from '../shared/UpgradeModal';
import { apiRequest } from '../../lib/api';
import { hasPlanFeature, isFormLimitReached, type PlanLockKey } from '../../lib/planLimits';

type CustomerRoute =
  | { view: 'dashboard' }
  | { view: 'forms' }
  | { view: 'builder'; formId: number }
  | { view: 'integration'; form: FormRecord; initialSecret?: string }
  | { view: 'submissions'; formId?: number }
  | { view: 'team' }
  | { view: 'billing'; highlightPlan?: string }
  | { view: 'settings' };

export const CustomerPortal: React.FC<{ onEnterAdmin: () => void }> = ({ onEnterAdmin }) => {
  const { workspace, logout, refreshWorkspace } = useAuth();
  const [route, setRoute] = useState<CustomerRoute>({ view: 'dashboard' });
  const [mobileMenu, setMobileMenu] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [upgradeLockKey, setUpgradeLockKey] = useState<PlanLockKey | null>(null);

  const formLimitReached = isFormLimitReached(workspace);
  const canManageTeam = hasPlanFeature(workspace, 'teamMembers');

  const handleQuickCreateForm = async () => {
    if (formLimitReached) {
      setUpgradeLockKey('formsLimit');
      return;
    }
    setQuickCreating(true);
    try {
      const res = await apiRequest<{ form: FormRecord }>('/api/forms', {
        method: 'POST',
        body: {
          title: 'Contact Form',
          description: 'Send us a message and we will respond promptly.',
          status: 'published',
        },
      });
      await refreshWorkspace();
      setRoute({ view: 'builder', formId: res.form.id });
    } catch {
      setUpgradeLockKey('formsLimit');
    } finally {
      setQuickCreating(false);
    }
  };

  const navItems: Array<{
    id: 'dashboard' | 'forms' | 'submissions' | 'team' | 'billing' | 'settings';
    label: string;
    icon: React.ComponentType<any>;
    locked?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'forms', label: 'Forms', icon: FileText },
    { id: 'submissions', label: 'Submissions', icon: Inbox },
    { id: 'team', label: 'Team', icon: Users, locked: !canManageTeam },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
    { id: 'settings', label: 'Account Settings', icon: Settings },
  ];

  const pageTitle =
    route.view === 'dashboard'
      ? 'Dashboard'
      : route.view === 'forms'
        ? 'Forms'
        : route.view === 'builder'
          ? 'Form Builder'
          : route.view === 'integration'
            ? 'Integration Code'
            : route.view === 'submissions'
              ? 'Submissions'
              : route.view === 'team'
                ? 'Team Collaboration'
                : route.view === 'settings'
                  ? 'Account Settings'
                  : 'Billing & Usage';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-[#E5E5E5]">
      <div className="h-16 px-5 border-b border-[#E5E5E5] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#A90706] flex items-center justify-center text-white font-bold text-sm">
            B
          </div>
          <span className="font-bold text-base tracking-tight text-[#111111] whitespace-nowrap">
            BrosDev Forms
          </span>
        </div>
        <button
          onClick={() => setMobileMenu(false)}
          className="lg:hidden p-1 text-[#525252] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            route.view === item.id ||
            (item.id === 'forms' && (route.view === 'builder' || route.view === 'integration'));
          return (
            <button
              key={item.id}
              onClick={() => {
                setRoute({ view: item.id } as CustomerRoute);
                setMobileMenu(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#FEF2F2] text-[#A90706] font-semibold'
                  : 'text-[#333333] hover:bg-[#F5F5F5]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.locked && <Lock className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />}
            </button>
          );
        })}

        {workspace?.admin && (
          <div className="pt-4 mt-4 border-t border-[#E5E5E5]">
            <button
              onClick={() => {
                setMobileMenu(false);
                onEnterAdmin();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#111111] hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-[#A90706] shrink-0" />
              <span>Super Admin Panel</span>
            </button>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-[#E5E5E5] space-y-3">
        <div className="text-xs">
          <div className="font-semibold text-[#111111] truncate">
            {workspace?.user.displayName || workspace?.user.email}
          </div>
          <div className="text-[#737373] truncate mt-0.5 tabular-nums">
            {workspace?.plan?.name || 'Free'} Plan · {workspace?.usage.submissionsCount ?? 0}/
            {workspace?.limits.maxSubmissions ?? 100} subs
          </div>
          {workspace?.user.accountId && (
            <div className="font-mono text-[11px] text-[#737373] truncate mt-1">
              ID: {workspace.user.accountId}
            </div>
          )}
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#525252] hover:text-[#A90706] hover:bg-[#FEF2F2] rounded-md transition-colors cursor-pointer"
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

      {/* Main Viewport */}
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
              Workspace / {pageTitle}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {route.view !== 'builder' && (
              <button
                onClick={handleQuickCreateForm}
                disabled={quickCreating}
                title={formLimitReached ? 'Form limit reached — click to upgrade' : 'Create a new form'}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                  formLimitReached
                    ? 'border border-[#D4D4D4] bg-[#F5F5F5] text-[#737373] hover:border-[#A90706] hover:text-[#A90706]'
                    : 'text-white bg-[#A90706] hover:bg-[#8C0605]'
                }`}
              >
                {formLimitReached ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    Form Limit Reached
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    {quickCreating ? 'Creating...' : 'Create Form'}
                  </>
                )}
              </button>
            )}
          </div>
        </header>

        <main className="p-6 md:p-8 max-w-[1400px] w-full mx-auto">
          {route.view === 'dashboard' && (
            <DashboardView
              onCreateForm={handleQuickCreateForm}
              onOpenSubmissions={(formId) => setRoute({ view: 'submissions', formId })}
              onOpenBilling={() => setRoute({ view: 'billing' })}
              onRequestUpgrade={(key) => setUpgradeLockKey(key)}
            />
          )}
          {route.view === 'forms' && (
            <FormsListView
              onEditForm={(formId) => setRoute({ view: 'builder', formId })}
              onOpenIntegration={(form, initialSecret) =>
                setRoute({ view: 'integration', form, initialSecret })
              }
              onOpenSubmissions={(formId) => setRoute({ view: 'submissions', formId })}
              onRequestUpgrade={(key) => setUpgradeLockKey(key)}
            />
          )}
          {route.view === 'builder' && (
            <FormBuilderView
              formId={route.formId}
              onBack={() => setRoute({ view: 'forms' })}
              onOpenIntegration={(form) => setRoute({ view: 'integration', form })}
              onRequestUpgrade={(key) => setUpgradeLockKey(key)}
            />
          )}
          {route.view === 'integration' && (
            <IntegrationView
              form={route.form}
              initialSecretKey={route.initialSecret}
              onBack={() => setRoute({ view: 'forms' })}
              onRequestUpgrade={(key) => setUpgradeLockKey(key)}
            />
          )}
          {route.view === 'submissions' && (
            <SubmissionsView
              initialFormId={route.formId}
              onRequestUpgrade={(key) => setUpgradeLockKey(key)}
            />
          )}
          {route.view === 'team' && workspace && (
            <TeamView
              workspace={workspace}
              onRequestUpgrade={(key) => setUpgradeLockKey(key)}
            />
          )}
          {route.view === 'billing' && (
            <BillingView highlightPlanSlug={route.highlightPlan} />
          )}
          {route.view === 'settings' && (
            <AccountSettingsView onOpenBilling={() => setRoute({ view: 'billing' })} />
          )}
        </main>
      </div>

      {workspace && (
        <UpgradeModal
          lockKey={upgradeLockKey}
          workspace={workspace}
          onClose={() => setUpgradeLockKey(null)}
          onUpgrade={(slug) => {
            setUpgradeLockKey(null);
            setRoute({ view: 'billing', highlightPlan: slug });
          }}
        />
      )}
    </div>
  );
};
