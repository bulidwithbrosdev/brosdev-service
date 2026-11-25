import React, { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Mail, RefreshCw, ShieldAlert, Users, Webhook } from 'lucide-react';
import {
  adminFetchCampaignOverview,
  adminToggleCampaignAbuseFlag,
  adminToggleCampaignAccountSuspension,
  type AdminCampaignOverview,
} from './campaignsFirestore';

export function AdminCampaignsView() {
  const [data, setData] = useState<AdminCampaignOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetchCampaignOverview();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign administration data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSuspendOwner(ownerUid: string, currentlySuspended: boolean) {
    setBusyId(ownerUid);
    try {
      await adminToggleCampaignAccountSuspension(ownerUid, !currentlySuspended);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId('');
    }
  }

  async function handleToggleCampaignAbuse(campaignId: string, flagged: boolean) {
    setBusyId(campaignId);
    try {
      await adminToggleCampaignAbuseFlag(campaignId, !flagged);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId('');
    }
  }

  const totalSubscribers = data
    ? Object.values(data.subscriberCountByOwner).reduce((a, b) => a + b, 0)
    : 0;
  const totalSent = data
    ? data.campaigns.reduce((sum, c) => sum + Number(c.stats.sent || 0), 0)
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#111111]">Email Campaigns &amp; Abuse Oversight</h2>
          <p className="text-xs text-neutral-500">
            Monitor customer campaign volume, Resend webhook health, suppressions, and suspend
            abusive sending accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 rounded-lg"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#A90706]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Campaigns', value: data?.campaigns.length ?? 0, icon: Mail },
          { label: 'Emails Dispatched', value: totalSent, icon: CheckCircle2 },
          { label: 'Total Subscribers', value: totalSubscribers, icon: Users },
          { label: 'Bounce / Fail Events', value: data?.failedDeliveriesCount ?? 0, icon: ShieldAlert },
          { label: 'Webhook Events', value: data?.webhookEvents.length ?? 0, icon: Webhook },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  {card.label}
                </span>
                <Icon className="w-4 h-4 text-neutral-400" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#111111] mt-1">
                {card.value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Customer Campaigns Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 font-bold text-xs text-[#111111]">
          All Workspace Campaigns ({data?.campaigns.length ?? 0})
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading campaign ledger...</div>
        ) : !data || data.campaigns.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            No email campaigns created across customer accounts yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                  <th className="py-2.5 px-4 font-semibold">Campaign</th>
                  <th className="py-2.5 px-4 font-semibold">Owner UID</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Sent</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Workspace Subs</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.campaigns.map((cmp) => {
                  const ownerSuspended = data.suspendedOwnerUids.includes(cmp.ownerUid);
                  return (
                    <tr key={cmp.id} className="hover:bg-neutral-50">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-[#111111]">{cmp.name}</div>
                        <div className="text-[11px] text-neutral-500 truncate max-w-xs">
                          {cmp.subject}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-neutral-600">
                        {cmp.ownerUid.slice(0, 14)}...
                      </td>
                      <td className="py-2.5 px-4 capitalize">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            cmp.abuseSuspended || ownerSuspended
                              ? 'bg-red-50 text-[#A90706]'
                              : cmp.status === 'sent'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {cmp.abuseSuspended ? 'Abuse Paused' : cmp.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {(cmp.stats.sent || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {(data.subscriberCountByOwner[cmp.ownerUid] || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={busyId === cmp.id}
                          onClick={() => handleToggleCampaignAbuse(cmp.id, cmp.abuseSuspended)}
                          className="text-xs font-semibold text-neutral-700 hover:text-[#A90706]"
                        >
                          {cmp.abuseSuspended ? 'Unflag' : 'Pause Abuse'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === cmp.ownerUid}
                          onClick={() => handleSuspendOwner(cmp.ownerUid, ownerSuspended)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#A90706] hover:underline"
                        >
                          <Ban className="w-3 h-3" />
                          {ownerSuspended ? 'Unsuspend Account' : 'Suspend Account'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resend Webhook Audit Ledger */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 font-bold text-xs text-[#111111]">
          Recent Verified Resend Webhook Events ({data?.webhookEvents.length ?? 0})
        </div>
        {!data || data.webhookEvents.length === 0 ? (
          <div className="p-6 text-center text-xs text-neutral-500">
            No verified Resend webhook deliveries recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                  <th className="py-2 px-4 font-semibold">Event</th>
                  <th className="py-2 px-4 font-semibold">Recipient</th>
                  <th className="py-2 px-4 font-semibold">Campaign ID</th>
                  <th className="py-2 px-4 font-semibold">Status</th>
                  <th className="py-2 px-4 font-semibold text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono text-[11px]">
                {data.webhookEvents.slice(0, 20).map((wh) => (
                  <tr key={wh.id}>
                    <td className="py-2 px-4 font-semibold text-[#111111]">{wh.eventType}</td>
                    <td className="py-2 px-4">{wh.recipientEmail}</td>
                    <td className="py-2 px-4 text-neutral-500">{wh.campaignId}</td>
                    <td className="py-2 px-4 capitalize text-emerald-700">{wh.status}</td>
                    <td className="py-2 px-4 text-right text-neutral-500">
                      {new Date(wh.receivedAt).toLocaleString()}
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
