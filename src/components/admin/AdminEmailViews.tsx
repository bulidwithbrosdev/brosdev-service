import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface EmailLogRow {
  id: number;
  customerEmail: string;
  formTitle: string | null;
  emailType: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  resendMessageId: string | null;
  status: string;
  errorDetails: string | null;
  retryCount: number;
  createdAt: string;
}

export const AdminEmailLogsView: React.FC = () => {
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set('status', statusFilter);
    if (search.trim()) qs.set('q', search.trim());
    const res = await apiRequest<{ summary: Record<string, number>; logs: EmailLogRow[] }>(
      `/api/admin/emails?${qs.toString()}`
    );
    setSummary(res.summary);
    setLogs(res.logs);
  }, [statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    setNotice(null);
    try {
      const res = await apiRequest<{ status: string; error?: string }>(
        `/api/admin/emails/${id}/retry`,
        { method: 'POST' }
      );
      setNotice(
        res.status === 'accepted'
          ? `Email #${id} re-queued and accepted by Resend.`
          : `Retry failed: ${res.error || 'Unknown error'}`
      );
      await load();
    } catch (err: any) {
      setNotice(err.message || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const statusTone = (status: string) => {
    if (status === 'delivered') return 'text-[#16A34A]';
    if (status === 'accepted') return 'text-[#2563EB]';
    if (status === 'failed' || status === 'bounced') return 'text-[#A90706]';
    return 'text-[#737373]';
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ['Total Sent', summary.total || 0, 'text-[#111111]'],
          ['Delivered', summary.delivered || 0, 'text-[#16A34A]'],
          ['Accepted', summary.accepted || 0, 'text-[#2563EB]'],
          ['Pending', summary.pending || 0, 'text-[#737373]'],
          ['Bounced', summary.bounced || 0, 'text-[#D97706]'],
          ['Failed', summary.failed || 0, 'text-[#A90706]'],
        ].map(([label, val, tone]) => (
          <div key={String(label)} className="bg-white border border-[#E5E5E5] rounded-lg p-4">
            <div className="text-xs text-[#525252]">{label}</div>
            <div className={`mt-1 text-xl font-bold font-mono tabular-nums ${tone}`}>{val}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient, customer, subject, or Resend Message ID..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
        >
          <option value="">All Statuses</option>
          <option value="delivered">Delivered (Webhook Verified)</option>
          <option value="accepted">Accepted (Resend Queued)</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <button
          onClick={load}
          className="px-3 py-2 text-xs font-semibold bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-md cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {notice && (
        <div className="p-3.5 bg-white border border-[#E5E5E5] rounded-lg text-xs text-[#111111]">
          {notice}
        </div>
      )}

      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
              <tr>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Recipient &amp; Subject</th>
                <th className="py-3 px-4">Customer / Form</th>
                <th className="py-3 px-4">Resend ID</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#737373]">
                    No email delivery records match your filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FAFAFA]">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`font-semibold capitalize ${statusTone(log.status)}`}>
                        {log.status}
                      </span>
                      <div className="text-[11px] text-[#737373]">{log.emailType}</div>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-mono text-[#111111] truncate">{log.recipientEmail}</div>
                      <div className="text-[#525252] truncate">{log.subject}</div>
                      {log.errorDetails && (
                        <div className="text-[11px] text-[#A90706] mt-0.5 truncate">
                          {log.errorDetails}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-[#111111]">{log.customerEmail}</div>
                      <div className="text-[11px] text-[#737373]">{log.formTitle || 'System test'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#525252] whitespace-nowrap">
                      {log.resendMessageId || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#737373] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {(log.status === 'failed' || log.status === 'bounced') && (
                        <button
                          onClick={() => handleRetry(log.id)}
                          disabled={retryingId === log.id}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded cursor-pointer"
                        >
                          {retryingId === log.id ? 'Retrying...' : 'Retry'}
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
    </div>
  );
};

export const AdminEmailUsageView: React.FC = () => {
  const [periodMonth, setPeriodMonth] = useState('');
  const [customers, setCustomers] = useState<
    Array<{
      userId: number;
      email: string;
      displayName: string;
      planName: string | null;
      emailsSentThisMonth: number;
      effectiveLimit: number;
      usagePct: number;
      deliveredTotal: number;
      acceptedTotal: number;
      failedTotal: number;
    }>
  >([]);

  useEffect(() => {
    apiRequest<{ periodMonth: string; customers: typeof customers }>('/api/admin/email-usage').then(
      (res) => {
        setPeriodMonth(res.periodMonth);
        setCustomers(res.customers);
      }
    );
  }, []);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#111111]">Email Usage per Customer</h2>
          <p className="text-xs text-[#525252]">Billing cycle {periodMonth || 'Current month'}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
            <tr>
              <th className="py-3 px-6">Customer</th>
              <th className="py-3 px-4">Plan</th>
              <th className="py-3 px-4">Monthly Quota</th>
              <th className="py-3 px-4 text-right">Delivered</th>
              <th className="py-3 px-4 text-right">Accepted</th>
              <th className="py-3 px-6 text-right">Failed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEFEF]">
            {customers.map((c) => (
              <tr key={c.userId}>
                <td className="py-3.5 px-6">
                  <div className="font-semibold text-[#111111]">{c.displayName || c.email}</div>
                  <div className="text-[11px] text-[#737373]">{c.email}</div>
                </td>
                <td className="py-3.5 px-4">{c.planName || 'Free'}</td>
                <td className="py-3.5 px-4 w-56">
                  <div className="flex justify-between font-mono tabular-nums mb-1">
                    <span>
                      {c.emailsSentThisMonth} / {c.effectiveLimit}
                    </span>
                    <span>{c.usagePct}%</span>
                  </div>
                  <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${c.usagePct >= 90 ? 'bg-[#A90706]' : 'bg-[#111111]'}`}
                      style={{ width: `${c.usagePct}%` }}
                    />
                  </div>
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#16A34A]">
                  {c.deliveredTotal}
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#2563EB]">
                  {c.acceptedTotal}
                </td>
                <td className="py-3.5 px-6 text-right font-mono tabular-nums text-[#A90706]">
                  {c.failedTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
