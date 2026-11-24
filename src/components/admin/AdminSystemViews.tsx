import React, { useEffect, useState } from 'react';
import { Save, Shield, Trash2, RefreshCw, KeyRound } from 'lucide-react';
import { apiRequest } from '../../lib/api';

export const AdminUsageLimitsView: React.FC = () => {
  const [subs, setSubs] = useState<any[]>([]);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const res = await apiRequest<{ subscriptions: any[] }>('/api/admin/subscriptions');
    setSubs(res.subscriptions);
  };

  useEffect(() => {
    load();
  }, []);

  const resetAll = async () => {
    setResetting(true);
    try {
      const res = await apiRequest<{ periodMonth: string }>('/api/admin/usage/reset-all', {
        method: 'POST',
      });
      setMsg(`Reset monthly usage counters for all accounts (${res.periodMonth}).`);
      await load();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#111111]">Usage Quotas &amp; Monthly Reset</h2>
          <p className="text-xs text-[#525252]">
            Track per-customer consumption percentages and trigger monthly usage resets.
          </p>
        </div>
        <button
          onClick={resetAll}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
          Reset All Monthly Counters
        </button>
      </div>

      {msg && <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#15803D] rounded">{msg}</div>}

      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
            <tr>
              <th className="py-3 px-6">Customer</th>
              <th className="py-3 px-4">Plan</th>
              <th className="py-3 px-4">Submissions Used</th>
              <th className="py-3 px-4">Emails Used</th>
              <th className="py-3 px-6 text-right">Storage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEFEF]">
            {subs.map((s) => (
              <tr key={s.id}>
                <td className="py-3 px-6 font-medium">{s.customerEmail}</td>
                <td className="py-3 px-4">{s.planName}</td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  {s.submissionsCount || 0} / {s.maxSubmissionsPerMonth}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  {s.emailsSentCount || 0} / {s.maxEmailsPerMonth}
                </td>
                <td className="py-3 px-6 text-right font-mono tabular-nums">
                  {((s.storageBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AdminGlobalSettingsView: React.FC = () => {
  const [general, setGeneral] = useState<any>({
    platformName: 'BrosDev Forms',
    publicApiBaseUrl: 'https://api.brosdev.xyz',
    supportEmail: 'support@brosdev.xyz',
    allowNewRegistrations: true,
    requireDomainAllowlist: false,
    enforceStrictUsageLimits: true,
    upgradeNotificationThresholdPct: 80,
  });
  const [gateways, setGateways] = useState<any>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ settings: Record<string, any> }>('/api/admin/settings').then((res) => {
      if (res.settings.platform_general) setGeneral(res.settings.platform_general);
      if (res.settings.payment_gateways) setGateways(res.settings.payment_gateways);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/settings', {
      method: 'PUT',
      body: { key: 'platform_general', value: general },
    });
    setSaved('Platform settings saved to PostgreSQL.');
    setTimeout(() => setSaved(null), 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
          <h2 className="text-base font-bold text-[#111111]">Global Platform Configuration</h2>
          {saved && <span className="text-xs font-semibold text-[#16A34A]">{saved}</span>}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Platform Display Name</label>
          <input
            value={general.platformName}
            onChange={(e) => setGeneral({ ...general, platformName: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Public Submission API Base URL</label>
          <input
            value={general.publicApiBaseUrl}
            onChange={(e) => setGeneral({ ...general, publicApiBaseUrl: e.target.value })}
            className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Support Email</label>
            <input
              value={general.supportEmail}
              onChange={(e) => setGeneral({ ...general, supportEmail: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Upgrade Alert Threshold (%)</label>
            <input
              type="number"
              min={50}
              max={100}
              value={general.upgradeNotificationThresholdPct}
              onChange={(e) =>
                setGeneral({ ...general, upgradeNotificationThresholdPct: Number(e.target.value) })
              }
              className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
            />
          </div>
        </div>
        <label className="flex items-center justify-between text-xs font-semibold pt-2">
          <span>Enforce Strict Server-Side Plan Limits</span>
          <input
            type="checkbox"
            checked={Boolean(general.enforceStrictUsageLimits)}
            onChange={(e) => setGeneral({ ...general, enforceStrictUsageLimits: e.target.checked })}
            className="accent-[#A90706]"
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] rounded-md cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          Save Global Settings
        </button>
      </form>

      <div className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#111111]">Payment Processor &amp; Webhooks</h3>
        <p className="text-xs text-[#525252]">
          Subscriptions and invoices are settled directly through the built-in BrosDev Pay card
          gateway with server-side validation.
        </p>
        <div className="space-y-3 text-xs font-mono">
          <div className="p-3 bg-[#FAFAFA] border border-[#E5E5E5] rounded">
            <div className="font-semibold text-[#111111]">BrosDev Pay Gateway</div>
            <div className="text-[#16A34A] mt-0.5">Active · USD Card Processing (Visa, Mastercard, Amex)</div>
          </div>
          <div className="p-3 bg-[#FAFAFA] border border-[#E5E5E5] rounded">
            <div className="font-semibold text-[#111111]">Checkout Endpoint</div>
            <div className="text-[#525252] mt-0.5">POST /api/billing/brosdev-pay/checkout</div>
          </div>
          <div className="p-3 bg-[#FAFAFA] border border-[#E5E5E5] rounded">
            <div className="font-semibold text-[#111111]">Resend Delivery Webhook</div>
            <div className="text-[#525252] mt-0.5">POST {gateways.resendWebhookEndpoint || '/api/webhooks/resend'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminRolesView: React.FC<{ on2faChanged: () => void }> = ({ on2faChanged }) => {
  const [roles, setRoles] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [roleSlug, setRoleSlug] = useState('admin');
  const [msg, setMsg] = useState<string | null>(null);

  // TOTP 2FA setup state
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');

  const load = async () => {
    const res = await apiRequest<{ roles: any[]; members: any[] }>('/api/admin/roles');
    setRoles(res.roles);
    setMembers(res.members);
  };

  useEffect(() => {
    load();
  }, []);

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiRequest('/api/admin/roles/assign', { method: 'POST', body: { email, roleSlug } });
      setEmail('');
      setMsg('Admin role assigned.');
      await load();
    } catch (err: any) {
      setMsg(err.message || 'Assignment failed');
    }
  };

  const revoke = async (id: number) => {
    try {
      await apiRequest(`/api/admin/roles/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const start2faSetup = async () => {
    const res = await apiRequest<{ secret: string; otpauthUri: string }>('/api/admin/2fa/setup', {
      method: 'POST',
    });
    setTotpSecret(res.secret);
    setTotpUri(res.otpauthUri);
  };

  const confirm2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/2fa/verify', { method: 'POST', body: { code: totpCode } });
      setTotpSecret(null);
      setTotpUri(null);
      setTotpCode('');
      setMsg('Two-Factor Authentication enabled on your admin account.');
      await load();
      on2faChanged();
    } catch (err: any) {
      setMsg(err.message || 'Invalid TOTP code');
    }
  };

  const disable2fa = async () => {
    await apiRequest('/api/admin/2fa/disable', { method: 'POST' });
    setMsg('Two-Factor Authentication disabled.');
    await load();
    on2faChanged();
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className="p-3.5 bg-white border border-[#E5E5E5] rounded-lg text-xs text-[#111111]">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Members & Assignment */}
        <div className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#111111]">Authorized Platform Administrators</h2>
            <p className="text-xs text-[#525252]">
              No public admin registration exists. Only Super Admins can grant roles to registered
              users.
            </p>
          </div>

          <form onSubmit={assign} className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Existing user email..."
              className="flex-1 min-w-[200px] px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
            />
            <select
              value={roleSlug}
              onChange={(e) => setRoleSlug(e.target.value)}
              className="px-3 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
            >
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="support">Support</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#A90706] rounded-md cursor-pointer"
            >
              Grant Role
            </button>
          </form>

          <div className="divide-y divide-[#EFEFEF] border-t border-[#E5E5E5]">
            {members.map((m) => (
              <div key={m.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-semibold text-[#111111]">{m.email}</div>
                  <div className="text-[#737373]">
                    {m.roleName} · 2FA: {m.totpEnabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
                <button
                  onClick={() => revoke(m.id)}
                  className="p-1.5 text-[#737373] hover:text-[#A90706] cursor-pointer"
                  title="Revoke admin access"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Two-Factor Authentication Card */}
        <div className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#A90706]" />
            <h3 className="text-sm font-bold text-[#111111]">Admin Two-Factor Authentication (TOTP)</h3>
          </div>
          <p className="text-xs text-[#525252]">
            Protect your admin session with an RFC 6238 authenticator app (Google Authenticator,
            1Password, Authy).
          </p>

          {!totpSecret ? (
            <div className="flex gap-2">
              <button
                onClick={start2faSetup}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#111111] rounded-md cursor-pointer"
              >
                Setup / Rotate 2FA Secret
              </button>
              <button
                onClick={disable2fa}
                className="px-4 py-2 text-xs font-semibold text-[#525252] bg-[#F5F5F5] rounded-md cursor-pointer"
              >
                Disable 2FA
              </button>
            </div>
          ) : (
            <form onSubmit={confirm2fa} className="space-y-3 pt-2 border-t border-[#EFEFEF]">
              <div className="p-3 bg-[#FAFAFA] border border-[#E5E5E5] rounded text-xs font-mono break-all">
                <div className="text-[#737373] mb-1">Manual Setup Secret (Base32):</div>
                <div className="font-bold text-[#111111]">{totpSecret}</div>
                <div className="text-[11px] text-[#737373] mt-2 break-all">{totpUri}</div>
              </div>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="Enter 6-digit code to confirm"
                className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
              />
              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold text-white bg-[#A90706] rounded-md cursor-pointer"
              >
                Verify &amp; Enable 2FA
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Role Permissions Reference */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {roles.map((r) => (
          <div key={r.id} className="bg-white border border-[#E5E5E5] rounded-lg p-5">
            <div className="flex items-center gap-2 font-bold text-sm text-[#111111]">
              <Shield className="w-4 h-4 text-[#A90706]" />
              {r.name}
            </div>
            <p className="text-xs text-[#525252] mt-1 mb-3">{r.description}</p>
            <div className="text-[11px] font-mono text-[#737373] leading-relaxed">
              {(r.permissions || []).join(' · ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AdminAuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      apiRequest<{ logs: any[] }>(`/api/admin/audit-logs?q=${encodeURIComponent(search)}`).then(
        (res) => setLogs(res.logs)
      );
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
          placeholder="Filter audit trail by admin email, action, or target..."
          className="w-full max-w-md px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
        />
      </div>
      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
              <tr>
                <th className="py-3 px-6">Action</th>
                <th className="py-3 px-4">Administrator</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-6 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[#737373]">
                    No admin audit activity recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 px-6 font-mono font-semibold text-[#111111]">{l.action}</td>
                    <td className="py-3 px-4">
                      <div>{l.adminEmail}</div>
                      <div className="text-[11px] text-[#737373]">{l.roleSlug}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#525252]">
                      {l.targetType}#{l.targetId}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#737373] max-w-xs truncate">
                      {JSON.stringify(l.details)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono text-[#737373]">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
