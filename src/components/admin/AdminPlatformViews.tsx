import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  KeyRound,
  Ban,
  CheckCircle2,
  Save,
  SlidersHorizontal,
  X,
  UserPlus,
  Lock,
  Copy,
  Check,
  Trash2,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { PlanRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const AdminUsersView: React.FC = () => {
  const { workspace } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [search, setSearch] = useState('');

  // Manage User modal state
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [manageTab, setManageTab] = useState<'profile' | 'quotas' | 'security'>('profile');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editRoleSlug, setEditRoleSlug] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [customFormLimit, setCustomFormLimit] = useState('');
  const [customSubLimit, setCustomSubLimit] = useState('');
  const [customEmailLimit, setCustomEmailLimit] = useState('');
  const [customRateLimit, setCustomRateLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [editNotice, setEditNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Password reset state inside Manage User modal
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [sendResetEmail, setSendResetEmail] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [generatedTempPw, setGeneratedTempPw] = useState<string | null>(null);
  const [copiedTempPw, setCopiedTempPw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Create User modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPlanId, setNewPlanId] = useState('');
  const [newRoleSlug, setNewRoleSlug] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [uRes, pRes] = await Promise.all([
      apiRequest<{ users: any[] }>(`/api/admin/users?q=${encodeURIComponent(search)}`),
      apiRequest<{ plans: PlanRecord[] }>('/api/admin/plans'),
    ]);
    setUsers(uRes.users);
    setPlans(pRes.plans);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const openEditor = (u: any, initialTab: 'profile' | 'quotas' | 'security' = 'profile') => {
    setSelectedUser(u);
    setManageTab(initialTab);
    setEditName(u.displayName || '');
    setEditEmail(u.email || '');
    setEditStatus(u.status === 'suspended' ? 'suspended' : 'active');
    setEditRoleSlug(u.adminRoleSlug || '');
    setSelectedPlanId(u.planId ? String(u.planId) : '');
    setSelectedBillingCycle(u.billingCycle === 'yearly' ? 'yearly' : 'monthly');
    setCustomFormLimit(u.customFormLimit != null ? String(u.customFormLimit) : '');
    setCustomSubLimit(u.customSubmissionLimit != null ? String(u.customSubmissionLimit) : '');
    setCustomEmailLimit(u.customEmailLimit != null ? String(u.customEmailLimit) : '');
    setCustomRateLimit(u.customRateLimit != null ? String(u.customRateLimit) : '');
    setResetNewPassword('');
    setGeneratedTempPw(null);
    setCopiedTempPw(false);
    setSendResetEmail(false);
    setConfirmDelete(false);
    setEditNotice(null);
  };

  const toggleSuspend = async (u: any) => {
    try {
      await apiRequest(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: { status: u.status === 'active' ? 'suspended' : 'active' },
      });
      await load();
    } catch {
      // handled cleanly by server response
    }
  };

  const saveUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSaving(true);
    setEditNotice(null);
    try {
      await apiRequest(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        body: {
          displayName: editName.trim(),
          email: editEmail.trim(),
          status: editStatus,
          adminRoleSlug: workspace?.admin?.roleSlug === 'super_admin' ? editRoleSlug : undefined,
        },
      });
      setEditNotice({ ok: true, text: 'User profile and access settings saved.' });
      await load();
    } catch (err: any) {
      setEditNotice({ ok: false, text: err.message || 'Failed to save profile changes.' });
    } finally {
      setSaving(false);
    }
  };

  const saveUserQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSaving(true);
    setEditNotice(null);
    try {
      await apiRequest(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        body: {
          planId: selectedPlanId ? Number(selectedPlanId) : undefined,
          billingCycle: selectedBillingCycle,
          customFormLimit: customFormLimit === '' ? null : Number(customFormLimit),
          customSubmissionLimit: customSubLimit === '' ? null : Number(customSubLimit),
          customEmailLimit: customEmailLimit === '' ? null : Number(customEmailLimit),
          customRateLimit: customRateLimit === '' ? null : Number(customRateLimit),
        },
      });
      setEditNotice({ ok: true, text: 'Plan and custom quota overrides saved.' });
      await load();
    } catch (err: any) {
      setEditNotice({ ok: false, text: err.message || 'Failed to update plan & quotas.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAdminPasswordReset = async (generateTemporary: boolean) => {
    if (!selectedUser) return;
    setEditNotice(null);
    setGeneratedTempPw(null);
    if (!generateTemporary && resetNewPassword.length < 8) {
      setEditNotice({ ok: false, text: 'Enter a password of at least 8 characters.' });
      return;
    }
    setResettingPw(true);
    try {
      const res = await apiRequest<{
        temporaryPassword?: string;
        emailSent?: boolean;
        message?: string;
      }>(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        body: {
          generateTemporary,
          newPassword: generateTemporary ? undefined : resetNewPassword,
          sendEmail: sendResetEmail,
        },
      });
      setResetNewPassword('');
      if (res.temporaryPassword) {
        setGeneratedTempPw(res.temporaryPassword);
      }
      setEditNotice({
        ok: true,
        text: res.emailSent
          ? 'Password reset and confirmation email dispatched.'
          : res.message || 'Password updated successfully.',
      });
      await load();
    } catch (err: any) {
      setEditNotice({ ok: false, text: err.message || 'Password reset failed.' });
    } finally {
      setResettingPw(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setDeleting(true);
    setEditNotice(null);
    try {
      await apiRequest(`/api/admin/users/${selectedUser.id}`, { method: 'DELETE' });
      setSelectedUser(null);
      await load();
    } catch (err: any) {
      setEditNotice({ ok: false, text: err.message || 'Unable to delete user.' });
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: {
          displayName: newName.trim(),
          email: newEmail.trim(),
          password: newPassword,
          planId: newPlanId ? Number(newPlanId) : undefined,
          adminRoleSlug: newRoleSlug,
        },
      });
      setShowCreateModal(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewPlanId('');
      setNewRoleSlug('');
      await load();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search registered users by email or name..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
            />
          </div>
          <span className="text-xs text-[#737373] tabular-nums whitespace-nowrap">
            {users.length} accounts
          </span>
        </div>
        <button
          onClick={() => {
            setCreateError(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Create User
        </button>
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
              <tr>
                <th className="py-3 px-6">User &amp; Role</th>
                <th className="py-3 px-4">Plan &amp; Status</th>
                <th className="py-3 px-4">Auth</th>
                <th className="py-3 px-4 text-right">Forms / Subs</th>
                <th className="py-3 px-4">Last Active</th>
                <th className="py-3 px-6 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#FAFAFA]">
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#111111]">
                        {u.displayName || u.email}
                      </span>
                      {u.adminRoleName && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[#FEF2F2] text-[#A90706] rounded">
                          <Shield className="w-2.5 h-2.5" />
                          {u.adminRoleName}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#737373] font-mono">{u.email}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-[#111111]">{u.planName || 'Free'}</div>
                    <div
                      className={`text-[11px] font-semibold capitalize ${
                        u.status === 'active' ? 'text-[#16A34A]' : 'text-[#A90706]'
                      }`}
                    >
                      {u.status}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-[11px] text-[#525252]">
                    {u.hasPassword ? 'Password' : 'Google OAuth'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                    {u.formsCount} forms · {u.totalSubmissionsCount} subs
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[#737373]">
                    <div>Joined {new Date(u.createdAt).toLocaleDateString()}</div>
                    <div>Last {new Date(u.lastLoginAt).toLocaleDateString()}</div>
                  </td>
                  <td className="py-3.5 px-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => openEditor(u, 'profile')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Manage
                      </button>
                      <button
                        onClick={() => openEditor(u, 'security')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded cursor-pointer"
                        title="Reset password"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Password
                      </button>
                      <button
                        onClick={() => toggleSuspend(u)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded cursor-pointer ${
                          u.status === 'active'
                            ? 'text-[#A90706] bg-[#FEF2F2] hover:bg-[#FEE2E2]'
                            : 'text-[#16A34A] bg-[#F0FDF4]'
                        }`}
                      >
                        {u.status === 'active' ? (
                          <>
                            <Ban className="w-3.5 h-3.5" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Activate
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Manage User Modal (Profile & Role / Plan & Quotas / Security & Password Reset) */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#E5E5E5] rounded-xl w-full max-w-lg overflow-hidden my-8 shadow-xl">
            <div className="px-6 py-4 bg-[#FAFAFA] border-b border-[#E5E5E5] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111111]">
                  Manage User — {selectedUser.displayName || selectedUser.email}
                </h3>
                <p className="text-xs text-[#737373] font-mono">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1 text-[#737373] hover:text-[#111111] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 pt-3 border-b border-[#E5E5E5] flex items-center gap-4 text-xs">
              {[
                { id: 'profile', label: 'Profile & Role' },
                { id: 'quotas', label: 'Plan & Quotas' },
                { id: 'security', label: 'Password & Security' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setManageTab(t.id as any);
                    setEditNotice(null);
                  }}
                  className={`pb-2.5 font-semibold border-b-2 transition-colors cursor-pointer ${
                    manageTab === t.id
                      ? 'border-[#A90706] text-[#A90706]'
                      : 'border-transparent text-[#525252] hover:text-[#111111]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {editNotice && (
                <div
                  className={`p-3 rounded-lg text-xs border ${
                    editNotice.ok
                      ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                      : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
                  }`}
                >
                  {editNotice.text}
                </div>
              )}

              {manageTab === 'profile' && (
                <form onSubmit={saveUserProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#D4D4D4] rounded-md"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Account Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as 'active' | 'suspended')}
                        className="w-full px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                    {workspace?.admin?.roleSlug === 'super_admin' && (
                      <div>
                        <label className="block text-xs font-semibold mb-1">Platform Role</label>
                        <select
                          value={editRoleSlug}
                          onChange={(e) => setEditRoleSlug(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                        >
                          <option value="">Customer</option>
                          <option value="support">Support</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-3 border-t border-[#EFEFEF]">
                    <button
                      type="button"
                      onClick={() => setSelectedUser(null)}
                      className="px-4 py-2 text-xs font-semibold text-[#525252] cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer disabled:opacity-60"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              )}

              {manageTab === 'quotas' && (
                <form onSubmit={saveUserQuotas} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Assigned Plan</label>
                      <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Billing Cycle</label>
                      <select
                        value={selectedBillingCycle}
                        onChange={(e) =>
                          setSelectedBillingCycle(e.target.value as 'monthly' | 'yearly')
                        }
                        className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Custom Form Limit</label>
                      <input
                        type="number"
                        placeholder="Plan default"
                        value={customFormLimit}
                        onChange={(e) => setCustomFormLimit(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Custom Submissions/mo
                      </label>
                      <input
                        type="number"
                        placeholder="Plan default"
                        value={customSubLimit}
                        onChange={(e) => setCustomSubLimit(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Custom Emails/mo</label>
                      <input
                        type="number"
                        placeholder="Plan default"
                        value={customEmailLimit}
                        onChange={(e) => setCustomEmailLimit(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Custom Rate/min</label>
                      <input
                        type="number"
                        placeholder="Plan default"
                        value={customRateLimit}
                        onChange={(e) => setCustomRateLimit(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#EFEFEF]">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/users/${selectedUser.id}`, {
                          method: 'PATCH',
                          body: { resetUsage: true },
                        });
                        setEditNotice({ ok: true, text: 'Monthly usage counters reset to 0.' });
                        await load();
                      }}
                      className="text-xs font-semibold text-[#A90706] hover:underline cursor-pointer"
                    >
                      Reset Monthly Usage
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer"
                    >
                      {saving ? 'Saving...' : 'Save Quotas'}
                    </button>
                  </div>
                </form>
              )}

              {manageTab === 'security' && (
                <div className="space-y-5">
                  <div className="p-3.5 bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#111111]">Password Authentication</div>
                      <div className="text-[#737373] mt-0.5">
                        {selectedUser.hasPassword
                          ? 'Active — user can sign in with email & password.'
                          : 'Not yet configured — resetting sets an email/password credential.'}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        selectedUser.hasPassword
                          ? 'bg-[#F0FDF4] text-[#15803D]'
                          : 'bg-[#F5F5F5] text-[#525252]'
                      }`}
                    >
                      {selectedUser.hasPassword ? 'Enabled' : 'OAuth Only'}
                    </span>
                  </div>

                  {generatedTempPw && (
                    <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg space-y-2">
                      <div className="text-xs font-bold text-[#15803D]">
                        New Temporary Password Generated (shown once)
                      </div>
                      <div className="flex items-center justify-between gap-2 bg-white border border-[#BBF7D0] rounded px-3 py-2">
                        <code className="text-xs font-mono font-bold text-[#111111] select-all">
                          {generatedTempPw}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(generatedTempPw);
                            setCopiedTempPw(true);
                            setTimeout(() => setCopiedTempPw(false), 2000);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D] cursor-pointer"
                        >
                          {copiedTempPw ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Set New Password Manually
                      </label>
                      <input
                        type="password"
                        minLength={8}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="Enter new password (min 8 characters)"
                        className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-[#525252] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendResetEmail}
                        onChange={(e) => setSendResetEmail(e.target.checked)}
                        className="accent-[#A90706]"
                      />
                      Send password reset confirmation email via Resend
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={resettingPw || resetNewPassword.length < 8}
                        onClick={() => handleAdminPasswordReset(false)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111111] hover:bg-[#262626] rounded-md cursor-pointer disabled:opacity-50"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        {resettingPw ? 'Updating...' : 'Set Password'}
                      </button>
                      <button
                        type="button"
                        disabled={resettingPw}
                        onClick={() => handleAdminPasswordReset(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-md cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Generate Temporary Password
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  {selectedUser.id !== workspace?.user.id && (
                    <div className="pt-4 border-t border-[#E5E5E5] space-y-2.5">
                      <div className="text-xs font-bold text-[#A90706]">Danger Zone</div>
                      {!confirmDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#A90706] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete User Account
                        </button>
                      ) : (
                        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg space-y-2.5">
                          <p className="text-xs text-[#A90706]">
                            Permanently delete <strong>{selectedUser.email}</strong> along with all
                            forms, submissions, and billing records?
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={handleDeleteUser}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#A90706] rounded cursor-pointer disabled:opacity-60"
                            >
                              {deleting ? 'Deleting...' : 'Confirm Permanent Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(false)}
                              className="px-3 py-1.5 text-xs font-semibold text-[#525252] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateUser}
            className="bg-white border border-[#E5E5E5] rounded-xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <div>
                <h3 className="text-base font-bold text-[#111111]">Create User Account</h3>
                <p className="text-xs text-[#737373]">
                  User can sign in immediately with these email &amp; password credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4 text-[#737373]" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#A90706] rounded">
                {createError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">Full Name</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jordan Lee"
                className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Email Address</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jordan@company.com"
                className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Initial Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Initial Plan</label>
                <select
                  value={newPlanId}
                  onChange={(e) => setNewPlanId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                >
                  <option value="">Free (Default)</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {workspace?.admin?.roleSlug === 'super_admin' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Platform Role</label>
                  <select
                    value={newRoleSlug}
                    onChange={(e) => setNewRoleSlug(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                  >
                    <option value="">Customer</option>
                    <option value="support">Support</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#EFEFEF]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-[#525252] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const AdminFormsView: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const res = await apiRequest<{ forms: any[] }>('/api/admin/forms');
    setRows(res.forms);
  };
  useEffect(() => {
    load();
  }, []);

  const moderate = async (id: number, body: Record<string, unknown>) => {
    await apiRequest(`/api/admin/forms/${id}`, { method: 'PATCH', body });
    await load();
  };

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E5E5]">
        <h2 className="text-base font-bold text-[#111111]">Platform Forms Directory</h2>
        <p className="text-xs text-[#525252]">
          Suspend abusive forms or revoke compromised secret API keys across all tenants.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
            <tr>
              <th className="py-3 px-6">Form &amp; ID</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Submissions</th>
              <th className="py-3 px-6 text-right">Moderation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEFEF]">
            {rows.map((f) => (
              <tr key={f.id}>
                <td className="py-3.5 px-6">
                  <div className="font-semibold text-[#111111]">{f.title}</div>
                  <div className="font-mono text-[11px] text-[#737373]">{f.formKey}</div>
                </td>
                <td className="py-3.5 px-4">{f.ownerEmail}</td>
                <td className="py-3.5 px-4 capitalize font-semibold">{f.status}</td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">{f.submissionCount}</td>
                <td className="py-3.5 px-6 text-right whitespace-nowrap">
                  <div className="inline-flex gap-1.5">
                    <button
                      onClick={() => moderate(f.id, { revokeApiKey: true })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded cursor-pointer"
                    >
                      <KeyRound className="w-3 h-3" />
                      Revoke Key
                    </button>
                    <button
                      onClick={() =>
                        moderate(f.id, {
                          status: f.status === 'suspended' ? 'published' : 'suspended',
                        })
                      }
                      className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                        f.status === 'suspended'
                          ? 'bg-[#F0FDF4] text-[#16A34A]'
                          : 'bg-[#FEF2F2] text-[#A90706]'
                      }`}
                    >
                      {f.status === 'suspended' ? 'Restore' : 'Suspend'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AdminSubmissionsView: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      apiRequest<{ submissions: any[] }>(
        `/api/admin/submissions?q=${encodeURIComponent(search)}`
      ).then((res) => setRows(res.submissions));
    }, 150);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search platform submissions by customer email, form title, or payload..."
          className="w-full max-w-md px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
        />
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
              <tr>
                <th className="py-3 px-6">Form &amp; Owner</th>
                <th className="py-3 px-4">Payload Preview</th>
                <th className="py-3 px-4">Email Status</th>
                <th className="py-3 px-4">Origin / IP</th>
                <th className="py-3 px-6 text-right">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 px-6">
                    <div className="font-semibold text-[#111111]">{r.formTitle}</div>
                    <div className="text-[11px] text-[#737373]">{r.customerEmail}</div>
                  </td>
                  <td className="py-3 px-4 max-w-xs truncate font-mono text-[11px] text-[#525252]">
                    {JSON.stringify(r.payload)}
                  </td>
                  <td className="py-3 px-4 capitalize font-semibold">{r.emailDeliveryStatus}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#737373]">
                    {r.originDomain || r.sourceIp || '—'}
                  </td>
                  <td className="py-3 px-6 text-right font-mono text-[#737373]">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AdminApiMonitoringView: React.FC = () => {
  const [data, setData] = useState<any | null>(null);
  const [limits, setLimits] = useState({
    globalRequestsPerMin: 1200,
    perIpRequestsPerMin: 120,
    maxPayloadKb: 512,
    maxFileUploadMb: 5,
    blockSuspiciousOrigins: true,
  });
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = async () => {
    const res = await apiRequest<any>('/api/admin/api-monitoring');
    setData(res);
    if (res.globalLimits) setLimits(res.globalLimits);
  };

  useEffect(() => {
    load();
  }, []);

  const saveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/api-monitoring/limits', { method: 'PUT', body: limits });
    setSavedMsg('Global API rate limits updated.');
    setTimeout(() => setSavedMsg(null), 2500);
  };

  if (!data) return <div className="p-8 bg-white border border-[#E5E5E5] rounded-lg text-xs">Loading API telemetry...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          ['Total API Requests', data.summary.totalRequests, 'text-[#111111]'],
          ['Successful (2xx/3xx)', data.summary.successfulRequests, 'text-[#16A34A]'],
          ['Failed (4xx/5xx)', data.summary.failedRequests, 'text-[#A90706]'],
          ['Rate-Limit Events', data.summary.rateLimitedEvents, 'text-[#D97706]'],
          ['Suspicious Traffic', data.summary.suspiciousTraffic, 'text-[#A90706]'],
        ].map(([label, val, tone]) => (
          <div key={String(label)} className="bg-white border border-[#E5E5E5] rounded-lg p-5">
            <div className="text-xs text-[#525252]">{label}</div>
            <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${tone}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Global Rate Limit Configuration */}
      <form
        onSubmit={saveLimits}
        className="bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Global API Rate Limit Controls</h3>
            <p className="text-xs text-[#525252]">
              Server-side sliding-window protections applied across all public submission endpoints
            </p>
          </div>
          {savedMsg && <span className="text-xs font-semibold text-[#16A34A]">{savedMsg}</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Global Req / Min</label>
            <input
              type="number"
              value={limits.globalRequestsPerMin}
              onChange={(e) => setLimits({ ...limits, globalRequestsPerMin: Number(e.target.value) })}
              className="w-full px-3 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Per-IP Req / Min</label>
            <input
              type="number"
              value={limits.perIpRequestsPerMin}
              onChange={(e) => setLimits({ ...limits, perIpRequestsPerMin: Number(e.target.value) })}
              className="w-full px-3 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Max Payload (KB)</label>
            <input
              type="number"
              value={limits.maxPayloadKb}
              onChange={(e) => setLimits({ ...limits, maxPayloadKb: Number(e.target.value) })}
              className="w-full px-3 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Max Upload (MB)</label>
            <input
              type="number"
              value={limits.maxFileUploadMb}
              onChange={(e) => setLimits({ ...limits, maxFileUploadMb: Number(e.target.value) })}
              className="w-full px-3 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded"
            />
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] rounded-md cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          Save Rate Limits
        </button>
      </form>

      {/* Recent API Logs */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E5E5] font-bold text-sm text-[#111111]">
          Recent API Request &amp; Error Logs
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
              <tr>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Endpoint</th>
                <th className="py-2.5 px-4">IP / Origin</th>
                <th className="py-2.5 px-4 text-right">Latency</th>
                <th className="py-2.5 px-4">Error / Flags</th>
                <th className="py-2.5 px-4 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {data.recentLogs.map((l: any) => (
                <tr key={l.id}>
                  <td
                    className={`py-2.5 px-4 font-mono font-bold ${
                      l.statusCode >= 400 ? 'text-[#A90706]' : 'text-[#16A34A]'
                    }`}
                  >
                    {l.statusCode}
                  </td>
                  <td className="py-2.5 px-4 font-mono">
                    {l.method} {l.endpoint}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-[#525252]">
                    {l.originDomain || l.ipAddress || '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {l.responseTimeMs}ms
                  </td>
                  <td className="py-2.5 px-4 text-[#A90706] max-w-xs truncate">
                    {l.isRateLimited && 'Rate Limited · '}
                    {l.isSuspicious && 'Suspicious · '}
                    {l.errorMessage || '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-[#737373]">
                    {new Date(l.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
