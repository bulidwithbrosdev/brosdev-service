import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Plus, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface DashboardData {
  stats: {
    totalForms: number;
    totalSubmissions: number;
    emailsSent: number;
    failedSubmissions: number;
    totalApiRequests: number;
  };
  activitySeries: Array<{
    date: string;
    submissions: number;
    apiRequests: number;
    emails: number;
  }>;
  recentSubmissions: Array<{
    id: number;
    formId: number;
    formTitle: string;
    formKey: string;
    payload: Record<string, unknown>;
    isRead: boolean;
    status: string;
    emailDeliveryStatus: string;
    createdAt: string;
  }>;
}

export const DashboardView: React.FC<{
  onCreateForm: () => void;
  onOpenSubmissions: (formId?: number) => void;
  onOpenBilling: () => void;
}> = ({ onCreateForm, onOpenSubmissions, onOpenBilling }) => {
  const { workspace } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<DashboardData>('/api/dashboard')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load dashboard');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const usage = workspace?.usage;
  const limits = workspace?.limits;
  const subPct =
    usage && limits && limits.maxSubmissions > 0
      ? Math.min(100, Math.round((usage.submissionsCount / limits.maxSubmissions) * 100))
      : 0;
  const emailPct =
    usage && limits && limits.maxEmails > 0
      ? Math.min(100, Math.round((usage.emailsSentCount / limits.maxEmails) * 100))
      : 0;
  const formsPct =
    usage && limits && limits.maxForms > 0
      ? Math.min(100, Math.round((usage.formsCreated / limits.maxForms) * 100))
      : 0;

  const showUpgradeNotice = subPct >= 80 || emailPct >= 80 || formsPct >= 100;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-24 bg-white border border-[#E5E5E5] rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-white border border-[#E5E5E5] rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white border border-[#FECACA] rounded-lg text-sm text-[#A90706]">
        {error}
      </div>
    );
  }

  const stats = data?.stats || {
    totalForms: 0,
    totalSubmissions: 0,
    emailsSent: 0,
    failedSubmissions: 0,
    totalApiRequests: 0,
  };

  const deliveryColor = (status: string) => {
    if (status === 'delivered') return 'text-[#16A34A]';
    if (status === 'accepted') return 'text-[#2563EB]';
    if (status === 'failed' || status === 'bounced') return 'text-[#A90706]';
    return 'text-[#737373]';
  };

  return (
    <div className="space-y-6">
      {showUpgradeNotice && (
        <div className="bg-white border border-[#FCD34D] rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#111111]">
                Approaching monthly plan quota on {workspace?.plan?.name}
              </p>
              <p className="text-xs text-[#525252] mt-0.5">
                Forms: {usage?.formsCreated}/{limits?.maxForms} · Submissions:{' '}
                {usage?.submissionsCount}/{limits?.maxSubmissions} · Emails:{' '}
                {usage?.emailsSentCount}/{limits?.maxEmails}
              </p>
            </div>
          </div>
          <button
            onClick={onOpenBilling}
            className="px-4 py-2 text-xs font-semibold bg-[#A90706] hover:bg-[#8C0605] text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upgrade Plan
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252] font-medium">Total Forms</div>
          <div className="mt-2 text-2xl font-bold text-[#111111] tabular-nums">
            {stats.totalForms.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-[#737373] tabular-nums">
            Limit: {limits?.maxForms ?? 2} forms
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252] font-medium">Total Submissions</div>
          <div className="mt-2 text-2xl font-bold text-[#111111] tabular-nums">
            {stats.totalSubmissions.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-[#737373] tabular-nums">
            {usage?.submissionsCount ?? 0} this month
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252] font-medium">Emails Sent</div>
          <div className="mt-2 text-2xl font-bold text-[#111111] tabular-nums">
            {stats.emailsSent.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-[#737373] tabular-nums">
            {usage?.emailsSentCount ?? 0} / {limits?.maxEmails ?? 100} mo
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252] font-medium">Failed Submissions</div>
          <div className="mt-2 text-2xl font-bold text-[#A90706] tabular-nums">
            {stats.failedSubmissions.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-[#737373]">Failed or bounced deliveries</div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5 col-span-2 lg:col-span-1">
          <div className="text-xs text-[#525252] font-medium">API Requests</div>
          <div className="mt-2 text-2xl font-bold text-[#111111] tabular-nums">
            {stats.totalApiRequests.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-[#737373] tabular-nums">
            {limits?.maxApiRequestsPerMin ?? 20} req/min cap
          </div>
        </div>
      </div>

      {/* Main Chart + Plan Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-[#E5E5E5] rounded-lg p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-base font-bold text-[#111111]">Form Activity & API Usage</h2>
              <p className="text-xs text-[#525252] mt-0.5">
                Daily submissions, API requests, and dispatched emails over the last 14 days
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#525252] whitespace-nowrap shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#A90706]" />
                Submissions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#111111]" />
                API Requests
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.activitySeries || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#737373' }}
                  axisLine={{ stroke: '#E5E5E5' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#737373' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E5E5E5',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="apiRequests"
                  name="API Requests"
                  stroke="#111111"
                  fill="#111111"
                  fillOpacity={0.06}
                  strokeWidth={1.75}
                />
                <Area
                  type="monotone"
                  dataKey="submissions"
                  name="Submissions"
                  stroke="#A90706"
                  fill="#A90706"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-[#E5E5E5] rounded-lg p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-[#111111]">Monthly Quota</h2>
              <span className="text-xs font-semibold text-[#A90706]">
                {workspace?.plan?.name || 'Free'} Plan
              </span>
            </div>
            <p className="text-xs text-[#525252] mb-6">
              Period {usage?.periodMonth || 'Current'} · Enforced server-side
            </p>

            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#111111]">Forms Created</span>
                  <span className="font-mono tabular-nums text-[#525252]">
                    {usage?.formsCreated ?? 0} / {limits?.maxForms ?? 2}
                  </span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#111111] transition-all"
                    style={{ width: `${formsPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#111111]">Monthly Submissions</span>
                  <span className="font-mono tabular-nums text-[#525252]">
                    {usage?.submissionsCount ?? 0} / {limits?.maxSubmissions ?? 100}
                  </span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#A90706] transition-all"
                    style={{ width: `${subPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-[#111111]">Resend Notifications</span>
                  <span className="font-mono tabular-nums text-[#525252]">
                    {usage?.emailsSentCount ?? 0} / {limits?.maxEmails ?? 100}
                  </span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#A90706] transition-all"
                    style={{ width: `${emailPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[#E5E5E5] flex items-center justify-between gap-3">
            <button
              onClick={onOpenBilling}
              className="text-xs font-semibold text-[#111111] hover:text-[#A90706] transition-colors cursor-pointer whitespace-nowrap"
            >
              Manage subscription
            </button>
            <button
              onClick={onCreateForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Form
            </button>
          </div>
        </div>
      </div>

      {/* Recent Submissions */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#111111]">Recent Submissions</h2>
            <p className="text-xs text-[#525252] mt-0.5">Latest incoming entries across all forms</p>
          </div>
          <button
            onClick={() => onOpenSubmissions()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#A90706] hover:underline cursor-pointer whitespace-nowrap"
          >
            View all submissions
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {!data?.recentSubmissions.length ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#111111]">No submissions received yet</p>
            <p className="text-xs text-[#525252] mt-1 mb-5">
              Create and publish a form, then submit via the live preview, HTML snippet, or REST API.
            </p>
            <button
              onClick={onCreateForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Your First Form
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-xs font-semibold text-[#525252]">
                  <th className="py-3 px-6">Form</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4">Email Status</th>
                  <th className="py-3 px-6 text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF] text-sm">
                {data.recentSubmissions.map((sub) => {
                  const previewText = Object.entries(sub.payload || {})
                    .slice(0, 2)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(' · ');
                  return (
                    <tr
                      key={sub.id}
                      onClick={() => onOpenSubmissions(sub.formId)}
                      className="hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-6 font-medium text-[#111111] whitespace-nowrap">
                        {sub.formTitle}
                        {!sub.isRead && (
                          <span className="ml-2 text-xs font-semibold text-[#A90706]">Unread</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#525252] max-w-md truncate">
                        {previewText || 'Empty payload'}
                      </td>
                      <td
                        className={`py-3 px-4 text-xs font-semibold capitalize whitespace-nowrap ${deliveryColor(
                          sub.emailDeliveryStatus
                        )}`}
                      >
                        {sub.emailDeliveryStatus}
                      </td>
                      <td className="py-3 px-6 text-right text-xs text-[#737373] font-mono tabular-nums whitespace-nowrap">
                        {new Date(sub.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
