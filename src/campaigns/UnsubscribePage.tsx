import React, { useEffect, useState } from 'react';
import { CheckCircle2, MailX, ShieldCheck, AlertTriangle } from 'lucide-react';
import { buildApiUrl } from '../lib/api';

export function UnsubscribePage() {
  const [token] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing unsubscribe token. Please use the unsubscribe link inside your email.');
      return;
    }
    let cancelled = false;
    fetch(buildApiUrl(`/api/campaigns/unsubscribe?token=${encodeURIComponent(token)}`))
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data?.ok) {
          setStatus('error');
          setMessage(data?.error || 'This unsubscribe link is invalid or expired.');
          return;
        }
        setEmail(String(data.email || ''));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setMessage('Unable to verify unsubscribe link right now. Please try again.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirmUnsubscribe() {
    setSubmitting(true);
    try {
      const resp = await fetch(buildApiUrl('/api/campaigns/unsubscribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        setStatus('error');
        setMessage(data?.error || 'Could not process unsubscribe request.');
      } else {
        setStatus('done');
        setMessage(
          data.note ||
            'You have been unsubscribed from future marketing emails. Transactional account emails remain unaffected.'
        );
      }
    } catch {
      setStatus('error');
      setMessage('Network error processing unsubscribe request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-[#111111] text-white flex items-center justify-center">
            <MailX className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#111111]">Email Subscription Preferences</h1>
            <p className="text-xs text-neutral-500">BrosDev Developer Services</p>
          </div>
        </div>

        {status === 'loading' && (
          <p className="text-sm text-neutral-600 py-6">Verifying your signed unsubscribe link...</p>
        )}

        {status === 'ready' && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-700 leading-relaxed">
              Confirm that you want to unsubscribe{' '}
              <span className="font-mono font-semibold text-[#111111]">{email}</span> from future
              newsletters and announcement campaigns.
            </p>
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-600 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
              <span>
                This only stops marketing and newsletter campaigns. Essential transactional emails
                (receipts, password resets, form alerts) are not affected.
              </span>
            </div>
            <button
              type="button"
              onClick={confirmUnsubscribe}
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#A90706] hover:bg-[#8E0605] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Processing...' : 'Confirm Unsubscribe'}
            </button>
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Unsubscribed Successfully</span>
            </div>
            <p className="text-sm text-neutral-600 leading-relaxed">{message}</p>
            {email && (
              <p className="text-xs font-mono text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-md px-3 py-2">
                Suppressed address: {email}
              </p>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#A90706] font-semibold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Verification Error</span>
            </div>
            <p className="text-sm text-neutral-600">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
