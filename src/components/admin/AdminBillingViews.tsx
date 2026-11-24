import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Archive, Save, X } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { PlanRecord } from '../../types';

const EMPTY_PLAN: Omit<PlanRecord, 'id'> = {
  slug: '',
  name: '',
  audienceLabel: '',
  description: '',
  monthlyPriceCents: 2900,
  yearlyPriceCents: 29000,
  trialDays: 14,
  maxForms: 25,
  maxSubmissionsPerMonth: 5000,
  maxEmailsPerMonth: 5000,
  maxApiRequestsPerMin: 120,
  maxStorageMb: 500,
  isActive: true,
  isArchived: false,
  sortOrder: 5,
  features: {
    advancedBuilder: true,
    jsIntegration: true,
    restApi: true,
    webhooks: false,
    customEmailTemplates: true,
    multipleRecipients: true,
    removeBranding: false,
    teamMembers: false,
    prioritySupport: false,
    advancedAnalytics: false,
  },
};

export const AdminPlansView: React.FC = () => {
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [editing, setEditing] = useState<(Omit<PlanRecord, 'id'> & { id?: number }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await apiRequest<{ plans: PlanRecord[] }>('/api/admin/plans');
    setPlans(res.plans);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      if (editing.id) {
        await apiRequest(`/api/admin/plans/${editing.id}`, { method: 'PUT', body: editing });
      } else {
        await apiRequest('/api/admin/plans', { method: 'POST', body: editing });
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (planId: number) => {
    await apiRequest(`/api/admin/plans/${planId}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#111111]">Subscription Plans &amp; Quotas</h2>
          <p className="text-xs text-[#525252]">
            All prices, trial durations, limits, and feature flags are stored in PostgreSQL and
            enforced live on the backend.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY_PLAN })}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`bg-white border rounded-lg p-5 flex flex-col justify-between ${
              p.isArchived ? 'border-dashed border-[#D4D4D4] opacity-70' : 'border-[#E5E5E5]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-base text-[#111111]">{p.name}</h3>
                <span
                  className={`text-xs font-semibold ${
                    p.isArchived
                      ? 'text-[#737373]'
                      : p.isActive
                        ? 'text-[#16A34A]'
                        : 'text-[#D97706]'
                  }`}
                >
                  {p.isArchived ? 'Archived' : p.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-xs text-[#737373] font-mono mt-0.5">
                {p.slug} · {p.subscriberCount ?? 0} subscriber(s)
              </div>
              <div className="mt-4 font-mono tabular-nums">
                <span className="text-2xl font-bold text-[#111111]">
                  ${(p.monthlyPriceCents / 100).toFixed(0)}
                </span>
                <span className="text-xs text-[#737373]">/mo · ${(p.yearlyPriceCents / 100).toFixed(0)}/yr</span>
              </div>
              <div className="mt-4 pt-4 border-t border-[#EFEFEF] space-y-1.5 text-xs text-[#333333] tabular-nums">
                <div>Forms limit: <strong>{p.maxForms}</strong></div>
                <div>Submissions/mo: <strong>{p.maxSubmissionsPerMonth.toLocaleString()}</strong></div>
                <div>Emails/mo: <strong>{p.maxEmailsPerMonth.toLocaleString()}</strong></div>
                <div>API rate limit: <strong>{p.maxApiRequestsPerMin} req/min</strong></div>
                <div>Free trial: <strong>{p.trialDays} days</strong></div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[#EFEFEF] flex items-center gap-2">
              <button
                onClick={() => setEditing({ ...p })}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => handleArchive(p.id)}
                className="p-1.5 text-[#525252] hover:text-[#A90706] hover:bg-[#FEF2F2] rounded cursor-pointer"
                title="Archive / Delete plan"
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Plan Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSave}
            className="bg-white border border-[#E5E5E5] rounded-xl w-full max-w-2xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <h3 className="text-lg font-bold text-[#111111]">
                {editing.id ? `Edit Plan: ${editing.name}` : 'Create Subscription Plan'}
              </h3>
              <button type="button" onClick={() => setEditing(null)} className="cursor-pointer">
                <X className="w-5 h-5 text-[#737373]" />
              </button>
            </div>

            {error && <div className="p-3 bg-[#FEF2F2] text-xs text-[#A90706] rounded">{error}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Plan Name</label>
                <input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Slug (lowercase)</label>
                <input
                  required
                  value={editing.slug}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Monthly Price (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.monthlyPriceCents / 100}
                  onChange={(e) =>
                    setEditing({ ...editing, monthlyPriceCents: Math.round(Number(e.target.value) * 100) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Yearly Price (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.yearlyPriceCents / 100}
                  onChange={(e) =>
                    setEditing({ ...editing, yearlyPriceCents: Math.round(Number(e.target.value) * 100) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Max Forms</label>
                <input
                  type="number"
                  min={1}
                  value={editing.maxForms}
                  onChange={(e) => setEditing({ ...editing, maxForms: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Max Submissions / Month</label>
                <input
                  type="number"
                  min={1}
                  value={editing.maxSubmissionsPerMonth}
                  onChange={(e) =>
                    setEditing({ ...editing, maxSubmissionsPerMonth: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Max Emails / Month</label>
                <input
                  type="number"
                  min={0}
                  value={editing.maxEmailsPerMonth}
                  onChange={(e) =>
                    setEditing({ ...editing, maxEmailsPerMonth: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Free Trial (Days)</label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={editing.trialDays}
                  onChange={(e) => setEditing({ ...editing, trialDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[#EFEFEF]">
              <div className="text-xs font-bold mb-2">Feature Entitlements</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {(Object.keys(editing.features) as Array<keyof PlanRecord['features']>).map((key) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editing.features[key]}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          features: { ...editing.features, [key]: e.target.checked },
                        })
                      }
                      className="accent-[#A90706]"
                    />
                    <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#E5E5E5]">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                  className="accent-[#A90706]"
                />
                Plan Active (visible to customers)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#525252] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save Plan'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const AdminSubscriptionsView: React.FC = () => {
  const [subs, setSubs] = useState<any[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);

  const load = async () => {
    const [sRes, pRes] = await Promise.all([
      apiRequest<{ subscriptions: any[] }>('/api/admin/subscriptions'),
      apiRequest<{ plans: PlanRecord[] }>('/api/admin/plans'),
    ]);
    setSubs(sRes.subscriptions);
    setPlans(pRes.plans);
  };

  useEffect(() => {
    load();
  }, []);

  const updateSub = async (id: number, patch: Record<string, unknown>) => {
    await apiRequest(`/api/admin/subscriptions/${id}`, { method: 'PATCH', body: patch });
    await load();
  };

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E5E5]">
        <h2 className="text-base font-bold text-[#111111]">Customer Subscriptions</h2>
        <p className="text-xs text-[#525252]">
          Assign plans, manage trials, cancel or reactivate customer subscriptions.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
            <tr>
              <th className="py-3 px-6">Customer</th>
              <th className="py-3 px-4">Plan</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Monthly Usage</th>
              <th className="py-3 px-6 text-right">Renewal Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEFEF]">
            {subs.map((s) => {
              const subPct = s.maxSubmissionsPerMonth
                ? Math.min(100, Math.round(((s.submissionsCount || 0) / s.maxSubmissionsPerMonth) * 100))
                : 0;
              return (
                <tr key={s.id}>
                  <td className="py-3.5 px-6">
                    <div className="font-semibold text-[#111111]">{s.customerEmail}</div>
                    <div className="text-[11px] text-[#737373] capitalize">
                      {s.provider} · {s.billingCycle}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <select
                      value={s.planId}
                      onChange={(e) => updateSub(s.id, { planId: Number(e.target.value) })}
                      className="px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded bg-white"
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3.5 px-4">
                    <select
                      value={s.status}
                      onChange={(e) => updateSub(s.id, { status: e.target.value })}
                      className="px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded bg-white"
                    >
                      <option value="active">Active</option>
                      <option value="trialing">Trialing</option>
                      <option value="past_due">Past Due</option>
                      <option value="canceled">Canceled</option>
                      <option value="expired">Expired</option>
                    </select>
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums">
                    {s.submissionsCount || 0}/{s.maxSubmissionsPerMonth} subs ({subPct}%) ·{' '}
                    {s.emailsSentCount || 0} emails
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono text-[#737373]">
                    {new Date(s.currentPeriodEnd).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AdminTransactionsView: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const res = await apiRequest<{ transactions: any[] }>('/api/admin/transactions');
    setRows(res.transactions);
  };
  useEffect(() => {
    load();
  }, []);

  const refund = async (id: number) => {
    await apiRequest(`/api/admin/transactions/${id}/refund`, { method: 'POST' });
    await load();
  };

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E5E5]">
        <h2 className="text-base font-bold text-[#111111]">Payment Transactions</h2>
        <p className="text-xs text-[#525252]">
          Card transactions processed via BrosDev Pay
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
            <tr>
              <th className="py-3 px-6">Customer</th>
              <th className="py-3 px-4">Gateway / Ref</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Status / Refund</th>
              <th className="py-3 px-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEFEF]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[#737373]">
                  No payment transactions recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 px-6 font-medium text-[#111111]">{r.customerEmail}</td>
                  <td className="py-3 px-4 font-mono">
                    <span className="capitalize">{r.provider}</span> · {r.providerPaymentId}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums">
                    {(r.amountCents / 100).toFixed(2)} {r.currency}
                  </td>
                  <td className="py-3 px-4 capitalize">
                    <span className="font-semibold">{r.status}</span> · Refund: {r.refundStatus}
                  </td>
                  <td className="py-3 px-6 text-right">
                    {r.status === 'succeeded' && r.refundStatus === 'none' && (
                      <button
                        onClick={() => refund(r.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-[#A90706] bg-[#FEF2F2] rounded cursor-pointer"
                      >
                        Mark Refunded
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AdminInvoicesView: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    apiRequest<{ invoices: any[] }>('/api/admin/invoices').then((res) => setRows(res.invoices));
  }, []);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E5E5]">
        <h2 className="text-base font-bold text-[#111111]">Platform Invoices</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
            <tr>
              <th className="py-3 px-6">Invoice #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-6 text-right">Issued</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEFEF]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[#737373]">
                  No invoices generated yet.
                </td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-3 px-6 font-mono font-semibold">{inv.invoiceNumber}</td>
                  <td className="py-3 px-4">{inv.customerEmail}</td>
                  <td className="py-3 px-4 font-mono tabular-nums">
                    {(inv.amountCents / 100).toFixed(2)} {inv.currency}
                  </td>
                  <td className="py-3 px-4 capitalize font-semibold text-[#16A34A]">{inv.status}</td>
                  <td className="py-3 px-6 text-right font-mono text-[#737373]">
                    {new Date(inv.issuedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
