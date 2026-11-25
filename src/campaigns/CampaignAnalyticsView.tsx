import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info, Link2, MailCheck, MousePointerClick, ShieldAlert } from 'lucide-react';
import type {
  EmailCampaignRecord,
  EmailDeliveryEventRecord,
  EmailScheduledJobRecord,
} from './types';

interface Props {
  campaigns: EmailCampaignRecord[];
  deliveryEvents: EmailDeliveryEventRecord[];
  scheduledJobs: EmailScheduledJobRecord[];
}

export function CampaignAnalyticsView({ campaigns, deliveryEvents, scheduledJobs }: Props) {
  const [rangeDays, setRangeDays] = useState<number>(30);

  const filteredEvents = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 24 * 3600 * 1000;
    return deliveryEvents.filter((e) => {
      const ts = Date.parse(e.occurredAt || e.createdAt);
      return Number.isNaN(ts) || ts >= cutoff;
    });
  }, [deliveryEvents, rangeDays]);

  const counts = useMemo(() => {
    const out = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 0,
      failed: 0,
    };
    for (const e of filteredEvents) {
      if (e.eventType in out) {
        out[e.eventType as keyof typeof out] += 1;
      }
    }
    return out;
  }, [filteredEvents]);

  const denom = Math.max(1, counts.delivered || counts.sent);
  const openRate = counts.sent || counts.delivered ? ((counts.opened / denom) * 100).toFixed(1) : '0.0';
  const clickRate = counts.sent || counts.delivered ? ((counts.clicked / denom) * 100).toFixed(1) : '0.0';
  const bounceRate = counts.sent ? ((counts.bounced / Math.max(1, counts.sent)) * 100).toFixed(1) : '0.0';
  const unsubRate = counts.sent || counts.delivered ? ((counts.unsubscribed / denom) * 100).toFixed(1) : '0.0';

  const chartData = useMemo(() => {
    const buckets = new Map<string, { date: string; sent: number; delivered: number; opened: number; clicked: number }>();
    for (const e of filteredEvents) {
      const day = String(e.occurredAt || e.createdAt).slice(0, 10);
      if (!day) continue;
      if (!buckets.has(day)) {
        buckets.set(day, { date: day, sent: 0, delivered: 0, opened: 0, clicked: 0 });
      }
      const b = buckets.get(day)!;
      if (e.eventType === 'sent') b.sent += 1;
      if (e.eventType === 'delivered') b.delivered += 1;
      if (e.eventType === 'opened') b.opened += 1;
      if (e.eventType === 'clicked') b.clicked += 1;
    }
    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredEvents]);

  const topLinks = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredEvents) {
      if (e.eventType === 'clicked' && e.linkUrl) {
        map.set(e.linkUrl, (map.get(e.linkUrl) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([url, clicks]) => ({ url, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8);
  }, [filteredEvents]);

  const campaignNameMap = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c.name])),
    [campaigns]
  );

  return (
    <div className="space-y-4">
      {/* Header & Date Filter */}
      <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#111111]">Campaign Delivery &amp; Engagement Analytics</h3>
          <p className="text-xs text-neutral-500">
            Powered by verified Resend dispatch logs and signed Resend webhook events.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                rangeDays === days
                  ? 'bg-[#111111] text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Last {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Honest Email Open Tracking Accuracy Notice */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-xs text-neutral-700 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
        <span>
          <strong>Measurement Note:</strong> Delivered, bounce, complaint, and click counts reflect
          real provider events reported by Resend webhooks (<code className="font-mono">/api/webhooks/resend</code>).
          Email open rates are inherently approximate due to Apple Mail Privacy Protection (MPP) and
          client image proxying.
        </span>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Sent', value: counts.sent.toLocaleString(), sub: `${counts.failed} failed` },
          { label: 'Delivered', value: counts.delivered.toLocaleString(), sub: 'Resend confirmed' },
          { label: 'Open Rate*', value: `${openRate}%`, sub: `${counts.opened} opens` },
          { label: 'Click Rate', value: `${clickRate}%`, sub: `${counts.clicked} clicks` },
          { label: 'Bounce Rate', value: `${bounceRate}%`, sub: `${counts.bounced} bounced` },
          { label: 'Unsubscribe', value: `${unsubRate}%`, sub: `${counts.complained} complaints` },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-neutral-200 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {kpi.label}
            </div>
            <div className="text-xl font-bold text-[#111111] font-mono tabular-nums mt-1">
              {kpi.value}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5 font-mono tabular-nums">
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
            Daily Provider Event Volume
          </h4>
          <span className="text-[11px] text-neutral-400 font-mono">
            {filteredEvents.length} recorded event(s)
          </span>
        </div>
        {chartData.length === 0 ? (
          <div className="h-52 flex flex-col items-center justify-center text-xs text-neutral-500">
            <MailCheck className="w-7 h-7 text-neutral-300 mb-2" />
            <p>No campaign delivery events recorded in the last {rangeDays} days.</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Send a campaign or configure your Resend webhook endpoint to populate live trends.
            </p>
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#525252' }} />
                <YAxis tick={{ fontSize: 11, fill: '#525252' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="sent" name="Sent" fill="#111111" radius={[3, 3, 0, 0]} />
                <Bar dataKey="delivered" name="Delivered" fill="#16A34A" radius={[3, 3, 0, 0]} />
                <Bar dataKey="opened" name="Opened" fill="#A90706" radius={[3, 3, 0, 0]} />
                <Bar dataKey="clicked" name="Clicked" fill="#D97706" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Campaign Comparison & Top Clicked Links */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 font-bold text-xs text-[#111111]">
            Campaign Comparison
          </div>
          {campaigns.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">No campaigns yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                    <th className="py-2 px-4 font-semibold">Campaign</th>
                    <th className="py-2 px-4 font-semibold">Status</th>
                    <th className="py-2 px-4 font-semibold text-right">Sent</th>
                    <th className="py-2 px-4 font-semibold text-right">Delivered</th>
                    <th className="py-2 px-4 font-semibold text-right">Opens</th>
                    <th className="py-2 px-4 font-semibold text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {campaigns.slice(0, 12).map((cmp) => {
                    const evts = deliveryEvents.filter((e) => e.campaignId === cmp.id);
                    const cSent = evts.filter((e) => e.eventType === 'sent').length || cmp.stats.sent;
                    const cDel = evts.filter((e) => e.eventType === 'delivered').length;
                    const cOpen = evts.filter((e) => e.eventType === 'opened').length;
                    const cClick = evts.filter((e) => e.eventType === 'clicked').length;
                    return (
                      <tr key={cmp.id} className="hover:bg-neutral-50">
                        <td className="py-2.5 px-4 font-semibold text-[#111111]">{cmp.name}</td>
                        <td className="py-2.5 px-4 capitalize text-neutral-600">{cmp.status}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{cSent}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{cDel}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{cOpen}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{cClick}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 font-bold text-xs text-[#111111]">
            <MousePointerClick className="w-4 h-4 text-[#A90706]" /> Top Clicked Links
          </div>
          {topLinks.length === 0 ? (
            <p className="text-xs text-neutral-500 py-4">
              Click events reported by Resend webhooks will appear here.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {topLinks.map((lnk) => (
                <div
                  key={lnk.url}
                  className="flex items-center justify-between gap-2 p-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Link2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="font-mono text-[11px] text-neutral-700 truncate">
                      {lnk.url}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-[#111111] tabular-nums">
                    {lnk.clicks}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Delivery Events & Job Failures */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <span className="font-bold text-xs text-[#111111]">Recent Provider Delivery Events</span>
          <span className="text-[11px] font-mono text-neutral-500">
            {scheduledJobs.filter((j) => j.status === 'failed').length} failed job(s)
          </span>
        </div>
        {filteredEvents.length === 0 ? (
          <div className="p-6 text-center text-xs text-neutral-500">No events logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                  <th className="py-2 px-4 font-semibold">Event</th>
                  <th className="py-2 px-4 font-semibold">Recipient</th>
                  <th className="py-2 px-4 font-semibold">Campaign</th>
                  <th className="py-2 px-4 font-semibold">Provider ID / Detail</th>
                  <th className="py-2 px-4 font-semibold text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredEvents.slice(0, 20).map((evt) => (
                  <tr key={evt.id}>
                    <td className="py-2 px-4">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[11px] uppercase font-semibold ${
                          ['delivered', 'opened', 'clicked'].includes(evt.eventType)
                            ? 'text-emerald-700'
                            : ['bounced', 'complained', 'failed'].includes(evt.eventType)
                              ? 'text-[#A90706]'
                              : 'text-neutral-700'
                        }`}
                      >
                        {['bounced', 'complained', 'failed'].includes(evt.eventType) && (
                          <ShieldAlert className="w-3 h-3" />
                        )}
                        {evt.eventType}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono text-[11px]">{evt.subscriberEmail}</td>
                    <td className="py-2 px-4 text-neutral-700">
                      {campaignNameMap.get(evt.campaignId) || evt.campaignId}
                    </td>
                    <td className="py-2 px-4 font-mono text-[11px] text-neutral-500 truncate max-w-[260px]">
                      {evt.errorMessage || evt.linkUrl || evt.providerMessageId || '—'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-[11px] text-neutral-500">
                      {new Date(evt.occurredAt).toLocaleString()}
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
}
