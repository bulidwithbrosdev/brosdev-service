import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  Globe,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  addWidgetDomain,
  listWidgetDomains,
  removeWidgetDomain,
  updateWidgetDomainAccessSettings,
  verifyWidgetDomain,
} from '../widget-api/widgetsFirestore';
import { hasPlanFeature, type PlanLockKey } from '../lib/planLimits';
import type { WorkspaceMe } from '../types';
import type { WidgetDomainRecord, WidgetRecord } from '../widgets/types';

export const WidgetDomainsView: React.FC<{
  workspace: WorkspaceMe;
  widgets: WidgetRecord[];
  initialPublicId?: string;
  onWidgetUpdated: (updated: WidgetRecord) => void;
  onRequestUpgrade: (key: PlanLockKey) => void;
}> = ({ workspace, widgets, initialPublicId, onWidgetUpdated, onRequestUpgrade }) => {
  const [selectedPublicId, setSelectedPublicId] = useState<string>(
    initialPublicId || widgets[0]?.publicId || ''
  );
  const [domains, setDomains] = useState<WidgetDomainRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [allowSubdomainsInput, setAllowSubdomainsInput] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const canRestrictDomains = hasPlanFeature(workspace, 'widgetDomainRestrictions');

  useEffect(() => {
    if (initialPublicId) {
      setSelectedPublicId(initialPublicId);
    } else if (!selectedPublicId && widgets[0]) {
      setSelectedPublicId(widgets[0].publicId);
    }
  }, [initialPublicId, widgets, selectedPublicId]);

  const selectedWidget = widgets.find((w) => w.publicId === selectedPublicId) || null;

  const loadDomains = async (pubId?: string) => {
    if (!pubId) {
      setDomains([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await listWidgetDomains(pubId);
      setDomains(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDomains(selectedPublicId);
  }, [selectedPublicId]);

  const handleToggleRestriction = async (enabled: boolean) => {
    if (!selectedWidget) return;
    if (enabled && !canRestrictDomains) {
      onRequestUpgrade('widgetDomainRestrictions');
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await updateWidgetDomainAccessSettings(selectedWidget, {
        domainRestrictionEnabled: enabled,
        allowSubdomains: selectedWidget.allowSubdomains,
      });
      onWidgetUpdated({ ...selectedWidget, domainRestrictionEnabled: enabled });
      setFeedback({
        kind: 'success',
        text: enabled
          ? 'Domain allowlist enforcement enabled for this widget.'
          : 'Domain restriction disabled — widget can load on any origin.',
      });
    } catch (err: any) {
      setFeedback({ kind: 'error', text: err.message || 'Could not update access settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSubdomains = async (allowSubdomains: boolean) => {
    if (!selectedWidget) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateWidgetDomainAccessSettings(selectedWidget, {
        domainRestrictionEnabled: selectedWidget.domainRestrictionEnabled,
        allowSubdomains,
      });
      onWidgetUpdated({ ...selectedWidget, allowSubdomains });
      setFeedback({
        kind: 'success',
        text: allowSubdomains ? 'Subdomains are now permitted.' : 'Exact domain match enforced.',
      });
    } catch (err: any) {
      setFeedback({ kind: 'error', text: err.message || 'Could not update subdomain policy.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWidget) return;
    if (!canRestrictDomains) {
      onRequestUpgrade('widgetDomainRestrictions');
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const created = await addWidgetDomain({
        widget: selectedWidget,
        domain: newDomain,
        allowSubdomains: allowSubdomainsInput,
      });
      setDomains((prev) => [created, ...prev]);
      const nextAllowed = Array.from(new Set([...selectedWidget.allowedDomains, created.domain]));
      onWidgetUpdated({
        ...selectedWidget,
        allowedDomains: nextAllowed,
        allowSubdomains: selectedWidget.allowSubdomains || allowSubdomainsInput,
      });
      setNewDomain('');
      setFeedback({
        kind: 'success',
        text: `Added ${created.domain}. Add the DNS TXT token below or verify immediately for testing.`,
      });
    } catch (err: any) {
      setFeedback({ kind: 'error', text: err.message || 'Could not add domain.' });
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (dom: WidgetDomainRecord) => {
    setFeedback(null);
    try {
      await verifyWidgetDomain(dom);
      setDomains((prev) =>
        prev.map((d) => (d.docId === dom.docId ? { ...d, verified: true, status: 'active' } : d))
      );
      setFeedback({ kind: 'success', text: `Verified ${dom.domain} and marked active.` });
    } catch (err: any) {
      setFeedback({ kind: 'error', text: err.message || 'Verification failed.' });
    }
  };

  const handleRemove = async (dom: WidgetDomainRecord) => {
    if (!selectedWidget) return;
    setFeedback(null);
    try {
      await removeWidgetDomain(selectedWidget, dom);
      setDomains((prev) => prev.filter((d) => d.docId !== dom.docId));
      onWidgetUpdated({
        ...selectedWidget,
        allowedDomains: selectedWidget.allowedDomains.filter((x) => x !== dom.domain),
      });
      setFeedback({ kind: 'success', text: `Removed ${dom.domain}.` });
    } catch (err: any) {
      setFeedback({ kind: 'error', text: err.message || 'Could not remove domain.' });
    }
  };

  const copyToken = async (id: string, token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // ignore
    }
  };

  if (widgets.length === 0) {
    return (
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-10 text-center space-y-2">
        <Globe className="w-7 h-7 text-[#737373] mx-auto" />
        <div className="text-sm font-bold text-[#111111]">No components to configure yet</div>
        <p className="text-xs text-[#525252]">
          Create and publish a website component first, then configure permitted domains here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Selector & Access Policy */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#111111]">Domain Management &amp; Access Control</h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Restrict published widgets to approved host domains via Origin/Referer validation and server-side rate limiting.
            </p>
          </div>
          <select
            value={selectedPublicId}
            onChange={(e) => setSelectedPublicId(e.target.value)}
            className="rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-semibold text-[#111111] min-w-[240px]"
          >
            {widgets.map((w) => (
              <option key={w.docId} value={w.publicId}>
                {w.name} ({w.publicId})
              </option>
            ))}
          </select>
        </div>

        {selectedWidget && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-[#F0F0F0]">
            <div className="rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-3.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#111111]">Enforce Domain Allowlist</div>
                <div className="text-[11px] text-[#525252] mt-0.5">
                  {canRestrictDomains
                    ? 'Block embeds loaded from unlisted websites'
                    : 'Available on Pro, Business & Agency plans'}
                </div>
              </div>
              {canRestrictDomains ? (
                <input
                  type="checkbox"
                  disabled={saving}
                  checked={selectedWidget.domainRestrictionEnabled}
                  onChange={(e) => void handleToggleRestriction(e.target.checked)}
                  className="h-4 w-4 accent-[#A90706] cursor-pointer"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onRequestUpgrade('widgetDomainRestrictions')}
                  className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#A90706] cursor-pointer shrink-0"
                >
                  <Lock className="w-3 h-3" /> Upgrade
                </button>
              )}
            </div>

            <div className="rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-3.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#111111]">Allow Subdomains</div>
                <div className="text-[11px] text-[#525252] mt-0.5">
                  Match *.example.com automatically
                </div>
              </div>
              <input
                type="checkbox"
                disabled={saving || !canRestrictDomains}
                checked={selectedWidget.allowSubdomains}
                onChange={(e) => void handleToggleSubdomains(e.target.checked)}
                className="h-4 w-4 accent-[#A90706] cursor-pointer disabled:opacity-50"
              />
            </div>

            <div className="rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-3.5">
              <div className="text-[11px] font-semibold text-[#737373]">Integration Status</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#111111]">
                <ShieldCheck
                  className={`w-4 h-4 ${
                    selectedWidget.status === 'published' ? 'text-[#15803D]' : 'text-[#737373]'
                  }`}
                />
                <span>
                  {selectedWidget.status === 'published'
                    ? 'Published & Ready'
                    : selectedWidget.status === 'disabled'
                      ? 'Disabled'
                      : 'Draft (Not Public)'}
                </span>
              </div>
              <div className="text-[11px] text-[#525252] mt-1 font-mono">
                Last load:{' '}
                {selectedWidget.lastLoadedAt
                  ? new Date(selectedWidget.lastLoadedAt).toLocaleString()
                  : 'No live loads yet'}
              </div>
            </div>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs ${
            feedback.kind === 'error'
              ? 'border-[#A90706]/30 bg-[#FEF2F2] text-[#A90706]'
              : 'border-[#15803D]/30 bg-[#F0FDF4] text-[#166534]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Add Domain Form */}
      <form
        onSubmit={handleAddDomain}
        className="rounded-lg border border-[#E5E5E5] bg-white p-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[220px] space-y-1">
          <label className="block text-xs font-semibold text-[#111111]">Add Permitted Domain</label>
          <input
            type="text"
            required
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="example.com or shop.brand.io"
            className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-xs focus:border-[#A90706] focus:outline-none"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-[#333333] pb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allowSubdomainsInput}
            onChange={(e) => setAllowSubdomainsInput(e.target.checked)}
            className="h-4 w-4 accent-[#A90706]"
          />
          Include subdomains
        </label>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer disabled:opacity-50"
        >
          {!canRestrictDomains ? <Lock className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {canRestrictDomains ? 'Add Domain' : 'Unlock Domain Allowlist'}
        </button>
      </form>

      {/* Domains Table */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between">
          <span className="text-xs font-bold text-[#111111]">
            Configured Domains ({domains.length})
          </span>
          <span className="text-[11px] text-[#737373]">
            Origin &amp; Referer validation + server-side rate limiting
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#737373]">Loading permitted domains...</div>
        ) : domains.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">
            No domains added for this widget yet. Add your production domain above to lock embeds to your site.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                  <th className="px-4 py-2.5">Domain</th>
                  <th className="px-4 py-2.5">Subdomains</th>
                  <th className="px-4 py-2.5">Verification Token (TXT)</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {domains.map((dom) => (
                  <tr key={dom.docId} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-mono font-semibold text-[#111111]">{dom.domain}</td>
                    <td className="px-4 py-3 text-[#525252]">
                      {dom.allowSubdomains ? `*.${dom.domain}` : 'Exact only'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-[#F5F5F5] px-2 py-0.5 font-mono text-[11px] text-[#333333]">
                          {dom.verificationToken}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyToken(dom.docId, dom.verificationToken)}
                          className="p-1 text-[#525252] hover:text-[#111111] cursor-pointer"
                          title="Copy DNS TXT value"
                        >
                          {copiedId === dom.docId ? (
                            <Check className="w-3.5 h-3.5 text-[#15803D]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {dom.verified ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <span className="font-semibold text-[#B45309]">Pending verification</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {!dom.verified && (
                          <button
                            type="button"
                            onClick={() => void handleVerify(dom)}
                            className="rounded border border-[#111111] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111111] hover:bg-[#111111] hover:text-white cursor-pointer"
                          >
                            Verify Domain
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleRemove(dom)}
                          className="p-1 text-[#737373] hover:text-[#A90706] cursor-pointer"
                          title="Remove domain"
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
    </div>
  );
};
