import React, { useCallback, useEffect, useState } from 'react';
import {
  Webhook,
  Plus,
  Lock,
  Copy,
  Check,
  Send,
  RotateCw,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Power,
} from 'lucide-react';
import {
  createWebhook,
  deleteWebhook,
  dispatchWebhookEvent,
  listWebhookDeliveries,
  listWebhooks,
  rotateWebhookSecret,
  updateWebhook,
} from '../../lib/devServicesApi';
import { hasPlanFeature, type PlanLockKey } from '../../lib/planLimits';
import type {
  WebhookDeliveryRecord,
  WebhookEventType,
  WebhookRecord,
  WorkspaceMe,
} from '../../types';

const WEBHOOK_EVENTS: Array<{ id: WebhookEventType; label: string }> = [
  { id: 'form.submission.created', label: 'form.submission.created' },
  { id: 'form.submission.updated', label: 'form.submission.updated' },
  { id: 'newsletter.subscriber.created', label: 'newsletter.subscriber.created' },
  { id: 'link.clicked', label: 'link.clicked' },
];

interface WebhooksViewProps {
  workspace: WorkspaceMe;
  onRequestUpgrade: (key: PlanLockKey) => void;
}

export const WebhooksView: React.FC<WebhooksViewProps> = ({ workspace, onRequestUpgrade }) => {
  const canUseWebhooks = hasPlanFeature(workspace, 'webhooks');
  const maxWebhooks = workspace.limits.maxWebhooks ?? (canUseWebhooks ? 10 : 0);
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const webhookLimitReached = canUseWebhooks && webhooks.length >= maxWebhooks;

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEventType[]>(['form.submission.created']);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [hooks, logs] = await Promise.all([listWebhooks(), listWebhookDeliveries()]);
      setWebhooks(hooks);
      setDeliveries(logs);
    } catch (err: any) {
      setError(err?.message || 'Unable to load webhooks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEvent = (ev: WebhookEventType) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseWebhooks) {
      onRequestUpgrade('webhooks');
      return;
    }
    if (webhookLimitReached) {
      onRequestUpgrade('webhooksLimit');
      return;
    }
    setError('');
    setNotice('');
    setCreating(true);
    try {
      const created = await createWebhook({
        name,
        url,
        events: events.length > 0 ? events : ['form.submission.created'],
      });
      setName('');
      setUrl('');
      setEvents(['form.submission.created']);
      setNotice(`Webhook "${created.name}" created with HMAC-SHA256 signing secret.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to create webhook.');
    } finally {
      setCreating(false);
    }
  };

  const handleSendTest = async (hook: WebhookRecord) => {
    if (!canUseWebhooks) {
      onRequestUpgrade('webhooks');
      return;
    }
    setBusyId(hook.docId);
    setError('');
    setNotice('');
    try {
      const ev = hook.events[0] || 'form.submission.created';
      const delivery = await dispatchWebhookEvent(hook, ev, {
        test: true,
        accountId: workspace.user.accountId,
        webhookName: hook.name,
        sampleField: { name: 'Jane Developer', email: 'jane@example.com' },
      });
      setNotice(
        delivery.status === 'succeeded'
          ? `Test webhook delivered to ${hook.url} (HTTP ${delivery.httpStatus} in ${delivery.durationMs}ms).`
          : `Test delivery returned HTTP ${delivery.httpStatus || 'ERR'}: ${delivery.responseSnippet}`
      );
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch test webhook.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryDelivery = async (delivery: WebhookDeliveryRecord) => {
    if (!canUseWebhooks) {
      onRequestUpgrade('webhooks');
      return;
    }
    const hook = webhooks.find((w) => w.id === delivery.webhookId);
    if (!hook) {
      setError('Original webhook endpoint no longer exists.');
      return;
    }
    setBusyId(delivery.docId);
    setError('');
    setNotice('');
    try {
      let parsedPayload: Record<string, unknown> = { retry: true };
      try {
        const env = JSON.parse(delivery.payloadSnippet);
        if (env && typeof env.data === 'object') parsedPayload = env.data;
      } catch {
        // Use fallback payload
      }
      const retried = await dispatchWebhookEvent(
        hook,
        (delivery.eventType as WebhookEventType) || 'form.submission.created',
        parsedPayload,
        delivery
      );
      setNotice(
        retried.status === 'succeeded'
          ? `Retry #${retried.attemptCount} succeeded (HTTP ${retried.httpStatus}).`
          : `Retry #${retried.attemptCount} failed (HTTP ${retried.httpStatus || 'ERR'}).`
      );
      await load();
    } catch (err: any) {
      setError(err?.message || 'Retry failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (hook: WebhookRecord) => {
    if (!canUseWebhooks) {
      onRequestUpgrade('webhooks');
      return;
    }
    setBusyId(hook.docId);
    try {
      await updateWebhook(hook.docId, { isActive: !hook.isActive });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update webhook.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRotateSecret = async (hook: WebhookRecord) => {
    if (!canUseWebhooks) {
      onRequestUpgrade('webhooks');
      return;
    }
    setBusyId(hook.docId);
    try {
      await rotateWebhookSecret(hook.docId);
      setNotice(`Rotated HMAC signing secret for "${hook.name}".`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to rotate secret.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (hook: WebhookRecord) => {
    if (!canUseWebhooks) {
      onRequestUpgrade('webhooks');
      return;
    }
    setBusyId(hook.docId);
    try {
      await deleteWebhook(hook.docId);
      setNotice(`Deleted webhook "${hook.name}".`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete webhook.');
    } finally {
      setBusyId(null);
    }
  };

  const copySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const verifySnippet = `import crypto from 'node:crypto';

export function verifyBrosDevWebhook(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=')));
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${parts.t}.\${rawBody}\`, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 || ''));
}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Webhook Service</h1>
          <p className="mt-1 text-sm text-[#525252]">
            Subscribe your backend to real-time BrosDev events signed with HMAC-SHA256 and protected against private-network SSRF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {!canUseWebhooks && (
            <button
              type="button"
              onClick={() => onRequestUpgrade('webhooks')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock Webhooks
            </button>
          )}
        </div>
      </div>

      {!canUseWebhooks && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-[#111111] bg-[#FAFAFA] p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#E5E5E5] bg-white text-[#A90706]">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#111111]">
                Real-Time Signed Webhooks Require Professional or Business Plan
              </p>
              <p className="mt-0.5 text-xs text-[#525252]">
                Your current <span className="font-semibold text-[#111111]">{workspace.plan?.name || 'Free'}</span> plan
                does not include outbound HTTPS webhooks. Upgrade to Professional ($49/mo) to unlock signed webhook subscriptions and retries.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRequestUpgrade('webhooks')}
            className="shrink-0 rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
          >
            Upgrade Plan
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[#A90706]/30 bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#A90706]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      {/* Create Webhook Endpoint */}
      <section className="rounded-lg border border-[#E5E5E5] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-[#A90706]" />
            <h2 className="text-sm font-bold text-[#111111]">Register Webhook Endpoint</h2>
          </div>
          {!canUseWebhooks ? (
            <button
              type="button"
              onClick={() => onRequestUpgrade('webhooks')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              <Lock className="h-3 w-3" />
              Requires Professional+
            </button>
          ) : webhookLimitReached ? (
            <button
              type="button"
              onClick={() => onRequestUpgrade('webhooksLimit')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              <Lock className="h-3 w-3" />
              Limit reached ({webhooks.length} / {maxWebhooks}) — Upgrade
            </button>
          ) : (
            <span className="text-xs font-medium tabular-nums text-[#525252]">
              {webhooks.length} / {maxWebhooks} endpoints used
            </span>
          )}
        </div>
        <form
          onSubmit={handleCreate}
          noValidate={!canUseWebhooks || webhookLimitReached}
          onClick={() => {
            if (!canUseWebhooks) onRequestUpgrade('webhooks');
            else if (webhookLimitReached) onRequestUpgrade('webhooksLimit');
          }}
          className={`grid grid-cols-1 gap-4 p-6 md:grid-cols-12 ${
            !canUseWebhooks || webhookLimitReached ? 'cursor-pointer opacity-60' : ''
          }`}
        >
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Endpoint Name</label>
            <input
              type="text"
              required
              disabled={!canUseWebhooks || webhookLimitReached || creating}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CRM Lead Sync"
              className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
            />
          </div>
          <div className="md:col-span-8">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
              Public HTTPS Endpoint URL
            </label>
            <input
              type="url"
              required
              disabled={!canUseWebhooks || webhookLimitReached || creating}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.yourcompany.com/webhooks/brosdev"
              className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 font-mono text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
            />
          </div>
          <div className="md:col-span-9">
            <div className="mb-1.5 text-xs font-semibold text-[#111111]">Subscribed Events</div>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((ev) => {
                const active = events.includes(ev.id);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    disabled={!canUseWebhooks || webhookLimitReached}
                    onClick={() => toggleEvent(ev.id)}
                    className={`rounded border px-2.5 py-1 font-mono text-xs transition-colors ${
                      active
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#D4D4D4] bg-white text-[#525252]'
                    }`}
                  >
                    {ev.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-end md:col-span-3">
            <button
              type="submit"
              disabled={creating}
              className={`w-full rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                canUseWebhooks && !webhookLimitReached
                  ? 'bg-[#A90706] text-white hover:bg-[#8C0605] cursor-pointer disabled:opacity-50'
                  : 'border border-[#D4D4D4] bg-[#F5F5F5] text-[#737373] cursor-pointer'
              }`}
            >
              {!canUseWebhooks
                ? 'Locked'
                : webhookLimitReached
                ? 'Webhook Limit Reached'
                : creating
                ? 'Saving...'
                : 'Create Webhook'}
            </button>
          </div>
        </form>
      </section>

      {/* Endpoints Table */}
      <section className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-[#111111]" />
            <h2 className="text-sm font-bold text-[#111111]">Configured Endpoints</h2>
          </div>
          <span className="text-xs tabular-nums text-[#737373]">
            {webhooks.length} / {maxWebhooks} endpoints
          </span>
        </div>

        {webhooks.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">
            No webhook endpoints registered yet. Add an HTTPS URL above to start receiving signed JSON events.
          </div>
        ) : (
          <div className="divide-y divide-[#EFEFEF]">
            {webhooks.map((hook) => (
              <div key={hook.docId} className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#111111]">{hook.name}</span>
                      <span className="text-[#D4D4D4]">·</span>
                      <span
                        className={`text-xs font-semibold ${
                          hook.isActive ? 'text-[#16A34A]' : 'text-[#737373]'
                        }`}
                      >
                        {hook.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-[#525252] break-all">
                      {hook.url}
                    </div>
                    <div className="mt-1 text-[11px] text-[#737373] font-mono">
                      Events: {hook.events.join(' · ')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === hook.docId}
                      onClick={() => handleSendTest(hook)}
                      className="inline-flex items-center gap-1 rounded bg-[#111111] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#262626] cursor-pointer disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      Send Test
                    </button>
                    <button
                      type="button"
                      disabled={busyId === hook.docId}
                      onClick={() => handleToggleActive(hook)}
                      className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] px-2.5 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#FAFAFA] cursor-pointer"
                    >
                      <Power className="h-3 w-3" />
                      {hook.isActive ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === hook.docId}
                      onClick={() => handleRotateSecret(hook)}
                      className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] px-2.5 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#FAFAFA] cursor-pointer"
                    >
                      <RotateCw className="h-3 w-3" />
                      Rotate Secret
                    </button>
                    <button
                      type="button"
                      disabled={busyId === hook.docId}
                      onClick={() => handleDelete(hook)}
                      className="inline-flex items-center rounded border border-[#E5E5E5] p-1.5 text-[#737373] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#FAFAFA] border border-[#EFEFEF] px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 font-mono text-[#525252]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
                    <span>Signing Secret:</span>
                    <span className="text-[#111111]">
                      {hook.signingSecret.slice(0, 14)}••••••••••••••••
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copySecret(hook.docId, hook.signingSecret)}
                    className="inline-flex items-center gap-1 font-semibold text-[#111111] hover:text-[#A90706] cursor-pointer"
                  >
                    {copiedId === hook.docId ? (
                      <>
                        <Check className="h-3 w-3 text-[#16A34A]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy Secret
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delivery History */}
      <section className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
          <h2 className="text-sm font-bold text-[#111111]">Recent Delivery History</h2>
          <span className="text-xs tabular-nums text-[#737373]">{deliveries.length} records</span>
        </div>
        {deliveries.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">
            No webhook deliveries yet. Click "Send Test" on any endpoint to inspect signed HTTP responses.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[#525252]">
                <tr>
                  <th className="px-4 py-3">Event &amp; Endpoint</th>
                  <th className="px-4 py-3">HTTP</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Response</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF]">
                {deliveries.map((d) => (
                  <tr key={d.docId} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-[#111111]">{d.eventType}</div>
                      <div className="max-w-[240px] truncate text-[11px] text-[#737373]">
                        {d.webhookName} · {d.targetUrl}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      <span
                        className={`font-bold ${
                          d.status === 'succeeded' ? 'text-[#16A34A]' : 'text-[#A90706]'
                        }`}
                      >
                        {d.httpStatus || 'ERR'}
                      </span>
                      <span className="ml-1 text-[#737373]">#{d.attemptCount}</span>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[#525252]">
                      {d.durationMs}ms
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 font-mono text-[11px] text-[#525252]">
                      {d.responseSnippet}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#737373]">
                      {new Date(d.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === d.docId}
                        onClick={() => handleRetryDelivery(d)}
                        className="rounded border border-[#D4D4D4] px-2.5 py-1 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer disabled:opacity-50"
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* HMAC Verification Snippet */}
      <section className="rounded-lg border border-[#E5E5E5] bg-white p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#111111]">Verify X-BrosDev-Signature (HMAC-SHA256)</h2>
            <p className="mt-0.5 text-xs text-[#525252]">
              Every webhook includes <code className="font-mono">X-BrosDev-Signature</code>,{' '}
              <code className="font-mono">X-BrosDev-Timestamp</code>, and{' '}
              <code className="font-mono">X-BrosDev-Delivery-Id</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => copySecret('snippet', verifySnippet)}
            className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] px-2.5 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer"
          >
            {copiedId === 'snippet' ? <Check className="h-3.5 w-3.5 text-[#16A34A]" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedId === 'snippet' ? 'Copied' : 'Copy Code'}
          </button>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-md bg-[#111111] p-4 font-mono text-xs text-[#F5F5F5]">
          {verifySnippet}
        </pre>
      </section>
    </div>
  );
};
