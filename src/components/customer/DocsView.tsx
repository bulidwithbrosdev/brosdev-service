import React, { useState } from 'react';
import { BookOpen, Copy, Check, Download } from 'lucide-react';
import type { WorkspaceMe } from '../../types';

interface DocsViewProps {
  workspace: WorkspaceMe;
}

export const DocsView: React.FC<DocsViewProps> = ({ workspace }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const baseUrl = (
    workspace.publicApiBaseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://forms.brosdev.info')
  ).replace(/\/+$/, '');

  const endpoints = [
    {
      id: 'submit-form',
      method: 'POST',
      path: '/api/submit/{formKey}',
      title: 'Submit Form Data (HTML / Fetch / REST / Multipart)',
      description:
        'Accepts application/json, application/x-www-form-urlencoded, or multipart/form-data. Validates required fields, checks honeypot & origin allowlists, stores submissions in Firestore, dispatches Resend alerts from your dedicated account sender email, and triggers configured webhooks.',
      sample: `curl -X POST "${baseUrl}/api/submit/frm_your_form_key" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"name":"Alex Morgan","email":"alex@company.com","message":"Hello BrosDev!"}'`,
      response: `{
  "ok": true,
  "submissionId": 1764050001234,
  "message": "Thank you! Your submission has been received.",
  "emailDeliveryStatus": "delivered"
}`,
    },
    {
      id: 'embed-script',
      method: 'GET',
      path: '/api/embed/{formKey}',
      title: 'Zero-Dependency JavaScript Form Embed',
      description:
        'Returns a self-contained vanilla JavaScript widget synced live with your form builder schema.',
      sample: `<div data-brosdev-form="frm_your_form_key"></div>
<script src="${baseUrl}/embed/frm_your_form_key" async></script>`,
      response: `// Content-Type: application/javascript; charset=utf-8`,
    },
    {
      id: 'newsletter-subscribe',
      method: 'POST',
      path: '/api/newsletter/{listKey}/subscribe',
      title: 'Public Newsletter Subscribe API',
      description:
        'Adds an email subscriber to an active BrosDev newsletter list with deterministic deduplication. Works natively with HTML <form> or JSON Fetch.',
      sample: `curl -X POST "${baseUrl}/api/newsletter/nwl_your_list_key/subscribe" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"email":"dev@company.com","name":"Sam Patel"}'`,
      response: `{
  "ok": true,
  "alreadySubscribed": false,
  "listKey": "nwl_your_list_key",
  "email": "dev@company.com",
  "message": "Subscribed successfully."
}`,
    },
    {
      id: 'webhook-dispatch',
      method: 'POST',
      path: '/api/webhooks/dispatch',
      title: 'Signed Webhook Dispatcher (HMAC-SHA256)',
      description:
        'Authenticated endpoint that dispatches signed JSON events to verified public HTTPS URLs with SSRF protection and X-BrosDev-Signature headers.',
      sample: `// Headers received by your server:
X-BrosDev-Event: form.submission.created
X-BrosDev-Delivery-Id: whd_1764050001_9a2f1c
X-BrosDev-Timestamp: 1764050001
X-BrosDev-Signature: t=1764050001,v1=<hex-hmac-sha256>`,
      response: `{
  "ok": true,
  "httpStatus": 200,
  "durationMs": 142
}`,
    },
    {
      id: 'short-redirect',
      method: 'GET',
      path: '/r/{slug}',
      title: 'URL Shortener Redirect Endpoint',
      description:
        'Resolves active non-expired short links from Firestore, atomically increments the click count, and responds with HTTP 302 Found.',
      sample: `GET ${baseUrl}/r/launch-2026`,
      response: `HTTP/1.1 302 Found
Location: https://brosdev.info/pricing
Cache-Control: no-store`,
    },
    {
      id: 'razorpay-webhook',
      method: 'POST',
      path: '/api/billing/razorpay/webhook',
      title: 'Razorpay Server-Side Webhook Verification',
      description:
        'Verifies X-Razorpay-Signature using HMAC-SHA256 and timing-safe comparison against RAZORPAY_WEBHOOK_SECRET on the server.',
      sample: `POST ${baseUrl}/api/billing/razorpay/webhook
X-Razorpay-Signature: <hmac_sha256_hex>`,
      response: `{
  "ok": true,
  "verified": true,
  "event": "subscription.charged"
}`,
    },
    {
      id: 'campaign-send',
      method: 'POST',
      path: '/api/campaigns/{id}/send',
      title: 'Send Email Campaign via Resend (Phase 3)',
      description:
        'Authenticated server-side campaign dispatcher. Enforces plan monthly quota, filters global suppressions, attaches RFC 8058 List-Unsubscribe one-click headers, uses per-recipient Idempotency-Key headers, and logs delivery events.',
      sample: `curl -X POST "${baseUrl}/api/campaigns/cmp_abc123/send" \\
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"subject":"Product Update","html":"...","recipients":[{"email":"user@example.com"}]}'`,
      response: `{
  "ok": true,
  "sentCount": 42,
  "failedCount": 0,
  "suppressedCount": 2
}`,
    },
    {
      id: 'resend-webhook',
      method: 'POST',
      path: '/api/webhooks/resend',
      title: 'Resend Delivery Events Webhook (Svix HMAC-SHA256)',
      description:
        'Verifies svix-id, svix-timestamp, and svix-signature against RESEND_WEBHOOK_SECRET, deduplicates event IDs, records delivered/opened/clicked/bounced/complained telemetry, and auto-suppresses hard bounces & spam complaints.',
      sample: `POST ${baseUrl}/api/webhooks/resend
svix-id: msg_2a9b...
svix-timestamp: 1764050001
svix-signature: v1,<base64-hmac-sha256>`,
      response: `{
  "ok": true,
  "eventType": "delivered",
  "deduplicated": false
}`,
    },
    {
      id: 'campaign-unsubscribe',
      method: 'POST',
      path: '/api/campaigns/unsubscribe',
      title: 'Signed One-Click Unsubscribe Endpoint (RFC 8058)',
      description:
        'Verifies HMAC-SHA256 signed unsubscribe tokens from email footers or mail client List-Unsubscribe-Post headers and writes an immediate suppression record.',
      sample: `curl -X POST "${baseUrl}/api/campaigns/unsubscribe?token=<SIGNED_TOKEN>" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "List-Unsubscribe=One-Click"`,
      response: `{
  "ok": true,
  "unsubscribed": true,
  "email": "user@example.com"
}`,
    },
    {
      id: 'campaign-cron',
      method: 'GET',
      path: '/api/cron/campaigns',
      title: 'Scheduled Campaigns & Automations Cron Runner',
      description:
        'Protected by CRON_SECRET Bearer header. Triggered daily at 09:00 UTC by Vercel Cron (Hobby compatible), or invoke more frequently via an external scheduler with your CRON_SECRET token.',
      sample: `curl -X GET "${baseUrl}/api/cron/campaigns" \\
  -H "Authorization: Bearer <CRON_SECRET>"`,
      response: `{
  "ok": true,
  "checkedAt": "2026-11-25T14:00:00.000Z"
}`,
    },
  ];

  const downloadOpenApiSpec = () => {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'BrosDev Developer Services API',
        version: '1.0.0',
        description:
          'Production REST API specification for BrosDev Forms, Email Notifications, Signed Webhooks, Newsletter Lists, and URL Shortener.',
      },
      servers: [{ url: baseUrl }],
      paths: {
        '/api/health': {
          get: { summary: 'API Health Check', responses: { '200': { description: 'OK' } } },
        },
        '/api/submit/{formKey}': {
          post: {
            summary: 'Submit form payload',
            parameters: [{ name: 'formKey', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'Submission accepted' }, '400': { description: 'Validation error' } },
          },
        },
        '/api/embed/{formKey}': {
          get: {
            summary: 'Fetch lightweight JS form embed script',
            parameters: [{ name: 'formKey', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'JavaScript embed bundle' } },
          },
        },
        '/api/newsletter/{listKey}/subscribe': {
          post: {
            summary: 'Subscribe email to newsletter list',
            parameters: [{ name: 'listKey', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '201': { description: 'Subscribed' }, '200': { description: 'Already subscribed' } },
          },
        },
        '/api/webhooks/dispatch': {
          post: {
            summary: 'Dispatch HMAC-SHA256 signed webhook event',
            responses: { '200': { description: 'Dispatch result' }, '401': { description: 'Unauthorized' } },
          },
        },
        '/r/{slug}': {
          get: {
            summary: 'Redirect short URL slug and increment click counter',
            parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '302': { description: 'Redirect to destination URL' }, '404': { description: 'Link not found' } },
          },
        },
        '/api/billing/razorpay/webhook': {
          post: {
            summary: 'Verify Razorpay HMAC webhook signature',
            responses: { '200': { description: 'Signature verified' }, '401': { description: 'Invalid signature' } },
          },
        },
        '/api/campaigns/{id}/test': {
          post: {
            summary: 'Send test email for a campaign via Resend',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'Test email dispatched' }, '401': { description: 'Unauthorized' } },
          },
        },
        '/api/campaigns/{id}/send': {
          post: {
            summary: 'Dispatch email campaign to eligible subscribers via Resend',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'Dispatch summary' }, '403': { description: 'Quota or suspension check failed' } },
          },
        },
        '/api/campaigns/domains': {
          post: {
            summary: 'Create, verify, or list Resend sender domains and DNS records',
            responses: { '200': { description: 'Domain records returned' }, '401': { description: 'Unauthorized' } },
          },
        },
        '/api/campaigns/unsubscribe': {
          post: {
            summary: 'Verify signed unsubscribe token and suppress recipient',
            responses: { '200': { description: 'Recipient unsubscribed' }, '400': { description: 'Invalid token' } },
          },
        },
        '/api/webhooks/resend': {
          post: {
            summary: 'Receive and verify Resend/Svix delivery webhook events',
            responses: { '200': { description: 'Event processed' }, '401': { description: 'Invalid Svix signature' } },
          },
        },
        '/api/cron/campaigns': {
          get: {
            summary: 'Vercel Cron processor for scheduled campaigns & automation jobs',
            responses: { '200': { description: 'Cron check complete' }, '401': { description: 'Invalid CRON_SECRET' } },
          },
        },
      },
    };

    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brosdev-openapi-3.0.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyCode = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            API Documentation &amp; OpenAPI Reference
          </h1>
          <p className="mt-1 text-sm text-[#525252]">
            Base URL: <code className="font-mono font-semibold text-[#111111]">{baseUrl}</code> ·
            Account Sender: <code className="font-mono text-[#111111]">{workspace.user.senderEmail}</code>
          </p>
        </div>
        <button
          type="button"
          onClick={downloadOpenApiSpec}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-4 py-2 text-xs font-semibold text-white hover:bg-[#262626] cursor-pointer whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          Download OpenAPI 3.0 JSON
        </button>
      </div>

      {/* Endpoint Cards */}
      <div className="space-y-4">
        {endpoints.map((ep) => (
          <section
            key={ep.id}
            className="rounded-lg border border-[#E5E5E5] bg-white p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFEF] pb-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`font-mono text-xs font-bold ${
                    ep.method === 'POST' ? 'text-[#A90706]' : 'text-[#16A34A]'
                  }`}
                >
                  {ep.method}
                </span>
                <code className="font-mono text-sm font-semibold text-[#111111]">{ep.path}</code>
              </div>
              <span className="text-xs font-medium text-[#525252]">{ep.title}</span>
            </div>

            <p className="text-xs leading-relaxed text-[#525252]">{ep.description}</p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#525252]">Request / Example</span>
                  <button
                    type="button"
                    onClick={() => copyCode(ep.id, ep.sample)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#111111] hover:text-[#A90706] cursor-pointer"
                  >
                    {copiedKey === ep.id ? <Check className="h-3 w-3 text-[#16A34A]" /> : <Copy className="h-3 w-3" />}
                    {copiedKey === ep.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-md bg-[#111111] p-3.5 font-mono text-xs text-[#F5F5F5]">
                  {ep.sample}
                </pre>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-[#525252]">Response</div>
                <pre className="overflow-x-auto rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-3.5 font-mono text-xs text-[#111111]">
                  {ep.response}
                </pre>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Standard HTTP Status Codes */}
      <section className="rounded-lg border border-[#E5E5E5] bg-white p-6">
        <div className="flex items-center gap-2 border-b border-[#EFEFEF] pb-3">
          <BookOpen className="h-4 w-4 text-[#111111]" />
          <h2 className="text-sm font-bold text-[#111111]">Standard Status Codes &amp; Rate Limits</h2>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {[
            { code: '200 / 201', label: 'Success', desc: 'Request validated and persisted.' },
            { code: '400 / 422', label: 'Validation Error', desc: 'Missing required fields or invalid email/URL.' },
            { code: '401 / 403', label: 'Auth / Domain Denied', desc: 'Invalid API key, signature, or blocked origin.' },
            { code: '429', label: 'Rate Limited', desc: `Plan limit (${workspace.limits.maxApiRequestsPerMin} req/min).` },
          ].map((item) => (
            <div key={item.code} className="rounded border border-[#EFEFEF] bg-[#FAFAFA] p-3">
              <div className="font-mono font-bold text-[#111111]">{item.code}</div>
              <div className="mt-0.5 font-semibold text-[#111111]">{item.label}</div>
              <div className="mt-1 text-[11px] text-[#525252]">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
