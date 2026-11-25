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
import { Activity, BarChart3, RefreshCw, Zap } from 'lucide-react';
import { getWidgetAnalytics, recordWidgetEventClient } from '../widget-api/widgetsFirestore';
import { getWidgetDefinition } from '../widgets/catalog';
import type { WidgetAnalyticsOverview, WidgetRecord } from '../widgets/types';

export const WidgetAnalyticsView: React.FC<{
  widgets: WidgetRecord[];
}> = ({ widgets }) => {
  const [days, setDays] = useState<number>(14);
  const [filterPublicId, setFilterPublicId] = useState<string>('all');
  const [data, setData] = useState<WidgetAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingPing, setTestingPing] = useState(false);

  const loadAnalytics = async (rangeDays = days, pubId = filterPublicId) => {
    setLoading(true);
    try {
      const res = await getWidgetAnalytics(rangeDays, pubId);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics(days, filterPublicId);
  }, [days, filterPublicId]);

  const publishedWidgets = widgets.filter((w) => w.status === 'published');

  const handleRecordTestInteraction = async () => {
    const target =
      filterPublicId !== 'all'
        ? publishedWidgets.find((w) => w.publicId === filterPublicId)
        : publishedWidgets[0];
    if (!target) return;
    setTestingPing(true);
    try {
      await recordWidgetEventClient({ publicId: target.publicId, eventType: 'impression', device: 'desktop' });
      await recordWidgetEventClient({ publicId: target.publicId, eventType: 'cta_click', device: 'desktop' });
      await loadAnalytics(days, filterPublicId);
    } finally {
      setTestingPing(false);
    }
  };

  const deviceChartData = data
    ? [
        { device: 'Desktop', count: data.devices.desktop },
        { device: 'Tablet', count: data.devices.tablet },
        { device: 'Mobile', count: data.devices.mobile },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#111111]">Widget Analytics</h2>
          <p className="text-xs text-[#525252] mt-0.5">
            Privacy-conscious aggregated metrics with daily visitor hashing, event deduplication, and zero PII storage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterPublicId}
            onChange={(e) => setFilterPublicId(e.target.value)}
            className="rounded-md border border-[#D4D4D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#111111]"
          >
            <option value="all">All Components ({widgets.length})</option>
            {widgets.map((w) => (
              <option key={w.docId} value={w.publicId}>
                {w.name}
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-md border border-[#D4D4D4] bg-[#FAFAFA] p-0.5 text-xs">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                  days === d ? 'bg-[#111111] text-white' : 'text-[#525252] hover:text-[#111111]'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {publishedWidgets.length > 0 && (
            <button
              type="button"
              disabled={testingPing}
              onClick={() => void handleRecordTestInteraction()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-[#A90706]" />
              {testingPing ? 'Sending...' : 'Send Test Event'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void loadAnalytics(days, filterPublicId)}
            className="p-1.5 rounded-md border border-[#D4D4D4] bg-white text-[#525252] hover:text-[#111111] cursor-pointer"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Views', value: (data?.totalViews ?? 0).toLocaleString() },
          { label: 'Unique Visitors', value: (data?.uniqueVisitors ?? 0).toLocaleString() },
          { label: 'Total Clicks', value: (data?.totalClicks ?? 0).toLocaleString() },
          { label: 'CTA Conversions', value: (data?.ctaConversions ?? 0).toLocaleString() },
          { label: 'Engagement Rate', value: `${data?.engagementRate ?? 0}%` },
          { label: 'Conversion Rate', value: `${data?.conversionRate ?? 0}%` },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-[#E5E5E5] bg-white p-4">
            <div className="text-[11px] font-semibold text-[#737373]">{kpi.label}</div>
            <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums text-[#111111]">
              {loading ? '—' : kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-lg border border-[#E5E5E5] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#111111]">
              <Activity className="w-4 h-4 text-[#A90706]" />
              Daily Views &amp; Clicks ({days} days)
            </div>
            <span className="text-[11px] text-[#737373]">Aggregated per UTC day</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.dailySeries || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#737373' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E5E5E5' }} />
                <Area
                  type="monotone"
                  dataKey="views"
                  name="Views"
                  stroke="#111111"
                  fill="#111111"
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  name="Clicks"
                  stroke="#A90706"
                  fill="#A90706"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-[#E5E5E5] bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#111111]">
            <BarChart3 className="w-4 h-4 text-[#A90706]" />
            Device Breakdown
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deviceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" />
                <XAxis dataKey="device" tick={{ fontSize: 11, fill: '#525252' }} />
                <YAxis tick={{ fontSize: 11, fill: '#737373' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="Events" fill="#A90706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-3 border-t border-[#F0F0F0] grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-[#FAFAFA] p-2">
              <div className="text-[10px] text-[#737373]">Popup Opens / Closes</div>
              <div className="font-mono font-bold tabular-nums text-[#111111]">
                {data?.popupOpens ?? 0} / {data?.popupCloses ?? 0}
              </div>
            </div>
            <div className="rounded bg-[#FAFAFA] p-2">
              <div className="text-[10px] text-[#737373]">Consent Accept / Reject</div>
              <div className="font-mono font-bold tabular-nums text-[#111111]">
                {data?.consentAccepts ?? 0} / {data?.consentRejects ?? 0}
              </div>
            </div>
            <div className="rounded bg-[#FAFAFA] p-2">
              <div className="text-[10px] text-[#737373]">Script Loads</div>
              <div className="font-mono font-bold tabular-nums text-[#111111]">
                {data?.totalLoads ?? 0}
              </div>
            </div>
            <div className="rounded bg-[#FAFAFA] p-2">
              <div className="text-[10px] text-[#737373]">Component Errors</div>
              <div className="font-mono font-bold tabular-nums text-[#A90706]">
                {data?.errors ?? 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Performing Widgets */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E5E5E5] flex items-center justify-between">
          <span className="text-xs font-bold text-[#111111]">Top Performing Components</span>
          <span className="text-[11px] text-[#737373]">Sorted by impressions &amp; clicks</span>
        </div>

        {!data || data.topWidgets.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">
            Publish a widget and embed it on your site (or click "Send Test Event") to start collecting live analytics.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                  <th className="px-4 py-2.5">Component</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Views</th>
                  <th className="px-4 py-2.5 text-right">Clicks</th>
                  <th className="px-4 py-2.5 text-right">CTA Conversions</th>
                  <th className="px-4 py-2.5 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {data.topWidgets.map((row) => (
                  <tr key={row.publicId} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#111111]">{row.name}</div>
                      <div className="font-mono text-[11px] text-[#737373]">{row.publicId}</div>
                    </td>
                    <td className="px-4 py-3 text-[#525252]">{getWidgetDefinition(row.type).name}</td>
                    <td className="px-4 py-3 capitalize font-semibold">
                      <span
                        className={
                          row.status === 'published'
                            ? 'text-[#15803D]'
                            : row.status === 'disabled'
                              ? 'text-[#A90706]'
                              : 'text-[#737373]'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#111111]">
                      {row.views.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#111111]">
                      {row.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#111111]">
                      {row.conversions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#A90706]">
                      {row.engagementRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
