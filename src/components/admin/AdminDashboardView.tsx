import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../../lib/api';

interface AdminDashboardPayload {
  kpis: {
    totalUsers: number;
    activeCustomers: number;
    totalForms: number;
    totalSubmissions: number;
    totalEmailsSent: number;
    successfulEmailDeliveries: number;
    acceptedEmailDeliveries: number;
    failedEmailDeliveries: number;
    activeSubscriptions: number;
    paidActiveSubscriptions: number;
    mrrCents: number;
    totalApiRequests: number;
    resendMonthlyUsage: number;
  };
  charts: Array<{
    date: string;
    registrations: number;
    submissions: number;
    emailsDelivered: number;
    emailsAccepted: number;
    emailsFailed: number;
    revenueUsd: number;
    apiRequests: number;
  }>;
}

export const AdminDashboardView: React.FC = () => {
  const [data, setData] = useState<AdminDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<AdminDashboardPayload>('/api/admin/dashboard')
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load platform metrics'));
  }, []);

  if (error) {
    return (
      <div className="p-6 bg-white border border-[#FECACA] rounded-lg text-sm text-[#A90706]">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-24 bg-white border border-[#E5E5E5] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const k = data.kpis;
  const kpiCards = [
    { label: 'Total Registered Users', value: k.totalUsers.toLocaleString(), sub: `${k.activeCustomers} active` },
    { label: 'Total Forms Created', value: k.totalForms.toLocaleString(), sub: 'Across all workspaces' },
    { label: 'Total Submissions', value: k.totalSubmissions.toLocaleString(), sub: 'All-time processed' },
    {
      label: 'Monthly Recurring Revenue',
      value: `$${(k.mrrCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      sub: `${k.paidActiveSubscriptions} paid / ${k.activeSubscriptions} total subs`,
    },
    { label: 'Total Emails Dispatched', value: k.totalEmailsSent.toLocaleString(), sub: `${k.resendMonthlyUsage} this month (Resend)` },
    {
      label: 'Verified Email Deliveries',
      value: k.successfulEmailDeliveries.toLocaleString(),
      sub: `${k.acceptedEmailDeliveries} accepted awaiting webhook`,
      tone: 'text-[#16A34A]',
    },
    {
      label: 'Failed / Bounced Emails',
      value: k.failedEmailDeliveries.toLocaleString(),
      sub: 'Eligible for inspection/retry',
      tone: 'text-[#A90706]',
    },
    { label: 'Total API Requests', value: k.totalApiRequests.toLocaleString(), sub: 'Tracked in api_usage_logs' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((c) => (
          <div key={c.label} className="bg-white border border-[#E5E5E5] rounded-lg p-5">
            <div className="text-xs font-medium text-[#525252]">{c.label}</div>
            <div className={`mt-2 text-2xl font-bold font-mono tabular-nums ${c.tone || 'text-[#111111]'}`}>
              {c.value}
            </div>
            <div className="mt-1 text-xs text-[#737373]">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
          <h3 className="text-sm font-bold text-[#111111]">Form Submissions & User Registrations</h3>
          <p className="text-xs text-[#737373] mb-5">Last 14 days platform growth</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.charts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E5E5' }} />
                <Area type="monotone" dataKey="submissions" name="Submissions" stroke="#A90706" fill="#A90706" fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="registrations" name="New Users" stroke="#111111" fill="#111111" fillOpacity={0.08} strokeWidth={1.75} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
          <h3 className="text-sm font-bold text-[#111111]">Email Delivery Statistics (Resend)</h3>
          <p className="text-xs text-[#737373] mb-5">Delivered vs Accepted vs Failed/Bounced</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E5E5' }} />
                <Bar dataKey="emailsDelivered" stackId="e" name="Delivered" fill="#16A34A" radius={[2, 2, 0, 0]} />
                <Bar dataKey="emailsAccepted" stackId="e" name="Accepted" fill="#2563EB" />
                <Bar dataKey="emailsFailed" stackId="e" name="Failed/Bounced" fill="#A90706" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
          <h3 className="text-sm font-bold text-[#111111]">Subscription Revenue (USD)</h3>
          <p className="text-xs text-[#737373] mb-5">Verified payment settlements over 14 days</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E5E5' }} />
                <Bar dataKey="revenueUsd" name="Revenue ($)" fill="#111111" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
          <h3 className="text-sm font-bold text-[#111111]">API Request Volume</h3>
          <p className="text-xs text-[#737373] mb-5">Public form endpoint traffic over 14 days</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.charts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E5E5' }} />
                <Area type="monotone" dataKey="apiRequests" name="API Requests" stroke="#111111" fill="#111111" fillOpacity={0.08} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
