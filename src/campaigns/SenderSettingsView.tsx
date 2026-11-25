import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { WorkspaceMe } from '../types';
import type { PlanLockKey } from '../lib/planLimits';
import { hasPlanFeature } from '../lib/planLimits';
import {
  deleteSenderDomainRecord,
  saveSenderSettings,
  syncSenderDomainsFromResend,
} from './campaignsFirestore';
import type {
  AdditionalSenderIdentity,
  EmailSenderDomainRecord,
  EmailSenderSettingsRecord,
} from './types';

interface Props {
  workspace: WorkspaceMe;
  initialSubTab?: 'domains' | 'settings';
  senderSettings: EmailSenderSettingsRecord;
  domains: EmailSenderDomainRecord[];
  onRefresh: () => Promise<void>;
  onRequireUpgrade: (lockKey: PlanLockKey) => void;
}

export function SenderSettingsView({
  workspace,
  initialSubTab = 'domains',
  senderSettings,
  domains,
  onRefresh,
  onRequireUpgrade,
}: Props) {
  const [tab, setTab] = useState<'domains' | 'settings'>(initialSubTab);
  const [form, setForm] = useState<EmailSenderSettingsRecord>(senderSettings);
  const [newDomain, setNewDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [copiedVal, setCopiedVal] = useState('');

  const canMultiSender = hasPlanFeature(workspace, 'multipleSenderIdentities');

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await saveSenderSettings({
        senderName: form.senderName,
        senderEmail: form.senderEmail,
        replyTo: form.replyTo,
        companyName: form.companyName,
        companyWebsite: form.companyWebsite,
        companyLogoUrl: form.companyLogoUrl,
        companyAddress: form.companyAddress,
        defaultFooter: form.defaultFooter,
        additionalIdentities: canMultiSender ? form.additionalIdentities : [],
        doubleOptInDefault: form.doubleOptInDefault,
      });
      await onRefresh();
      setMsg({ kind: 'ok', text: 'Sender identity & compliance footer settings saved.' });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncDomains() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await syncSenderDomainsFromResend('list');
      await onRefresh();
      setMsg({ kind: res.providerConfigured ? 'ok' : 'err', text: res.message });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Resend sync failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await syncSenderDomainsFromResend('create', newDomain.trim());
      setNewDomain('');
      await onRefresh();
      setMsg({ kind: 'ok', text: res.message });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Could not register domain.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyDomain(resendDomainId?: string) {
    if (!resendDomainId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await syncSenderDomainsFromResend('verify', undefined, resendDomainId);
      await onRefresh();
      setMsg({ kind: 'ok', text: res.message });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Verification check failed.' });
    } finally {
      setBusy(false);
    }
  }

  function copyValue(val: string) {
    void navigator.clipboard.writeText(val);
    setCopiedVal(val);
    setTimeout(() => setCopiedVal(''), 1800);
  }

  function addIdentity() {
    if (!canMultiSender) {
      onRequireUpgrade('multipleSenderIdentities');
      return;
    }
    const next: AdditionalSenderIdentity = {
      id: `id_${Date.now()}`,
      name: 'Product Updates',
      email: '',
      replyTo: '',
    };
    setForm((prev) => ({
      ...prev,
      additionalIdentities: [...(prev.additionalIdentities || []), next],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-neutral-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('domains')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              tab === 'domains' ? 'bg-[#111111] text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Resend Sender Domains ({domains.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              tab === 'settings' ? 'bg-[#111111] text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Sender Identity &amp; Compliance Footer
          </button>
        </div>

        {tab === 'domains' && (
          <button
            type="button"
            onClick={handleSyncDomains}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Sync Resend Status
          </button>
        )}
      </div>

      {msg && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            msg.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-[#A90706]'
          }`}
        >
          {msg.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* RESEND DOMAINS & DNS VERIFICATION */}
      {tab === 'domains' && (
        <div className="space-y-4">
          <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#111111]">
                  Domain Authentication (SPF, DKIM &amp; DMARC)
                </h3>
                <p className="text-neutral-500 mt-0.5">
                  Domain statuses come directly from the Resend Domains API. BrosDev never marks a
                  domain verified until Resend confirms DNS propagation.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegisterDomain} className="flex flex-wrap gap-2">
              <input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="mail.yourdomain.com"
                className="flex-1 min-w-[220px] border border-neutral-200 rounded-lg px-3 py-2 font-mono text-xs"
              />
              <button
                type="submit"
                disabled={busy || !newDomain.trim()}
                className="px-4 py-2 bg-[#A90706] hover:bg-[#8E0605] text-white font-semibold rounded-lg disabled:opacity-50"
              >
                Register Domain in Resend
              </button>
            </form>

            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-[11px] text-neutral-600 space-y-1">
              <div className="font-semibold text-[#111111]">Resend Webhook Configuration</div>
              <div>
                Point your Resend Webhook URL to{' '}
                <code className="font-mono text-[#111111]">
                  {workspace.publicApiBaseUrl}/api/webhooks/resend
                </code>{' '}
                for events{' '}
                <code className="font-mono">
                  email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
                </code>{' '}
                and set <code className="font-mono">RESEND_WEBHOOK_SECRET</code> in Vercel.
              </div>
            </div>
          </div>

          {domains.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-xs text-neutral-500 space-y-2">
              <Globe className="w-7 h-7 text-neutral-300 mx-auto" />
              <p className="font-semibold text-[#111111]">No synced Resend domains yet</p>
              <p>
                Click &ldquo;Sync Resend Status&rdquo; to load existing verified domains from your
                Resend account, or register a new domain above.
              </p>
            </div>
          ) : (
            domains.map((dom) => (
              <div
                key={dom.id}
                className="bg-white border border-neutral-200 rounded-xl overflow-hidden text-xs"
              >
                <div className="px-4 py-3 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 bg-neutral-50">
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-neutral-600" />
                    <span className="font-mono font-bold text-[#111111]">{dom.domain}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold ${
                        dom.status === 'verified'
                          ? 'bg-emerald-50 text-emerald-700'
                          : dom.status === 'failed'
                            ? 'bg-red-50 text-[#A90706]'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {dom.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {dom.resendDomainId && dom.status !== 'verified' && (
                      <button
                        type="button"
                        onClick={() => handleVerifyDomain(dom.resendDomainId)}
                        disabled={busy}
                        className="px-2.5 py-1 bg-[#111111] text-white rounded font-semibold"
                      >
                        Trigger Resend Verify
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteSenderDomainRecord(dom.id);
                        await onRefresh();
                      }}
                      className="text-neutral-400 hover:text-[#A90706]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {dom.dnsRecords.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 text-neutral-500 uppercase text-[10px]">
                          <th className="py-2 px-4">Purpose</th>
                          <th className="py-2 px-4">Type</th>
                          <th className="py-2 px-4">Host / Name</th>
                          <th className="py-2 px-4">Value</th>
                          <th className="py-2 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 font-mono text-[11px]">
                        {dom.dnsRecords.map((rec, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-4 font-sans font-semibold text-neutral-700">
                              {rec.record || 'DNS'}
                            </td>
                            <td className="py-2 px-4">{rec.type}</td>
                            <td className="py-2 px-4 break-all">{rec.name}</td>
                            <td className="py-2 px-4 break-all max-w-xs">
                              <button
                                type="button"
                                onClick={() => copyValue(rec.value)}
                                className="inline-flex items-center gap-1 text-left hover:text-[#A90706]"
                              >
                                <span className="truncate max-w-[220px]">{rec.value}</span>
                                <Copy className="w-3 h-3 shrink-0" />
                              </button>
                              {copiedVal === rec.value && (
                                <span className="ml-1 text-emerald-700 font-sans">Copied</span>
                              )}
                            </td>
                            <td className="py-2 px-4 capitalize">{rec.status || dom.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SENDER IDENTITY & COMPLIANCE SETTINGS */}
      {tab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#A90706]" />
              <h3 className="text-sm font-bold text-[#111111]">
                Default Sender Identity &amp; Compliance Footer
              </h3>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#A90706] hover:bg-[#8E0605] text-white font-semibold rounded-lg"
            >
              <Save className="w-3.5 h-3.5" /> {busy ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Default Sender Name</label>
              <input
                value={form.senderName}
                onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Default Sender Email</label>
              <input
                value={form.senderEmail}
                onChange={(e) => setForm({ ...form, senderEmail: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Reply-To Address</label>
              <input
                value={form.replyTo}
                onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
                placeholder="hello@yourdomain.com"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Company Name</label>
              <input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Company Website</label>
              <input
                value={form.companyWebsite}
                onChange={(e) => setForm({ ...form, companyWebsite: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Company Logo URL (HTTPS)</label>
              <input
                value={form.companyLogoUrl}
                onChange={(e) => setForm({ ...form, companyLogoUrl: e.target.value })}
                placeholder="https://..."
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">
                Physical Postal Address (CAN-SPAM / GDPR Compliance)
              </label>
              <input
                value={form.companyAddress}
                onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">
              Default Permission Reminder Footer
            </label>
            <textarea
              rows={2}
              value={form.defaultFooter}
              onChange={(e) => setForm({ ...form, defaultFooter: e.target.value })}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2"
            />
          </div>

          <label className="flex items-center gap-2 text-neutral-700">
            <input
              type="checkbox"
              checked={form.doubleOptInDefault}
              onChange={(e) => setForm({ ...form, doubleOptInDefault: e.target.checked })}
            />
            Require double opt-in by default on newly created audience lists
          </label>

          {/* Additional Sender Identities (Business+) */}
          <div className="pt-3 border-t border-neutral-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="font-bold text-[#111111] flex items-center gap-1.5">
                {!canMultiSender && <Lock className="w-3.5 h-3.5 text-amber-600" />}
                Additional Sender Identities (Business+)
              </div>
              <button
                type="button"
                onClick={addIdentity}
                className="inline-flex items-center gap-1 text-[#A90706] font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Sender Profile
              </button>
            </div>
            {(form.additionalIdentities || []).map((idn, idx) => (
              <div key={idn.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                <input
                  value={idn.name}
                  onChange={(e) => {
                    const next = [...form.additionalIdentities];
                    next[idx] = { ...idn, name: e.target.value };
                    setForm({ ...form, additionalIdentities: next });
                  }}
                  placeholder="Sender Name"
                  className="border border-neutral-200 rounded px-2.5 py-1.5"
                />
                <input
                  value={idn.email}
                  onChange={(e) => {
                    const next = [...form.additionalIdentities];
                    next[idx] = { ...idn, email: e.target.value };
                    setForm({ ...form, additionalIdentities: next });
                  }}
                  placeholder="updates@yourdomain.com"
                  className="border border-neutral-200 rounded px-2.5 py-1.5 font-mono"
                />
                <input
                  value={idn.replyTo}
                  onChange={(e) => {
                    const next = [...form.additionalIdentities];
                    next[idx] = { ...idn, replyTo: e.target.value };
                    setForm({ ...form, additionalIdentities: next });
                  }}
                  placeholder="reply@yourdomain.com"
                  className="border border-neutral-200 rounded px-2.5 py-1.5 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      additionalIdentities: form.additionalIdentities.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-[#A90706] font-semibold text-left"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
