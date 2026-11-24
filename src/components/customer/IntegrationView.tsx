import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, KeyRound, Play, Terminal } from 'lucide-react';
import { FormRecord } from '../../types';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export const IntegrationView: React.FC<{
  form: FormRecord;
  initialSecretKey?: string;
  onBack: () => void;
}> = ({ form, initialSecretKey, onBack }) => {
  const { workspace } = useAuth();
  const [tab, setTab] = useState<'html' | 'javascript' | 'rest' | 'embed'>('html');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string>(initialSecretKey || '');
  const [rotating, setRotating] = useState(false);
  const [endpointMode, setEndpointMode] = useState<'live' | 'production'>('live');
  const [testRunning, setTestRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const liveBase = typeof window !== 'undefined' ? window.location.origin : '';
  const prodBase = workspace?.publicApiBaseUrl || 'https://api.brosdev.xyz';
  const activeEndpoint =
    endpointMode === 'live'
      ? `${liveBase}/api/submit/${form.formKey}`
      : `${prodBase.replace(/\/$/, '')}/submit/${form.formKey}`;
  const embedScriptUrl =
    endpointMode === 'live'
      ? `${liveBase}/api/embed/${form.formKey}.js`
      : `${prodBase.replace(/\/$/, '')}/api/embed/${form.formKey}.js`;

  const inputFields = form.fields.filter(
    (f) => !['submit', 'heading', 'divider'].includes(f.type)
  );
  const hasFileField = inputFields.some((f) => f.type === 'file');

  const sampleJsonObj: Record<string, string> = {};
  for (const f of inputFields) {
    if (f.type === 'email') sampleJsonObj[f.name] = 'alex@company.com';
    else if (f.type === 'phone') sampleJsonObj[f.name] = '+1-555-0192';
    else if (f.type === 'number') sampleJsonObj[f.name] = '42';
    else if (f.type === 'url') sampleJsonObj[f.name] = 'https://example.com';
    else if (f.type === 'date') sampleJsonObj[f.name] = '2026-11-24';
    else sampleJsonObj[f.name] = f.defaultValue || `Sample ${f.label}`;
  }

  const htmlFieldsMarkup = inputFields
    .map((f) => {
      if (f.type === 'hidden') {
        return `  <input type="hidden" name="${f.name}" value="${f.defaultValue || ''}" />`;
      }
      if (f.type === 'long_text') {
        return `  <label>${f.label}\n    <textarea name="${f.name}"${f.required ? ' required' : ''} placeholder="${f.placeholder || ''}"></textarea>\n  </label>`;
      }
      if (f.type === 'dropdown') {
        const opts = (f.options || ['Option 1'])
          .map((o) => `      <option value="${o}">${o}</option>`)
          .join('\n');
        return `  <label>${f.label}\n    <select name="${f.name}"${f.required ? ' required' : ''}>\n${opts}\n    </select>\n  </label>`;
      }
      const htmlType = f.type === 'short_text' ? 'text' : f.type === 'phone' ? 'tel' : f.type;
      return `  <label>${f.label}\n    <input type="${htmlType}" name="${f.name}"${f.required ? ' required' : ''}${f.placeholder ? ` placeholder="${f.placeholder}"` : ''} />\n  </label>`;
    })
    .join('\n');

  const honeypotMarkup = form.spamProtection?.honeypotEnabled
    ? `  <!-- Honeypot anti-spam field -->\n  <input type="text" name="${form.spamProtection.honeypotField || '_gotcha'}" style="display:none" tabindex="-1" autocomplete="off" />\n`
    : '';

  const htmlCode = `<form action="${activeEndpoint}" method="POST"${
    hasFileField ? ' enctype="multipart/form-data"' : ''
  }>
${honeypotMarkup}${htmlFieldsMarkup}
  <button type="submit">Submit</button>
</form>`;

  const jsCode = `const form = document.querySelector('#contact-form');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  try {
    const response = await fetch('${activeEndpoint}', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Submission failed');
    }

    console.log('Submission ID:', result.submissionId);
    form.reset();
  } catch (error) {
    console.error('Form error:', error.message);
  }
});`;

  const restCode = `curl -X POST "${activeEndpoint}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -H "X-API-Key: ${secretKey || 'YOUR_FORM_SECRET_API_KEY'}" \\
  -H "Idempotency-Key: req_${Date.now()}" \\
  -d '${JSON.stringify(sampleJsonObj, null, 2)}'`;

  const embedCode = `<!-- Place this container where you want the form rendered -->
<div id="brosdev-form-${form.formKey}"></div>
<script src="${embedScriptUrl}" defer></script>`;

  const activeCode =
    tab === 'html'
      ? htmlCode
      : tab === 'javascript'
        ? jsCode
        : tab === 'rest'
          ? restCode
          : embedCode;

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const res = await apiRequest<{ newSecretApiKey: string }>(
        `/api/forms/${form.id}/rotate-key`,
        { method: 'POST' }
      );
      setSecretKey(res.newSecretApiKey);
    } finally {
      setRotating(false);
    }
  };

  const runLiveTest = async () => {
    setTestRunning(true);
    setTestOutput(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': `test_${Date.now()}`,
      };
      if (secretKey) headers['X-API-Key'] = secretKey;

      const res = await fetch(`/api/submit/${form.formKey}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sampleJsonObj),
      });
      const data = await res.json().catch(() => ({}));
      setTestOutput(JSON.stringify({ httpStatus: res.status, ...data }, null, 2));
    } catch (err: any) {
      setTestOutput(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-[#525252] hover:text-[#111111] hover:bg-white border border-transparent hover:border-[#E5E5E5] rounded-md cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-[#111111]">{form.title} — Integration</h2>
            <p className="text-xs text-[#525252]">
              Ready-to-copy snippets populated with your unique Form ID and endpoint
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-white border border-[#E5E5E5] rounded-lg">
          <button
            onClick={() => setEndpointMode('live')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              endpointMode === 'live' ? 'bg-[#111111] text-white' : 'text-[#525252]'
            }`}
          >
            Live Workspace URL
          </button>
          <button
            onClick={() => setEndpointMode('production')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              endpointMode === 'production' ? 'bg-[#111111] text-white' : 'text-[#525252]'
            }`}
          >
            api.brosdev.xyz
          </button>
        </div>
      </div>

      {/* Credentials Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs font-semibold text-[#525252]">Unique Form ID</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <code className="text-sm font-mono font-semibold text-[#111111]">{form.formKey}</code>
            <button
              onClick={() => copyText('formKey', form.formKey)}
              className="p-1.5 text-[#525252] hover:text-[#111111] cursor-pointer"
            >
              {copiedId === 'formKey' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs font-semibold text-[#525252]">Public Submission Endpoint</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <code className="text-xs font-mono text-[#111111] truncate">{activeEndpoint}</code>
            <button
              onClick={() => copyText('endpoint', activeEndpoint)}
              className="p-1.5 text-[#525252] hover:text-[#111111] shrink-0 cursor-pointer"
            >
              {copiedId === 'endpoint' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
          <div className="text-xs font-semibold text-[#525252]">Server-Side Secret API Key</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <code className="text-xs font-mono text-[#111111] truncate">
              {secretKey || form.secretApiKeyPrefix}
            </code>
            <button
              onClick={handleRotate}
              disabled={rotating}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3 h-3" />
              {rotating ? 'Rotating...' : 'Rotate'}
            </button>
          </div>
        </div>
      </div>

      {/* Code Generator Tabs */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 border-b border-[#E5E5E5] bg-[#FAFAFA] flex-wrap gap-2">
          <div className="flex items-center gap-1">
            {(
              [
                ['html', 'HTML Form'],
                ['javascript', 'JavaScript Fetch'],
                ['rest', 'REST API'],
                ['embed', 'Embed Code'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  tab === id
                    ? 'border-[#A90706] text-[#111111] bg-white'
                    : 'border-transparent text-[#525252] hover:text-[#111111]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => copyText('snippet', activeCode)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 my-2 text-xs font-semibold text-white bg-[#111111] hover:bg-[#333333] rounded-md cursor-pointer"
          >
            {copiedId === 'snippet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedId === 'snippet' ? 'Copied Snippet' : 'Copy Code'}
          </button>
        </div>

        <div className="p-6 space-y-6">
          <pre className="p-4 bg-[#111111] text-[#F5F5F5] rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
            <code>{activeCode}</code>
          </pre>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div>
              <h3 className="text-xs font-bold text-[#111111] mb-2">Success Response (200 OK)</h3>
              <pre className="p-4 bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg text-xs font-mono text-[#111111] overflow-x-auto">
{`{
  "ok": true,
  "submissionId": 1042,
  "formId": "${form.formKey}",
  "message": "${form.successMessage}",
  "emailDeliveryStatus": "accepted"
}`}
              </pre>
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#111111] mb-2">
                Validation Error Response (422)
              </h3>
              <pre className="p-4 bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg text-xs font-mono text-[#111111] overflow-x-auto">
{`{
  "ok": false,
  "error": "Validation failed for one or more form fields.",
  "fieldErrors": {
    "email": "Please enter a valid email address."
  }
}`}
              </pre>
            </div>
          </div>

          {/* Live Test Runner */}
          <div className="pt-5 border-t border-[#E5E5E5]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#A90706]" />
                <div>
                  <div className="text-sm font-bold text-[#111111]">Test Live Endpoint</div>
                  <div className="text-xs text-[#525252]">
                    Send a real sample submission to verify validation, database storage, and Resend
                    email routing.
                  </div>
                </div>
              </div>
              <button
                onClick={runLiveTest}
                disabled={testRunning}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer disabled:opacity-60"
              >
                <Play className="w-3.5 h-3.5" />
                {testRunning ? 'Sending...' : 'Send Test Submission'}
              </button>
            </div>
            {testOutput && (
              <pre className="mt-4 p-4 bg-[#111111] text-[#F5F5F5] rounded-lg text-xs font-mono overflow-x-auto">
                <code>{testOutput}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
