import crypto from 'node:crypto';
import { getCachedResendKey, readBody, sendJson, setCachedResendKey, sha256Hex, verifyFirebaseToken } from './_lib.js';

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'serious-airlock-smn89';
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-brosdevforms-f0d69fe2-282f-4fe5-8e91-3a6bf8a6b195';

const FIRESTORE_DOC_ROOT = `projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;
const FIRESTORE_API_BASE = `https://firestore.googleapis.com/v1/${FIRESTORE_DOC_ROOT}`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function applyCampaignCors(req, res, allowAnyOrigin = false) {
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (allowAnyOrigin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin) {
    const allowed = new Set(
      [
        'https://forms.brosdev.info',
        'https://www.forms.brosdev.info',
        process.env.APP_URL,
        ...(process.env.ALLOWED_FRONTEND_ORIGINS || '').split(','),
      ]
        .map((v) => String(v || '').trim().replace(/\/+$/, ''))
        .filter(Boolean)
    );
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    let isSameHost = false;
    try {
      isSameHost = Boolean(reqHost && new URL(origin).host.toLowerCase() === reqHost);
    } catch {
      isSameHost = false;
    }
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (allowed.has(origin) || isLocal || isSameHost) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Idempotency-Key, svix-id, svix-timestamp, svix-signature'
  );
}

function getAppOrigin(req) {
  const configured = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'forms.brosdev.info')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function resolveServerResendKey(body) {
  const fromEnv = String(process.env.RESEND_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  const fromBody = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (fromBody) {
    setCachedResendKey(fromBody);
    return fromBody;
  }
  return getCachedResendKey();
}

let ephemeralUnsubFallbackSecret = null;

function getUnsubscribeSigningKey() {
  let secret = String(
    process.env.UNSUBSCRIBE_SIGNING_SECRET ||
      process.env.ENCRYPTION_KEY ||
      process.env.RESEND_API_KEY ||
      ''
  ).trim();
  if (!secret) {
    if (!ephemeralUnsubFallbackSecret) {
      ephemeralUnsubFallbackSecret = crypto.randomBytes(32).toString('hex');
    }
    secret = ephemeralUnsubFallbackSecret;
  }
  return crypto.createHash('sha256').update(`brosdev-unsub-v1:${secret}`, 'utf8').digest();
}

export function createSignedUnsubscribeToken(payload) {
  const body = Buffer.from(
    JSON.stringify({
      o: String(payload.ownerUid || ''),
      c: String(payload.campaignId || ''),
      e: String(payload.email || '').toLowerCase(),
      s: String(payload.subscriberId || ''),
      iat: Math.floor(Date.now() / 1000),
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getUnsubscribeSigningKey())
    .update(body, 'utf8')
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifySignedUnsubscribeToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getUnsubscribeSigningKey())
    .update(body, 'utf8')
    .digest('base64url');
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed?.o || !parsed?.e || !EMAIL_REGEX.test(parsed.e)) return null;
    return {
      ownerUid: String(parsed.o),
      campaignId: String(parsed.c || ''),
      email: String(parsed.e).toLowerCase(),
      subscriberId: String(parsed.s || ''),
    };
  } catch {
    return null;
  }
}

// ---------------- FIRESTORE REST HELPERS ----------------

function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFsValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFsValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFsValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return String(val.stringValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : []).map(fromFsValue);
  }
  if ('mapValue' in val) {
    const out = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      out[k] = fromFsValue(v);
    }
    return out;
  }
  return null;
}

function fromFsDoc(docJson) {
  const out = {};
  for (const [k, v] of Object.entries(docJson?.fields || {})) {
    out[k] = fromFsValue(v);
  }
  return out;
}

async function fsCommitCreate(collectionName, docId, docData, bearerToken = '', withUpdatedAt = false) {
  const fields = {};
  for (const [k, v] of Object.entries(docData)) {
    if (v !== undefined) fields[k] = toFsValue(v);
  }
  const transforms = [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }];
  if (withUpdatedAt) {
    transforms.push({ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' });
  }
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const resp = await fetch(`${FIRESTORE_API_BASE}:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `${FIRESTORE_DOC_ROOT}/${collectionName}/${docId}`,
            fields,
          },
          currentDocument: { exists: false },
          updateTransforms: transforms,
        },
      ],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    return { ok: false, status: resp.status, error: err?.error?.message || `Firestore error (${resp.status})` };
  }
  return { ok: true };
}

async function fsRunQuery(collectionId, filters, bearerToken = '', limitNum = 200) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const whereClause =
    filters.length === 1
      ? {
          fieldFilter: {
            field: { fieldPath: filters[0].field },
            op: filters[0].op || 'EQUAL',
            value: toFsValue(filters[0].value),
          },
        }
      : {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((f) => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: f.op || 'EQUAL',
                value: toFsValue(f.value),
              },
            })),
          },
        };

  const resp = await fetch(`${FIRESTORE_API_BASE}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: whereClause,
        limit: limitNum,
      },
    }),
  });
  if (!resp.ok) return [];
  const rows = await resp.json().catch(() => []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r?.document?.fields)
    .map((r) => ({
      docId: String(r.document.name || '').split('/').pop() || '',
      ...fromFsDoc(r.document),
    }));
}

async function fsGetDoc(collectionName, docId, bearerToken = '') {
  const headers = { Accept: 'application/json' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const resp = await fetch(
    `${FIRESTORE_API_BASE}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`,
    { method: 'GET', headers }
  );
  if (!resp.ok) return null;
  const json = await resp.json().catch(() => null);
  return json?.fields ? fromFsDoc(json) : null;
}

// ---------------- REUSABLE RESEND PROVIDER LAYER ----------------

function sanitizeHeader(value, fallback = '') {
  return String(value || '')
    .replace(/[\r\n<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

export async function sendEmailViaResendProvider({
  apiKey,
  fromName,
  fromEmail,
  to,
  replyTo,
  subject,
  html,
  text,
  unsubscribeUrl,
  tags,
  idempotencyKey,
}) {
  if (!apiKey) {
    return {
      ok: false,
      statusCode: 503,
      error: 'RESEND_API_KEY is not configured on the server. Add RESEND_API_KEY in Vercel environment variables.',
    };
  }
  const cleanFromEmail = String(fromEmail || '').trim();
  const cleanFromName = sanitizeHeader(fromName, 'BrosDev Developer Services');
  const fromHeader = EMAIL_REGEX.test(cleanFromEmail)
    ? `${cleanFromName} <${cleanFromEmail}>`
    : `${cleanFromName} <onboarding@resend.dev>`;

  const payload = {
    from: fromHeader,
    to: Array.isArray(to) ? to : [to],
    subject: sanitizeHeader(subject, 'Campaign Update').slice(0, 240),
    html,
    text,
  };
  if (replyTo && EMAIL_REGEX.test(String(replyTo).trim())) {
    payload.reply_to = String(replyTo).trim();
  }
  if (unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  if (Array.isArray(tags) && tags.length > 0) {
    payload.tags = tags;
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 250);
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const errMsg = data?.message || data?.error || `Resend rejected message (HTTP ${resp.status})`;
      // If error is due to unverified sending domain, retry automatically with onboarding@resend.dev
      const isDomainError =
        resp.status === 403 &&
        (errMsg.toLowerCase().includes('domain') ||
          errMsg.toLowerCase().includes('not verified') ||
          data?.name === 'validation_error');

      if (isDomainError && cleanFromEmail !== 'onboarding@resend.dev') {
        try {
          const fallbackResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...payload,
              from: `${cleanFromName} <onboarding@resend.dev>`,
              reply_to: payload.reply_to || cleanFromEmail,
            }),
          });
          const fallbackData = await fallbackResp.json().catch(() => ({}));
          if (fallbackResp.ok && fallbackData?.id) {
            return {
              ok: true,
              statusCode: fallbackResp.status,
              providerMessageId: String(fallbackData.id),
              fallbackNotice: `Delivered via onboarding@resend.dev (domain "${cleanFromEmail.split('@')[1] || ''}" requires DNS verification in Resend).`,
            };
          }
        } catch {
          // Fall back to original error
        }
      }

      return {
        ok: false,
        statusCode: resp.status,
        error: errMsg,
      };
    }
    return {
      ok: true,
      statusCode: resp.status,
      providerMessageId: String(data?.id || ''),
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: 502,
      error: err instanceof Error ? err.message : 'Network error connecting to Resend API.',
    };
  }
}

function personalizeEmailContent(template, recipient, unsubscribeUrl) {
  const vars = {
    first_name: String(recipient.firstName || 'there'),
    last_name: String(recipient.lastName || ''),
    email: String(recipient.email || ''),
    unsubscribe_url: unsubscribeUrl,
  };
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
  });
}

function getBearerFromReq(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

// ---------------- 1. SEND TEST EMAIL (POST /api/campaigns/:id/test) ----------------

export async function handleCampaignTestSend(req, res, campaignId) {
  applyCampaignCors(req, res, false);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const user = await verifyFirebaseToken(req);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }

  const body = await readBody(req);
  const toEmail = String(body?.toEmail || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(toEmail)) {
    sendJson(res, 400, { error: 'Valid test recipient email is required.' });
    return;
  }

  const urlPath = String(req.url || '').split('?')[0];
  const pathMatch = urlPath.match(/\/api\/campaigns\/([^/]+)\/test\/?$/);
  const resolvedCampaignId = String(campaignId || req.query?.id || pathMatch?.[1] || 'test').trim();

  const apiKey = resolveServerResendKey(body);
  const origin = getAppOrigin(req);
  const unsubToken = createSignedUnsubscribeToken({
    ownerUid: user.uid,
    campaignId: resolvedCampaignId,
    email: toEmail,
    subscriberId: 'test',
  });
  const unsubUrl = `${origin}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  const html = personalizeEmailContent(
    body?.html || '<p>Test email preview</p>',
    { firstName: 'Preview', lastName: 'User', email: toEmail },
    unsubUrl
  );
  const text = personalizeEmailContent(
    body?.text || 'Test email preview',
    { firstName: 'Preview', lastName: 'User', email: toEmail },
    unsubUrl
  );

  const result = await sendEmailViaResendProvider({
    apiKey,
    fromName: body?.senderName || 'BrosDev Campaign Studio',
    fromEmail: body?.senderEmail || '',
    to: toEmail,
    replyTo: body?.replyTo || '',
    subject: `[TEST] ${String(body?.subject || 'Campaign Preview')}`,
    html,
    text,
    unsubscribeUrl: unsubUrl,
    tags: [
      { name: 'campaign_id', value: String(campaignId || 'test').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) },
      { name: 'owner_uid', value: user.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) },
      { name: 'mode', value: 'test' },
    ],
  });

  if (!result.ok) {
    sendJson(res, result.statusCode === 503 ? 503 : 400, { error: result.error });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    providerMessageId: result.providerMessageId,
    message: `Test email accepted by Resend (${result.providerMessageId}).`,
  });
}

// ---------------- 2. DISPATCH CAMPAIGN NOW (POST /api/campaigns/:id/send) ----------------

export async function handleCampaignSend(req, res, campaignId) {
  applyCampaignCors(req, res, false);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const user = await verifyFirebaseToken(req);
  const bearer = getBearerFromReq(req);
  if (!user || !bearer) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }

  const body = await readBody(req);
  const apiKey = resolveServerResendKey(body);
  if (!apiKey) {
    sendJson(res, 503, {
      error: 'RESEND_API_KEY is not configured on the server. Configure RESEND_API_KEY in Vercel environment variables before sending campaigns.',
    });
    return;
  }

  // Verify account is not suspended for abuse
  const senderSettings = await fsGetDoc('email_sender_settings', user.uid, bearer);
  if (senderSettings?.campaignSuspended) {
    sendJson(res, 403, {
      error: senderSettings.suspensionReason || 'Campaign sending is suspended on this account. Contact support.',
    });
    return;
  }

  const rawRecipients = Array.isArray(body?.recipients) ? body.recipients : [];
  if (rawRecipients.length === 0) {
    sendJson(res, 400, { error: 'No eligible subscribed recipients found for this campaign.' });
    return;
  }

  const maxMonthlyQuota = Math.max(1, Number(body?.maxMonthlyQuota || 500));
  const usedThisMonth = Math.max(0, Number(body?.usedThisMonth || 0));

  // Fetch global suppression list server-side before sending!
  const suppressions = await fsRunQuery(
    'email_suppressions',
    [{ field: 'ownerUid', value: user.uid }],
    bearer,
    1000
  );
  const suppressedSet = new Set(suppressions.map((s) => String(s.email || '').toLowerCase()));

  // Deduplicate & filter suppressed recipients
  const seen = new Set();
  const eligible = [];
  let skipped = 0;
  for (const r of rawRecipients) {
    const email = String(r?.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email) || seen.has(email) || suppressedSet.has(email)) {
      skipped += 1;
      continue;
    }
    seen.add(email);
    eligible.push({
      id: String(r?.id || ''),
      email,
      firstName: String(r?.firstName || ''),
      lastName: String(r?.lastName || ''),
    });
  }

  if (eligible.length === 0) {
    sendJson(res, 400, {
      error: 'All selected recipients are suppressed, unsubscribed, or invalid. Zero emails sent.',
    });
    return;
  }

  if (usedThisMonth + eligible.length > maxMonthlyQuota) {
    sendJson(res, 403, {
      error: `Monthly campaign email quota exceeded (${usedThisMonth} used + ${eligible.length} requested > ${maxMonthlyQuota} plan limit). Upgrade your plan to send to this audience.`,
    });
    return;
  }

  const origin = getAppOrigin(req);
  const urlPath = String(req.url || '').split('?')[0];
  const pathMatch = urlPath.match(/\/api\/campaigns\/([^/]+)\/send\/?$/);
  const cleanCampaignId = String(campaignId || req.query?.id || pathMatch?.[1] || body?.campaignId || '').replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );
  const batchCap = Math.min(eligible.length, 250); // Serverless execution window safety cap per request

  let sent = 0;
  let failed = 0;
  const providerMessageIds = [];
  const errors = [];

  for (let i = 0; i < batchCap; i += 1) {
    const recipient = eligible[i];
    const unsubToken = createSignedUnsubscribeToken({
      ownerUid: user.uid,
      campaignId: cleanCampaignId,
      email: recipient.email,
      subscriberId: recipient.id,
    });
    const unsubUrl = `${origin}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    const html = personalizeEmailContent(body?.compiledHtml || '', recipient, unsubUrl);
    const text = personalizeEmailContent(body?.compiledText || '', recipient, unsubUrl);
    const subject = personalizeEmailContent(body?.subject || 'Campaign Update', recipient, unsubUrl);
    const idempotencyKey = `brosdev_${cleanCampaignId}_${sha256Hex(recipient.email).slice(0, 16)}`;

    const result = await sendEmailViaResendProvider({
      apiKey,
      fromName: body?.senderName || 'BrosDev Campaign Studio',
      fromEmail: body?.senderEmail || '',
      to: recipient.email,
      replyTo: body?.replyTo || '',
      subject,
      html,
      text,
      unsubscribeUrl: unsubUrl,
      idempotencyKey,
      tags: [
        { name: 'campaign_id', value: cleanCampaignId.slice(0, 100) },
        { name: 'owner_uid', value: user.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) },
      ],
    });

    const eventId = `evt_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    if (result.ok) {
      sent += 1;
      if (result.providerMessageId) providerMessageIds.push(result.providerMessageId);
      await fsCommitCreate(
        'email_delivery_events',
        eventId,
        {
          id: eventId,
          ownerUid: user.uid,
          campaignId: cleanCampaignId,
          subscriberEmail: recipient.email,
          providerMessageId: result.providerMessageId || '',
          eventType: 'sent',
          occurredAt: nowIso,
        },
        bearer
      );
    } else {
      failed += 1;
      if (errors.length < 10) errors.push(`${recipient.email}: ${result.error}`);
      await fsCommitCreate(
        'email_delivery_events',
        eventId,
        {
          id: eventId,
          ownerUid: user.uid,
          campaignId: cleanCampaignId,
          subscriberEmail: recipient.email,
          providerMessageId: '',
          eventType: 'failed',
          errorMessage: String(result.error || '').slice(0, 580),
          occurredAt: nowIso,
        },
        bearer
      );
    }

    // Gentle pacing to respect Resend per-second rate limits (2–10 req/s)
    if (i < batchCap - 1 && (i + 1) % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  sendJson(res, 200, {
    ok: true,
    campaignId: cleanCampaignId,
    sent,
    failed,
    skipped,
    remainingInQueue: Math.max(0, eligible.length - batchCap),
    providerMessageIds: providerMessageIds.slice(0, 50),
    errors,
  });
}

// ---------------- 3. RESEND DOMAIN VERIFICATION SYNC (POST /api/campaigns/domains) ----------------

export async function handleCampaignDomains(req, res) {
  applyCampaignCors(req, res, false);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const user = await verifyFirebaseToken(req);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }

  const body = req.method === 'POST' ? await readBody(req) : {};
  const apiKey = resolveServerResendKey(body);
  if (!apiKey) {
    sendJson(res, 200, {
      providerConfigured: false,
      domains: [],
      message: 'RESEND_API_KEY is not configured on the server yet. Add RESEND_API_KEY to fetch live Resend domain verification & DNS records.',
    });
    return;
  }

  const action = String(body?.action || 'list');

  try {
    if (action === 'create' && body?.domain) {
      const cleanDomain = String(body.domain)
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
      const createResp = await fetch('https://api.resend.com/domains', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: cleanDomain }),
      });
      const created = await createResp.json().catch(() => ({}));
      if (!createResp.ok) {
        sendJson(res, 400, {
          error: created?.message || `Resend failed to register domain (${createResp.status}).`,
        });
        return;
      }
    } else if (action === 'verify' && body?.resendDomainId) {
      const verResp = await fetch(
        `https://api.resend.com/domains/${encodeURIComponent(String(body.resendDomainId))}/verify`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      if (!verResp.ok) {
        const verErr = await verResp.json().catch(() => ({}));
        sendJson(res, 400, {
          error: verErr?.message || `Resend verification trigger failed (${verResp.status}).`,
        });
        return;
      }
    }

    const listResp = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const listJson = await listResp.json().catch(() => ({}));
    if (!listResp.ok) {
      sendJson(res, 400, {
        error: listJson?.message || `Failed to query Resend domains (${listResp.status}).`,
      });
      return;
    }

    const rawDomains = Array.isArray(listJson?.data) ? listJson.data : [];
    const detailed = [];
    for (const item of rawDomains.slice(0, 15)) {
      let dnsRecords = [];
      let status = String(item.status || 'pending').toLowerCase();
      if (item.id) {
        const detResp = await fetch(`https://api.resend.com/domains/${encodeURIComponent(item.id)}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (detResp.ok) {
          const det = await detResp.json().catch(() => ({}));
          if (Array.isArray(det?.records)) {
            dnsRecords = det.records.map((rec) => ({
              record: String(rec.record || ''),
              name: String(rec.name || ''),
              type: String(rec.type || ''),
              value: String(rec.value || ''),
              ttl: String(rec.ttl || 'Auto'),
              priority: rec.priority !== undefined ? Number(rec.priority) : undefined,
              status: String(rec.status || 'pending'),
            }));
          }
          if (det?.status) status = String(det.status).toLowerCase();
        }
      }
      const normalizedStatus =
        status === 'verified'
          ? 'verified'
          : status === 'failed' || status === 'temporary_failure'
            ? 'failed'
            : status === 'not_started'
              ? 'not_started'
              : 'pending';
      detailed.push({
        domain: String(item.name || ''),
        resendDomainId: String(item.id || ''),
        status: normalizedStatus,
        region: String(item.region || 'us-east-1'),
        dnsRecords,
      });
    }

    sendJson(res, 200, {
      providerConfigured: true,
      domains: detailed,
      message: `Synced ${detailed.length} domain(s) directly from Resend API.`,
    });
  } catch (err) {
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'Unable to reach Resend Domains API.',
    });
  }
}

// ---------------- 4. RESEND / SVIX WEBHOOK RECEIVER (POST /api/webhooks/resend) ----------------

function verifySvixSignature(rawBody, headers, secret) {
  if (!secret) return { ok: false, error: 'RESEND_WEBHOOK_SECRET not configured.' };
  const svixId = String(headers['svix-id'] || '').trim();
  const svixTimestamp = String(headers['svix-timestamp'] || '').trim();
  const svixSignature = String(headers['svix-signature'] || '').trim();
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, error: 'Missing Svix signature headers (svix-id, svix-timestamp, svix-signature).' };
  }

  // Prevent replay attacks (>5 minutes skew)
  const tsNum = Number(svixTimestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > 300) {
    return { ok: false, error: 'Webhook timestamp outside allowed 5-minute tolerance window.' };
  }

  const secretRaw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(secretRaw, 'base64');
  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac('sha256', keyBytes)
    .update(signedPayload, 'utf8')
    .digest('base64');

  const candidates = svixSignature
    .split(/\s+/)
    .map((part) => part.split(',')[1] || '')
    .filter(Boolean);

  for (const cand of candidates) {
    try {
      const a = Buffer.from(cand, 'utf8');
      const b = Buffer.from(expectedSig, 'utf8');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return { ok: true, svixId };
      }
    } catch {
      // continue checking signatures
    }
  }
  return { ok: false, error: 'Invalid Resend/Svix webhook signature.' };
}

export async function handleResendWebhook(req, res) {
  applyCampaignCors(req, res, true);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    sendJson(res, 503, {
      error: 'RESEND_WEBHOOK_SECRET is not configured on the server. Rejecting unverified webhook.',
    });
    return;
  }

  const bodyObj = await readBody(req);
  const rawBody =
    typeof req.rawBody === 'string'
      ? req.rawBody
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(bodyObj || {});

  const sigCheck = verifySvixSignature(rawBody, req.headers || {}, webhookSecret);
  if (!sigCheck.ok) {
    sendJson(res, 401, { error: sigCheck.error });
    return;
  }

  const eventTypeRaw = String(bodyObj?.type || '').toLowerCase();
  const data = bodyObj?.data || {};
  const tagsArr = Array.isArray(data?.tags)
    ? data.tags
    : data?.tags && typeof data.tags === 'object'
      ? Object.entries(data.tags).map(([name, value]) => ({ name, value }))
      : [];

  const tagMap = {};
  for (const t of tagsArr) {
    if (t?.name) tagMap[String(t.name)] = String(t.value || '');
  }

  const ownerUid = String(tagMap.owner_uid || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const campaignId = String(tagMap.campaign_id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const recipientEmail = Array.isArray(data?.to)
    ? String(data.to[0] || '').toLowerCase()
    : String(data?.to || data?.email || '').toLowerCase();
  const providerMessageId = String(data?.email_id || data?.id || '');
  const clickLink = String(data?.click?.link || '').slice(0, 500);

  const eventMap = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.delivery_delayed': 'failed',
  };
  const mappedEvent = eventMap[eventTypeRaw];
  const nowIso = new Date().toISOString();

  if (!mappedEvent || !ownerUid || !campaignId) {
    sendJson(res, 200, { ok: true, ignored: true, reason: 'No campaign tags or unsupported event type.' });
    return;
  }

  // Idempotent document ID derived from svix-id prevents duplicate counting on retries
  const webhookDocId = `wh_${sha256Hex(sigCheck.svixId).slice(0, 24)}`;
  const whWrite = await fsCommitCreate('email_webhook_events', webhookDocId, {
    id: webhookDocId,
    ownerUid,
    campaignId,
    provider: 'resend',
    eventType: eventTypeRaw,
    providerMessageId,
    recipientEmail,
    status: 'processed',
    receivedAt: nowIso,
  });

  if (!whWrite.ok && whWrite.status === 409) {
    sendJson(res, 200, { ok: true, duplicate: true });
    return;
  }

  const deliveryEventId = `wev_${sha256Hex(`${sigCheck.svixId}_${mappedEvent}`).slice(0, 24)}`;
  await fsCommitCreate('email_delivery_events', deliveryEventId, {
    id: deliveryEventId,
    ownerUid,
    campaignId,
    subscriberEmail: recipientEmail,
    providerMessageId,
    eventType: mappedEvent,
    ...(clickLink ? { linkUrl: clickLink } : {}),
    occurredAt: nowIso,
  });

  // Automatically suppress hard bounces and spam complaints!
  if ((mappedEvent === 'bounced' || mappedEvent === 'complained') && EMAIL_REGEX.test(recipientEmail)) {
    const supId = `sup_${sha256Hex(`${ownerUid}_${recipientEmail}_${mappedEvent}`).slice(0, 24)}`;
    await fsCommitCreate('email_suppressions', supId, {
      id: supId,
      ownerUid,
      email: recipientEmail,
      reason: mappedEvent === 'bounced' ? 'hard_bounce' : 'spam_complaint',
      source: 'resend_webhook',
      campaignId,
    });
  }

  sendJson(res, 200, { ok: true, processed: mappedEvent, id: webhookDocId });
}

// ---------------- 5. ONE-CLICK & INTERACTIVE UNSUBSCRIBE (GET/POST /api/campaigns/unsubscribe) ----------------

export async function handleCampaignUnsubscribe(req, res) {
  applyCampaignCors(req, res, true);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const urlObj = new URL(req.url || '/', 'https://forms.brosdev.info');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const token = String(urlObj.searchParams.get('token') || body?.token || '').trim();

  const verified = verifySignedUnsubscribeToken(token);
  if (!verified) {
    sendJson(res, 400, { error: 'Invalid or expired unsubscribe link.' });
    return;
  }

  if (req.method === 'GET' && urlObj.searchParams.get('confirm') !== '1') {
    sendJson(res, 200, {
      ok: true,
      ready: true,
      email: verified.email,
      campaignId: verified.campaignId,
    });
    return;
  }

  const supId = `sup_${sha256Hex(`${verified.ownerUid}_${verified.email}_unsub`).slice(0, 24)}`;
  const write = await fsCommitCreate('email_suppressions', supId, {
    id: supId,
    ownerUid: verified.ownerUid,
    email: verified.email,
    reason: 'unsubscribed',
    source: 'unsubscribe_link',
    ...(verified.campaignId ? { campaignId: verified.campaignId } : {}),
  });

  if (verified.campaignId) {
    const evtId = `unsub_${sha256Hex(`${verified.ownerUid}_${verified.campaignId}_${verified.email}`).slice(0, 24)}`;
    await fsCommitCreate('email_delivery_events', evtId, {
      id: evtId,
      ownerUid: verified.ownerUid,
      campaignId: verified.campaignId,
      subscriberEmail: verified.email,
      providerMessageId: 'unsubscribe',
      eventType: 'unsubscribed',
      occurredAt: new Date().toISOString(),
    });
  }

  sendJson(res, 200, {
    ok: true,
    unsubscribed: true,
    alreadySuppressed: !write.ok && write.status === 409,
    email: verified.email,
    note: 'You have been unsubscribed from future marketing emails. Transactional account emails are unaffected.',
  });
}

// ---------------- 6. VERCEL CRON DURABLE SCHEDULER (GET/POST /api/cron/campaigns) ----------------

export async function handleCronCampaigns(req, res) {
  applyCampaignCors(req, res, false);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    sendJson(res, 401, { error: 'Unauthorized cron invocation. Configure CRON_SECRET in Vercel.' });
    return;
  }

  // Vercel Cron heartbeat & readiness response
  // Note: Full unattended multi-tenant Firestore job execution requires either Firebase Admin service credentials
  // or per-workspace signed execution tokens; we validate secret & Resend readiness cleanly without fabricating sends.
  const resendConfigured = Boolean(resolveServerResendKey());
  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    resendConfigured,
    status: resendConfigured
      ? 'Cron worker verified and ready for scheduled dispatch.'
      : 'Cron worker reached, but RESEND_API_KEY is not configured.',
  });
}
