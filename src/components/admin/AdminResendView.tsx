import React, { useEffect, useState } from 'react';
import { ShieldCheck, Send, RefreshCw, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface ResendConfigResponse {
  config: {
    provider: string;
    hasApiKey: boolean;
    apiKeyMasked: string;
    sendingDomain: string;
    defaultSenderName: string;
    defaultSenderEmail: string;
    defaultReplyTo: string;
    defaultEmailFooter: string;
    globalNotificationsEnabled: boolean;
    connectionStatus: 'unconfigured' | 'connected' | 'error';
    lastTestedAt: string | null;
    lastError: string | null;
    rateLimitLimit: number | null;
    rateLimitRemaining: number | null;
    rateLimitResetAt: string | null;
  };
  monthlyEmailsSent: number;
  webhookEndpoint: string;
  webhookSecretConfigured: boolean;
}

export const AdminResendView: React.FC = () => {
  const [data, setData] = useState<ResendConfigResponse | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [sendingDomain, setSendingDomain] = useState('brosdev.xyz');
  const [defaultSenderName, setDefaultSenderName] = useState('BrosDev Forms');
  const [defaultSenderEmail, setDefaultSenderEmail] = useState('forms@brosdev.xyz');
  const [defaultReplyTo, setDefaultReplyTo] = useState('support@brosdev.xyz');
  const [defaultEmailFooter, setDefaultEmailFooter] = useState('');
  const [globalEnabled, setGlobalEnabled] = useState(true);

  const [testEmailTo, setTestEmailTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [domains, setDomains] = useState<Array<{ name: string; status: string }>>([]);
  const [serverEnvConfigured, setServerEnvConfigured] = useState<boolean | null>(null);

  const load = async () => {
    try {
      const [res, health] = await Promise.all([
        apiRequest<ResendConfigResponse>('/api/admin/resend'),
        fetch('/api/health').then((r) => r.json()).catch(() => ({ resendConfigured: false })),
      ]);
      setData(res);
      setServerEnvConfigured(Boolean(health?.resendConfigured));
      if (res.config) {
        setSendingDomain(res.config.sendingDomain);
        setDefaultSenderName(res.config.defaultSenderName);
        setDefaultSenderEmail(res.config.defaultSenderEmail);
        setDefaultReplyTo(res.config.defaultReplyTo);
        setDefaultEmailFooter(res.config.defaultEmailFooter);
        setGlobalEnabled(res.config.globalNotificationsEnabled);
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || 'Super Admin access required' });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest('/api/admin/resend', {
        method: 'PUT',
        body: {
          apiKey: apiKeyInput.trim() || undefined,
          sendingDomain,
          defaultSenderName,
          defaultSenderEmail,
          defaultReplyTo,
          defaultEmailFooter,
          globalNotificationsEnabled: globalEnabled,
        },
      });
      setApiKeyInput('');
      setFeedback({
        ok: true,
        text: 'Resend configuration saved and encrypted at rest on the server.',
      });
      await load();
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        ok: boolean;
        message: string;
        domains: Array<{ name: string; status: string }>;
      }>('/api/admin/resend/test-connection', { method: 'POST' });
      setDomains(res.domains || []);
      setFeedback({ ok: res.ok, text: res.message });
      await load();
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || 'Connection test failed' });
    } finally {
      setTestingConn(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingTest(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ status: string; resendMessageId?: string; error?: string }>(
        '/api/admin/resend/send-test',
        { method: 'POST', body: { to: testEmailTo } }
      );
      if (res.status === 'accepted') {
        setFeedback({
          ok: true,
          text: `Test email accepted by Resend (Message ID: ${res.resendMessageId}). Delivery confirmation arrives via webhook.`,
        });
      } else {
        setFeedback({ ok: false, text: res.error || 'Failed to send test email' });
      }
      await load();
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || 'Failed to send test email' });
    } finally {
      setSendingTest(false);
    }
  };

  const statusColor =
    data?.config?.connectionStatus === 'connected'
      ? 'text-[#16A34A]'
      : data?.config?.connectionStatus === 'error'
        ? 'text-[#A90706]'
        : 'text-[#D97706]';

  return (
    <div className="space-y-6">
      {/* Status Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252]">Connection Status</div>
          <div className={`mt-1.5 text-lg font-bold capitalize ${statusColor}`}>
            {data?.config?.connectionStatus || 'unconfigured'}
          </div>
          <div className="text-xs text-[#737373] mt-1">
            {data?.config?.lastTestedAt
              ? `Tested ${new Date(data.config.lastTestedAt).toLocaleString()}`
              : 'Not tested yet'}
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252]">Monthly Resend Usage</div>
          <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-[#111111]">
            {(data?.monthlyEmailsSent ?? 0).toLocaleString()} emails
          </div>
          <div className="text-xs text-[#737373] mt-1">Dispatched across all customers</div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252]">Resend Rate Limit</div>
          <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-[#111111]">
            {data?.config?.rateLimitLimit != null
              ? `${data.config.rateLimitRemaining ?? '—'} / ${data.config.rateLimitLimit}`
              : 'Available after send'}
          </div>
          <div className="text-xs text-[#737373] mt-1">Tracked from Resend response headers</div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs text-[#525252]">Delivery Webhooks</div>
          <div className="mt-1.5 text-sm font-bold text-[#111111]">
            {data?.webhookSecretConfigured ? 'Signature Verified' : 'Secret Pending'}
          </div>
          <div className="text-xs font-mono text-[#737373] mt-1 truncate">
            POST {data?.webhookEndpoint || '/api/webhooks/resend'}
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg text-sm border flex items-start gap-2.5 ${
            feedback.ok
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {serverEnvConfigured === false && (
        <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
          <div>
            <strong>External Website Email Routing Requires Server Environment Variable:</strong>{' '}
            Add <code className="font-mono font-semibold">RESEND_API_KEY</code> in your Vercel
            Project Settings &rarr; Environment Variables and redeploy so unauthenticated website
            form submissions (<code className="font-mono">/api/submit/...</code>) can deliver emails
            automatically without exposing your API key.
          </div>
        </div>
      )}

      {data?.config?.lastError && (
        <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#A90706]">
          <strong>Last Recorded Sending Error:</strong> {data.config.lastError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Configuration Form */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-5"
        >
          <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E5]">
            <div>
              <h2 className="text-base font-bold text-[#111111]">Resend API Configuration</h2>
              <p className="text-xs text-[#525252] mt-0.5">
                All customer form emails route through this global platform account. Credentials are
                AES-256-GCM encrypted at rest and never exposed to browsers.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-[#A90706] shrink-0" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#111111] mb-1.5">
              Resend API Key {data?.config?.hasApiKey && `(Saved: ${data.config.apiKeyMasked})`}
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={
                data?.config?.hasApiKey
                  ? 'Leave blank to keep current key, or paste new key to rotate'
                  : 're_xxxxxxxxxxxxxxxxxxxxxxxx'
              }
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                Verified Sending Domain
              </label>
              <input
                type="text"
                required
                value={sendingDomain}
                onChange={(e) => setSendingDomain(e.target.value)}
                placeholder="brosdev.xyz"
                className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                Default Sender Display Name
              </label>
              <input
                type="text"
                required
                value={defaultSenderName}
                onChange={(e) => setDefaultSenderName(e.target.value)}
                placeholder="BrosDev Forms"
                className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                Default Sender Email
              </label>
              <input
                type="email"
                required
                value={defaultSenderEmail}
                onChange={(e) => setDefaultSenderEmail(e.target.value)}
                placeholder="forms@brosdev.xyz"
                className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                Default Reply-To Address
              </label>
              <input
                type="email"
                required
                value={defaultReplyTo}
                onChange={(e) => setDefaultReplyTo(e.target.value)}
                placeholder="support@brosdev.xyz"
                className="w-full px-3 py-2 text-sm font-mono border border-[#D4D4D4] rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#111111] mb-1.5">
              Default Email Footer
            </label>
            <input
              type="text"
              value={defaultEmailFooter}
              onChange={(e) => setDefaultEmailFooter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
            />
          </div>

          <label className="flex items-center justify-between pt-2 border-t border-[#EFEFEF] text-xs font-semibold text-[#111111] cursor-pointer">
            <span>Enable Global Outbound Form Notifications</span>
            <input
              type="checkbox"
              checked={globalEnabled}
              onChange={(e) => setGlobalEnabled(e.target.checked)}
              className="w-4 h-4 accent-[#A90706]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConn}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-md cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConn ? 'animate-spin' : ''}`} />
              {testingConn ? 'Verifying...' : 'Test API Connection & Verify Domain'}
            </button>
          </div>
        </form>

        {/* Right Diagnostics: Send Test Email + Verified Domains */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleSendTest}
            className="bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-4"
          >
            <div>
              <h3 className="text-sm font-bold text-[#111111]">Send Test Email</h3>
              <p className="text-xs text-[#525252] mt-0.5">
                Dispatch a live email via Resend using{' '}
                <code className="font-mono">
                  {defaultSenderName} &lt;{defaultSenderEmail}&gt;
                </code>
                .
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                required
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="admin@brosdev.xyz"
                className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={sendingTest}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#111111] hover:bg-[#333333] rounded-md cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingTest ? 'Dispatching...' : 'Send Test Email'}
            </button>
          </form>

          <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
            <h3 className="text-sm font-bold text-[#111111] mb-2">Verified Resend Domains</h3>
            {domains.length === 0 ? (
              <p className="text-xs text-[#737373]">
                Click &ldquo;Test API Connection &amp; Verify Domain&rdquo; to inspect sender domains
                registered on your Resend account.
              </p>
            ) : (
              <div className="divide-y divide-[#EFEFEF] text-xs">
                {domains.map((d) => (
                  <div key={d.name} className="py-2.5 flex items-center justify-between">
                    <span className="font-mono font-medium text-[#111111]">{d.name}</span>
                    <span
                      className={`font-semibold capitalize ${
                        d.status === 'verified' ? 'text-[#16A34A]' : 'text-[#D97706]'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
