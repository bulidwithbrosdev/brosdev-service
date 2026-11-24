import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Search,
  Trash2,
  RefreshCw,
  MailCheck,
  MailOpen,
  Paperclip,
} from 'lucide-react';
import { apiDownloadCsv, apiRequest } from '../../lib/api';
import { FormRecord, SubmissionRecord } from '../../types';

export const SubmissionsView: React.FC<{ initialFormId?: number }> = ({ initialFormId }) => {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubmissionRecord | null>(null);

  const [formFilter, setFormFilter] = useState<string>(initialFormId ? String(initialFormId) : '');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const loadForms = useCallback(async () => {
    const res = await apiRequest<{ forms: FormRecord[] }>('/api/forms');
    setForms(res.forms);
  }, []);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (formFilter) qs.set('formId', formFilter);
      if (statusFilter) qs.set('deliveryStatus', statusFilter);
      if (search.trim()) qs.set('q', search.trim());
      if (fromDate) qs.set('from', fromDate);
      if (toDate) qs.set('to', toDate);

      const res = await apiRequest<{ submissions: SubmissionRecord[] }>(
        `/api/submissions?${qs.toString()}`
      );
      setSubmissions(res.submissions);
      setSelected((prev) =>
        prev ? res.submissions.find((s) => s.id === prev.id) || res.submissions[0] || null : res.submissions[0] || null
      );
    } finally {
      setLoading(false);
    }
  }, [formFilter, statusFilter, search, fromDate, toDate]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  useEffect(() => {
    const t = setTimeout(loadSubmissions, 180);
    return () => clearTimeout(t);
  }, [loadSubmissions]);

  const toggleRead = async (sub: SubmissionRecord) => {
    await apiRequest(`/api/submissions/${sub.id}`, {
      method: 'PATCH',
      body: { isRead: !sub.isRead },
    });
    setSubmissions((prev) =>
      prev.map((item) => (item.id === sub.id ? { ...item, isRead: !sub.isRead } : item))
    );
    if (selected?.id === sub.id) {
      setSelected({ ...sub, isRead: !sub.isRead });
    }
  };

  const handleDelete = async (sub: SubmissionRecord) => {
    await apiRequest(`/api/submissions/${sub.id}`, { method: 'DELETE' });
    setSubmissions((prev) => prev.filter((item) => item.id !== sub.id));
    if (selected?.id === sub.id) setSelected(null);
  };

  const handleRetryEmail = async (sub: SubmissionRecord) => {
    setRetrying(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ retried: number }>(
        `/api/submissions/${sub.id}/retry-email`,
        { method: 'POST' }
      );
      setFeedback({ ok: true, text: `Retried ${res.retried} email delivery job(s).` });
      await loadSubmissions();
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || 'Retry failed' });
    } finally {
      setRetrying(false);
    }
  };

  const handleExportCsv = async () => {
    const qs = formFilter ? `?formId=${formFilter}` : '';
    await apiDownloadCsv(`/api/submissions/export${qs}`, 'brosdev-forms-submissions.csv');
  };

  const statusTone = (status: string) => {
    if (status === 'delivered') return 'text-[#16A34A]';
    if (status === 'accepted') return 'text-[#2563EB]';
    if (status === 'failed' || status === 'bounced') return 'text-[#A90706]';
    return 'text-[#737373]';
  };

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payload values or form name..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#D4D4D4] rounded-md focus:outline-none focus:border-[#111111]"
          />
        </div>

        <select
          value={formFilter}
          onChange={(e) => setFormFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
        >
          <option value="">All Forms</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
        >
          <option value="">All Email Statuses</option>
          <option value="delivered">Delivered</option>
          <option value="accepted">Accepted by Resend</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
          <option value="disabled">Notifications Disabled</option>
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md"
          title="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md"
          title="To date"
        />

        <button
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-md whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg text-xs border ${
            feedback.ok
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Split Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between text-xs font-semibold text-[#525252]">
            <span>Inbox ({submissions.length})</span>
            <button
              onClick={loadSubmissions}
              className="text-[#525252] hover:text-[#111111] cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[#737373]">Loading submissions...</div>
          ) : submissions.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#737373]">
              No matching submissions found.
            </div>
          ) : (
            <div className="divide-y divide-[#EFEFEF] max-h-[620px] overflow-y-auto">
              {submissions.map((sub) => {
                const isSelected = selected?.id === sub.id;
                const firstVal = Object.values(sub.payload || {})[0];
                return (
                  <div
                    key={sub.id}
                    onClick={() => {
                      setSelected(sub);
                      setFeedback(null);
                      if (!sub.isRead) toggleRead(sub);
                    }}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#FEF2F2]/60' : 'hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm truncate ${
                          sub.isRead ? 'font-medium text-[#333333]' : 'font-bold text-[#111111]'
                        }`}
                      >
                        {sub.formTitle}
                      </span>
                      <span className="text-[11px] font-mono text-[#737373] shrink-0 tabular-nums">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-[#525252] truncate mt-1">
                      {firstVal ? String(firstVal) : `Submission #${sub.id}`}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                      <span className={`font-semibold capitalize ${statusTone(sub.emailDeliveryStatus)}`}>
                        Email: {sub.emailDeliveryStatus}
                      </span>
                      <span className="text-[#D4D4D4]">·</span>
                      <span className="text-[#737373] capitalize">{sub.status}</span>
                      {!sub.isRead && (
                        <>
                          <span className="text-[#D4D4D4]">·</span>
                          <span className="font-semibold text-[#A90706]">Unread</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Submission Detail Inspector */}
        <div className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-lg p-6 min-h-[420px]">
          {!selected ? (
            <div className="h-64 flex items-center justify-center text-sm text-[#737373]">
              Select a submission to inspect its full payload and delivery logs.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
                <div>
                  <h3 className="text-lg font-bold text-[#111111]">
                    {selected.formTitle}{' '}
                    <span className="font-mono text-xs text-[#737373] font-normal">
                      #{selected.id}
                    </span>
                  </h3>
                  <div className="text-xs text-[#525252] mt-1 font-mono tabular-nums">
                    {new Date(selected.createdAt).toLocaleString()} · Email:{' '}
                    <span className={`font-semibold capitalize ${statusTone(selected.emailDeliveryStatus)}`}>
                      {selected.emailDeliveryStatus}
                    </span>
                    {selected.originDomain && ` · Origin: ${selected.originDomain}`}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(selected.emailDeliveryStatus === 'failed' ||
                    selected.emailDeliveryStatus === 'bounced') && (
                    <button
                      onClick={() => handleRetryEmail(selected)}
                      disabled={retrying}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {retrying ? 'Retrying...' : 'Retry Email'}
                    </button>
                  )}
                  <button
                    onClick={() => toggleRead(selected)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-md cursor-pointer"
                  >
                    {selected.isRead ? (
                      <>
                        <MailOpen className="w-3.5 h-3.5" />
                        Mark Unread
                      </>
                    ) : (
                      <>
                        <MailCheck className="w-3.5 h-3.5" />
                        Mark Read
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    className="p-2 text-[#525252] hover:text-[#A90706] hover:bg-[#FEF2F2] rounded-md cursor-pointer"
                    title="Delete submission"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#EFEFEF] border border-[#E5E5E5] rounded-lg">
                {Object.entries(selected.payload || {}).map(([key, value]) => (
                  <div key={key} className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-4 text-xs font-semibold text-[#525252] font-mono break-all">
                      {key}
                    </div>
                    <div className="sm:col-span-8 text-sm text-[#111111] whitespace-pre-wrap break-words">
                      {Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                    </div>
                  </div>
                ))}
              </div>

              {selected.files && selected.files.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-[#111111] mb-2 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    Uploaded Files ({selected.files.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selected.files.map((f, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 bg-[#FAFAFA] border border-[#E5E5E5] rounded text-xs flex justify-between"
                      >
                        <span className="font-medium text-[#111111]">{f.originalName}</span>
                        <span className="font-mono text-[#737373]">
                          {f.mimeType} · {(f.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
