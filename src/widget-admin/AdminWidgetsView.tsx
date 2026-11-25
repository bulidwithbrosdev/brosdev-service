import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  adminDeleteWidget,
  adminListAllWidgets,
  adminSetWidgetStatus,
} from '../widget-api/widgetsFirestore';
import { getWidgetDefinition } from '../widgets/catalog';
import type { WidgetRecord, WidgetStatus } from '../widgets/types';

export const AdminWidgetsView: React.FC = () => {
  const [widgets, setWidgets] = useState<WidgetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WidgetStatus | 'flagged'>('all');
  const [disableModalWidget, setDisableModalWidget] = useState<WidgetRecord | null>(null);
  const [abuseReason, setAbuseReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const list = await adminListAllWidgets();
      setWidgets(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return widgets.filter((w) => {
      if (statusFilter === 'flagged' && !w.abuseFlagged) return false;
      if (statusFilter !== 'all' && statusFilter !== 'flagged' && w.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        w.publicId.toLowerCase().includes(q) ||
        w.ownerUid.toLowerCase().includes(q) ||
        w.type.toLowerCase().includes(q)
      );
    });
  }, [widgets, search, statusFilter]);

  const stats = useMemo(() => {
    const published = widgets.filter((w) => w.status === 'published').length;
    const disabled = widgets.filter((w) => w.status === 'disabled').length;
    const totalViews = widgets.reduce((sum, w) => sum + w.totalViews, 0);
    const totalClicks = widgets.reduce((sum, w) => sum + w.totalClicks, 0);
    return { total: widgets.length, published, disabled, totalViews, totalClicks };
  }, [widgets]);

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableModalWidget) return;
    setBusyId(disableModalWidget.docId);
    try {
      await adminSetWidgetStatus(disableModalWidget, 'disabled', abuseReason);
      setNotice(`Disabled widget ${disableModalWidget.publicId} and recorded audit log.`);
      setDisableModalWidget(null);
      setAbuseReason('');
      await loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const handleEnable = async (w: WidgetRecord) => {
    setBusyId(w.docId);
    try {
      await adminSetWidgetStatus(w, 'published', '');
      setNotice(`Re-enabled widget ${w.publicId} and logged audit entry.`);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (w: WidgetRecord) => {
    setBusyId(w.docId);
    try {
      await adminDeleteWidget(w);
      setNotice(`Deleted widget ${w.publicId} and logged audit entry.`);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#111111]">Website Widgets Governance</h1>
          <p className="text-xs text-[#525252] mt-1">
            Monitor published customer components, review abuse flags, disable violating embeds, and inspect traffic.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Platform KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Widgets', value: stats.total.toLocaleString() },
          { label: 'Published Live', value: stats.published.toLocaleString() },
          { label: 'Disabled / Suspended', value: stats.disabled.toLocaleString() },
          { label: 'Total Widget Views', value: stats.totalViews.toLocaleString() },
          { label: 'Total Widget Clicks', value: stats.totalClicks.toLocaleString() },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-[#E5E5E5] bg-white p-4">
            <div className="text-[11px] font-semibold text-[#737373]">{kpi.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-[#111111]">{kpi.value}</div>
          </div>
        ))}
      </div>

      {notice && (
        <div className="rounded-lg border border-[#15803D]/30 bg-[#F0FDF4] px-4 py-2.5 text-xs text-[#166534] flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Status Filters */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, public ID, type, or owner UID..."
            className="w-full rounded-md border border-[#D4D4D4] pl-8 pr-3 py-1.5 text-xs focus:border-[#A90706] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 text-xs">
          {(
            [
              ['all', 'All'],
              ['published', 'Published'],
              ['draft', 'Draft'],
              ['disabled', 'Disabled'],
              ['flagged', 'Abuse Flagged'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                statusFilter === id
                  ? 'bg-[#111111] text-white'
                  : 'bg-[#F5F5F5] text-[#525252] hover:text-[#111111]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#737373]">Loading platform widgets...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">No matching customer widgets found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                  <th className="px-4 py-2.5">Widget</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Owner UID</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Views / Clicks</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {filtered.map((w) => (
                  <tr key={w.docId} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#111111]">{w.name}</div>
                      <div className="font-mono text-[11px] text-[#737373]">
                        {w.publicId} · v{w.publishedVersion || w.version}
                      </div>
                      {w.abuseReason && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#A90706]">
                          <ShieldAlert className="w-3 h-3" /> {w.abuseReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#525252]">{getWidgetDefinition(w.type).name}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#525252]">
                      {w.ownerUid.slice(0, 14)}...
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold capitalize ${
                          w.status === 'published'
                            ? 'text-[#15803D]'
                            : w.status === 'disabled'
                              ? 'text-[#A90706]'
                              : 'text-[#737373]'
                        }`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#111111]">
                      {w.totalViews.toLocaleString()} / {w.totalClicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <a
                          href={`/w/${w.publicId}?preview=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-[#525252] hover:text-[#111111]"
                          title="Inspect hosted widget"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {w.status === 'disabled' ? (
                          <button
                            type="button"
                            disabled={busyId === w.docId}
                            onClick={() => void handleEnable(w)}
                            className="inline-flex items-center gap-1 rounded border border-[#15803D] px-2 py-1 text-[11px] font-semibold text-[#15803D] hover:bg-[#F0FDF4] cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === w.docId}
                            onClick={() => {
                              setDisableModalWidget(w);
                              setAbuseReason(w.abuseReason || '');
                            }}
                            className="inline-flex items-center gap-1 rounded border border-[#A90706] px-2 py-1 text-[11px] font-semibold text-[#A90706] hover:bg-[#FEF2F2] cursor-pointer"
                          >
                            <Ban className="w-3 h-3" /> Disable
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === w.docId}
                          onClick={() => void handleDelete(w)}
                          className="p-1 text-[#737373] hover:text-[#A90706] cursor-pointer"
                          title="Delete widget"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disable / Abuse Reason Modal */}
      {disableModalWidget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmDisable}
            className="bg-white border border-[#E5E5E5] rounded-xl max-w-md w-full p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#111111]">Disable Widget Embed</h3>
              <button
                type="button"
                onClick={() => setDisableModalWidget(null)}
                className="text-[#525252] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#525252]">
              Disabling <span className="font-semibold text-[#111111]">{disableModalWidget.name}</span>{' '}
              (<span className="font-mono">{disableModalWidget.publicId}</span>) immediately stops its live embed script and hosted page from serving.
            </p>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#111111]">
                Abuse / Moderation Reason (logged to Audit Log)
              </label>
              <textarea
                rows={3}
                value={abuseReason}
                onChange={(e) => setAbuseReason(e.target.value)}
                placeholder="e.g., Phishing CTA link detected or excessive scraping traffic"
                className="w-full rounded-md border border-[#D4D4D4] p-2.5 text-xs focus:border-[#A90706] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisableModalWidget(null)}
                className="rounded-md border border-[#D4D4D4] px-3.5 py-1.5 text-xs font-semibold text-[#525252] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === disableModalWidget.docId}
                className="rounded-md bg-[#A90706] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
              >
                Disable Widget
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
