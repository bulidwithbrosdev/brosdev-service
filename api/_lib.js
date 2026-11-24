import crypto from 'node:crypto';

const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAnairFslSrj47ORXdWMQ3Ex2MSUPEe9DE';
const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'serious-airlock-smn89';
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-brosdevforms-f0d69fe2-282f-4fe5-8e91-3a6bf8a6b195';

const FIRESTORE_DOC_ROOT = `projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;
const FIRESTORE_API_BASE = `https://firestore.googleapis.com/v1/${FIRESTORE_DOC_ROOT}`;

const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6 MB safety cap
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function applyCors(req, res, allowAnyOrigin = false) {
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
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (allowed.has(origin) || isLocal) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, X-API-Key, Idempotency-Key'
  );
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHeaderText(value, fallback = '') {
  const cleaned = String(value || '')
    .replace(/[\r\n<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function isValidEmail(val) {
  return typeof val === 'string' && val.length <= 254 && EMAIL_REGEX.test(val.trim());
}

function isSafeHttpUrl(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafeWebhookUrl(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!/^https:\/\//i.test(trimmed) || trimmed.length > 500) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '::1' ||
      host.startsWith('[') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^0\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return host.includes('.');
  } catch {
    return false;
  }
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

function timingSafeHexEqual(a, b) {
  const sa = String(a || '').trim().toLowerCase();
  const sb = String(b || '').trim().toLowerCase();
  if (!sa || !sb || sa.length !== sb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sa, 'utf8'), Buffer.from(sb, 'utf8'));
  } catch {
    return false;
  }
}

// ---------------- SEALED ROUTING TOKEN (AES-256-GCM) ----------------

export function getRoutingKeyInfo() {
  const secret = String(process.env.ENCRYPTION_KEY || process.env.RESEND_API_KEY || '').trim();
  if (!secret) return null;
  const key = crypto
    .createHash('sha256')
    .update(`brosdev-routing-v1:${secret}`, 'utf8')
    .digest();
  const keyId = crypto
    .createHash('sha256')
    .update(`kid:${key.toString('hex')}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
  return { key, keyId };
}

export function sealRoutingPayload(payload) {
  const keyInfo = getRoutingKeyInfo();
  if (!keyInfo) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyInfo.key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const routingToken = [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
  return { routingToken, routingKeyId: keyInfo.keyId };
}

export function unsealRoutingPayload(token) {
  if (typeof token !== 'string' || !token.startsWith('v1.')) return null;
  const keyInfo = getRoutingKeyInfo();
  if (!keyInfo) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyInfo.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------- REQUEST BODY PARSING (JSON, URLENCODED, MULTIPART) ----------------

async function readRawBuffer(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('Request payload exceeds 6 MB limit.');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function appendFieldValue(target, key, value) {
  if (!key) return;
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    const prev = target[key];
    if (Array.isArray(prev)) {
      prev.push(value);
    } else {
      target[key] = [prev, value];
    }
  } else {
    target[key] = value;
  }
}

export function parseMultipartBuffer(buffer, contentType) {
  const match = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!match) return { fields: {}, files: [] };
  const boundary = match[1] || match[2];
  if (!boundary) return { fields: {}, files: [] };

  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];

  let pos = buffer.indexOf(delimiter);
  while (pos !== -1) {
    let partStart = pos + delimiter.length;
    // Closing delimiter `--boundary--`
    if (buffer[partStart] === 0x2d && buffer[partStart + 1] === 0x2d) {
      break;
    }
    // Skip leading CRLF or LF after boundary
    if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) {
      partStart += 2;
    } else if (buffer[partStart] === 0x0a) {
      partStart += 1;
    }

    const nextPos = buffer.indexOf(delimiter, partStart);
    if (nextPos === -1) break;

    // Trim trailing CRLF or LF before next boundary
    let partEnd = nextPos;
    if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
      partEnd -= 2;
    } else if (partEnd >= 1 && buffer[partEnd - 1] === 0x0a) {
      partEnd -= 1;
    }

    const part = buffer.subarray(partStart, partEnd);
    let headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    let sepLen = 4;
    if (headerEnd === -1) {
      headerEnd = part.indexOf(Buffer.from('\n\n'));
      sepLen = 2;
    }

    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString('utf8');
      const bodyBuf = part.subarray(headerEnd + sepLen);
      const dispMatch = headerText.match(/content-disposition:\s*[^\r\n]+/i);
      const disp = dispMatch ? dispMatch[0] : '';
      const nameMatch = disp.match(/\bname="([^"]+)"/i);
      const filenameMatch = disp.match(/\bfilename="([^"]*)"/i);
      const typeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);

      if (nameMatch && nameMatch[1]) {
        const fieldName = nameMatch[1];
        if (filenameMatch) {
          const filename = filenameMatch[1].trim();
          if (filename && files.length < 10) {
            files.push({
              field: fieldName.slice(0, 100),
              originalName: filename.slice(0, 200),
              mimeType: (typeMatch ? typeMatch[1].trim() : 'application/octet-stream').slice(0, 120),
              sizeBytes: bodyBuf.length,
            });
            appendFieldValue(fields, fieldName, filename);
          }
        } else {
          appendFieldValue(fields, fieldName, bodyBuf.toString('utf8'));
        }
      }
    }

    pos = nextPos;
  }

  return { fields, files };
}

function parseUrlEncodedString(raw) {
  const params = new URLSearchParams(raw);
  const fields = {};
  for (const [k, v] of params.entries()) {
    appendFieldValue(fields, k, v);
  }
  return fields;
}

export async function readBodyWithFiles(req) {
  const contentType = String(req.headers['content-type'] || '');
  const lowerCt = contentType.toLowerCase();

  if (lowerCt.includes('multipart/form-data')) {
    let buf;
    if (Buffer.isBuffer(req.body)) {
      buf = req.body;
    } else if (typeof req.body === 'string') {
      buf = Buffer.from(req.body, 'latin1');
    } else {
      buf = await readRawBuffer(req);
    }
    return parseMultipartBuffer(buf, contentType);
  }

  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString('utf8').trim();
      if (!raw) return { fields: {}, files: [] };
      if (lowerCt.includes('application/x-www-form-urlencoded')) {
        return { fields: parseUrlEncodedString(raw), files: [] };
      }
      try {
        const parsed = JSON.parse(raw);
        return { fields: parsed && typeof parsed === 'object' ? parsed : {}, files: [] };
      } catch {
        return { fields: raw.includes('=') ? parseUrlEncodedString(raw) : {}, files: [] };
      }
    }
    if (typeof req.body === 'string') {
      const raw = req.body.trim();
      if (!raw) return { fields: {}, files: [] };
      if (lowerCt.includes('application/x-www-form-urlencoded')) {
        return { fields: parseUrlEncodedString(raw), files: [] };
      }
      try {
        const parsed = JSON.parse(raw);
        return { fields: parsed && typeof parsed === 'object' ? parsed : {}, files: [] };
      } catch {
        return { fields: raw.includes('=') ? parseUrlEncodedString(raw) : {}, files: [] };
      }
    }
    if (typeof req.body === 'object') {
      return { fields: req.body, files: [] };
    }
  }

  const rawBuf = await readRawBuffer(req);
  const raw = rawBuf.toString('utf8').trim();
  if (!raw) return { fields: {}, files: [] };

  if (lowerCt.includes('application/x-www-form-urlencoded')) {
    return { fields: parseUrlEncodedString(raw), files: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    return { fields: parsed && typeof parsed === 'object' ? parsed : {}, files: [] };
  } catch {
    return { fields: raw.includes('=') ? parseUrlEncodedString(raw) : {}, files: [] };
  }
}

export async function readBody(req) {
  const { fields } = await readBodyWithFiles(req);
  return fields;
}

// ---------------- FIRESTORE REST API HELPERS ----------------

function toFirestoreValue(val) {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return String(val.stringValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return arr.map((item) => fromFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function fromFirestoreDoc(docJson) {
  const fields = docJson?.fields || {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

async function firestoreGetPublicForm(formKey) {
  const url = `${FIRESTORE_API_BASE}/publicForms/${encodeURIComponent(formKey)}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (resp.status === 404) {
    return { status: 'not_found' };
  }
  if (resp.status === 403) {
    return { status: 'forbidden' };
  }
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    return {
      status: 'error',
      message: errBody?.error?.message || `Firestore error (${resp.status})`,
    };
  }
  const docJson = await resp.json().catch(() => null);
  if (!docJson?.fields) {
    return { status: 'not_found' };
  }
  return { status: 'ok', form: fromFirestoreDoc(docJson) };
}

async function firestoreCreateSubmission(submissionDocId, docData) {
  const fields = {};
  for (const [k, v] of Object.entries(docData)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }

  const commitUrl = `${FIRESTORE_API_BASE}:commit`;
  const resp = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `${FIRESTORE_DOC_ROOT}/submissions/${submissionDocId}`,
            fields,
          },
          currentDocument: { exists: false },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errJson = await resp.json().catch(() => ({}));
    const msg = errJson?.error?.message || `Firestore commit failed (${resp.status})`;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

// ---------------- FIREBASE AUTH VERIFICATION ----------------

export async function verifyFirebaseToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const idToken = match[1].trim();
  if (!idToken) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({}));
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    if (!user?.localId) return null;
    return {
      uid: String(user.localId),
      email: String(user.email || '').toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

function resolveResendKey(body) {
  const fromEnv = String(process.env.RESEND_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  const fromBody = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  return fromBody;
}

// ---------------- EMAIL RENDERING & RESEND DISPATCH ----------------

function interpolateTemplate(template, payload) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => {
    const val = payload?.[key];
    if (val === undefined || val === null) return '';
    return Array.isArray(val) ? val.join(', ') : String(val);
  });
}

function renderNotificationHtml(formTitle, payload, files, originDomain, footer, removeBranding = false) {
  const rows = Object.entries(payload || {})
    .map(([key, val]) => {
      const displayVal = Array.isArray(val) ? val.join(', ') : String(val ?? '');
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-weight:600;color:#111111;width:180px;vertical-align:top;font-size:13px;">${escapeHtml(key)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;color:#333333;white-space:pre-wrap;font-size:13px;">${escapeHtml(displayVal)}</td>
      </tr>`;
    })
    .join('');

  const fileRows =
    Array.isArray(files) && files.length > 0
      ? `<div style="margin-top:16px;padding:12px;background:#fafafa;border:1px solid #eeeeee;border-radius:6px;">
          <div style="font-size:12px;font-weight:700;color:#111111;margin-bottom:6px;">Attachments (${files.length})</div>
          <ul style="margin:0;padding-left:18px;font-size:12px;color:#525252;">
            ${files
              .map(
                (f) =>
                  `<li>${escapeHtml(f.originalName)} (${escapeHtml(f.mimeType)}, ${Math.max(1, Math.round(Number(f.sizeBytes || 0) / 1024))} KB)</li>`
              )
              .join('')}
          </ul>
        </div>`
      : '';

  const originMeta = originDomain
    ? `<div style="font-size:12px;color:#737373;margin-top:4px;">Submitted from: ${escapeHtml(originDomain)}</div>`
    : '';

  const brandEyebrow = removeBranding
    ? ''
    : '<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#a3a3a3;">BrosDev Forms</div>';

  const footerBlock = removeBranding
    ? ''
    : `<div style="padding:12px 24px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:11px;color:#737373;">
      ${escapeHtml(footer || 'Delivered securely via BrosDev Forms.')}
    </div>`;

  return `<div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;background:#ffffff;">
    <div style="background:#111111;padding:16px 24px;color:#ffffff;">
      ${brandEyebrow}
      <div style="font-size:18px;font-weight:700;margin-top:4px;">New Submission: ${escapeHtml(formTitle)}</div>
      ${originMeta}
    </div>
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${rows || '<tr><td style="padding:10px 12px;color:#737373;font-size:13px;">No fields submitted.</td></tr>'}
      </table>
      ${fileRows}
    </div>
    ${footerBlock}
  </div>`;
}

function renderAutoReplyHtml(subject, bodyText, footer, removeBranding = false) {
  const safeBody = escapeHtml(bodyText || 'Thank you! We received your submission and will reply shortly.').replace(
    /\n/g,
    '<br />'
  );
  const footerBlock = removeBranding
    ? ''
    : `<div style="padding:12px 24px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:11px;color:#737373;">
      ${escapeHtml(footer || 'Delivered securely via BrosDev Forms.')}
    </div>`;
  return `<div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;background:#ffffff;">
    <div style="background:#111111;padding:16px 24px;color:#ffffff;">
      <div style="font-size:16px;font-weight:700;">${escapeHtml(subject || 'Thank you for your submission')}</div>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6;color:#262626;">${safeBody}</div>
    ${footerBlock}
  </div>`;
}

async function sendViaResend({ apiKey, fromName, fromEmail, to, subject, html, replyTo }) {
  const safeFromName = sanitizeHeaderText(fromName, 'BrosDev Forms');
  const rawFromEmail = String(fromEmail || 'onboarding@resend.dev').trim();
  const safeFromEmail = isValidEmail(rawFromEmail) ? rawFromEmail : 'onboarding@resend.dev';
  const fromHeader = `${safeFromName} <${safeFromEmail}>`;

  const payload = {
    from: fromHeader,
    to,
    subject: sanitizeHeaderText(subject, 'New Form Submission').slice(0, 300),
    html,
  };
  if (replyTo && isValidEmail(replyTo)) {
    payload.reply_to = replyTo.trim();
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: json?.message || `Resend returned HTTP ${resp.status}`,
    };
  }
  return {
    ok: true,
    resendMessageId: String(json?.id || ''),
  };
}

// ---------------- ROUTE HANDLERS ----------------

export async function handleHealth(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  const keyInfo = getRoutingKeyInfo();
  return sendJson(res, 200, {
    ok: true,
    service: 'brosdev-forms',
    database: 'firestore',
    resendConfigured: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
    routingSealedReady: Boolean(keyInfo),
    routingKeyId: keyInfo ? keyInfo.keyId : '',
  });
}

export async function handleSealRouting(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const user = await verifyFirebaseToken(req);
    if (!user) {
      return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
    }

    const keyInfo = getRoutingKeyInfo();
    if (!keyInfo) {
      return sendJson(res, 200, {
        ok: false,
        routingToken: '',
        routingKeyId: '',
        reason: 'RESEND_API_KEY (or ENCRYPTION_KEY) is not set in server environment variables yet.',
      });
    }

    const body = await readBody(req);
    const rawRecipients = Array.isArray(body?.recipients)
      ? body.recipients
      : typeof body?.recipients === 'string'
        ? body.recipients.split(',')
        : [];
    const recipients = Array.from(
      new Set(
        rawRecipients
          .map((r) => String(r || '').trim().toLowerCase())
          .filter((r) => isValidEmail(r))
      )
    ).slice(0, 20);

    const routingPayload = {
      v: 1,
      notificationsEnabled: body?.notificationsEnabled !== false,
      recipients,
      subject: String(body?.subject || '').slice(0, 240),
      senderDisplayName: sanitizeHeaderText(body?.senderDisplayName, 'BrosDev Forms').slice(0, 120),
      replyToField: String(body?.replyToField || 'email').slice(0, 80),
      confirmationEnabled: Boolean(body?.confirmationEnabled),
      autoReplyEmailField: String(body?.autoReplyEmailField || 'email').slice(0, 80),
      autoReplySubject: String(body?.autoReplySubject || 'Thank you for your message').slice(0, 240),
      autoReplyBody: String(body?.autoReplyBody || '').slice(0, 2000),
      defaultSenderEmail: isValidEmail(String(body?.defaultSenderEmail || '').trim())
        ? String(body.defaultSenderEmail).trim()
        : 'onboarding@resend.dev',
      defaultEmailFooter: String(body?.defaultEmailFooter || 'Delivered securely via BrosDev Forms.').slice(0, 300),
      removeBranding: Boolean(body?.removeBranding),
      webhookUrl: isSafeWebhookUrl(String(body?.webhookUrl || '').trim())
        ? String(body.webhookUrl).trim().slice(0, 500)
        : '',
    };

    const sealed = sealRoutingPayload(routingPayload);
    if (!sealed) {
      return sendJson(res, 200, {
        ok: false,
        routingToken: '',
        routingKeyId: '',
        reason: 'Unable to seal routing configuration.',
      });
    }

    return sendJson(res, 200, {
      ok: true,
      routingToken: sealed.routingToken,
      routingKeyId: sealed.routingKeyId,
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: err?.message || 'Failed to seal form email routing.',
    });
  }
}

export async function handleResendTestConnection(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const user = await verifyFirebaseToken(req);
    if (!user) {
      return sendJson(res, 401, { ok: false, error: 'Authentication required. Please sign in again.' });
    }

    const body = await readBody(req);
    const apiKey = resolveResendKey(body);
    if (!apiKey) {
      return sendJson(res, 200, {
        ok: false,
        connected: false,
        message:
          'No Resend API key found. Enter your Resend API key above and click Save Configuration, or set RESEND_API_KEY in Vercel Environment Variables.',
        domains: [],
      });
    }

    const resp = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const errMsg = json?.message || `Resend returned HTTP ${resp.status}. Please check your API key.`;
      return sendJson(res, 200, {
        ok: false,
        connected: false,
        message: errMsg,
        error: errMsg,
        domains: [],
      });
    }

    const domains = Array.isArray(json?.data)
      ? json.data.map((d) => ({
          name: String(d?.name || ''),
          status: String(d?.status || 'unknown'),
        }))
      : [];

    const verifiedCount = domains.filter((d) => d.status === 'verified').length;
    const message =
      domains.length > 0
        ? `Connected to Resend successfully. Found ${domains.length} domain(s) (${verifiedCount} verified).`
        : 'Connected to Resend successfully (no custom sending domains added in Resend yet).';

    return sendJson(res, 200, {
      ok: true,
      connected: true,
      message,
      domains,
    });
  } catch (err) {
    return sendJson(res, 200, {
      ok: false,
      connected: false,
      message: err?.message || 'Unable to connect to Resend API.',
      error: err?.message || 'Unable to connect to Resend API.',
      domains: [],
    });
  }
}

export async function handleResendSend(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { status: 'failed', error: 'Method not allowed. Use POST.' });
  }

  try {
    const user = await verifyFirebaseToken(req);
    if (!user) {
      return sendJson(res, 401, { status: 'failed', error: 'Authentication required.' });
    }

    const body = await readBody(req);
    const apiKey = resolveResendKey(body);
    const recipients = Array.isArray(body?.to)
      ? body.to.map((v) => String(v || '').trim()).filter(Boolean)
      : body?.to
        ? [String(body.to).trim()]
        : [];

    if (recipients.length === 0) {
      return sendJson(res, 400, { status: 'failed', error: 'At least one recipient email is required.' });
    }

    if (!apiKey) {
      return sendJson(res, 200, {
        status: 'failed',
        error:
          'No Resend API key configured. Add your Resend API key in Super Admin -> Resend Configuration or set RESEND_API_KEY in Vercel Environment Variables.',
      });
    }

    const sendRes = await sendViaResend({
      apiKey,
      fromName: body?.fromName || 'BrosDev Forms',
      fromEmail: body?.fromEmail || 'onboarding@resend.dev',
      to: recipients,
      subject: body?.subject || 'New Form Submission',
      html: String(body?.html || '<p>New submission received via BrosDev Forms.</p>'),
      replyTo: body?.replyTo,
    });

    if (!sendRes.ok) {
      return sendJson(res, 200, { status: 'failed', error: sendRes.error });
    }

    return sendJson(res, 200, {
      status: 'accepted',
      resendMessageId: sendRes.resendMessageId,
    });
  } catch (err) {
    return sendJson(res, 200, {
      status: 'failed',
      error: err?.message || 'Unable to send email via Resend.',
    });
  }
}

// ---------------- PUBLIC EXTERNAL FORM SUBMISSION ----------------

function extractOriginHostname(req) {
  const raw = String(req.headers.origin || req.headers.referer || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isDomainAllowed(originHost, allowedDomains, reqHost) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) return true;
  if (!originHost) return true; // Server-to-server / curl
  const normalizedReqHost = String(reqHost || '').split(':')[0].toLowerCase();
  if (
    originHost === 'localhost' ||
    originHost === '127.0.0.1' ||
    originHost === 'forms.brosdev.info' ||
    (normalizedReqHost && originHost === normalizedReqHost)
  ) {
    return true;
  }
  return allowedDomains.some((rawRule) => {
    const rule = String(rawRule || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');
    if (!rule) return false;
    if (rule.startsWith('*.')) {
      const base = rule.slice(2);
      return originHost === base || originHost.endsWith(`.${base}`);
    }
    return originHost === rule;
  });
}

function sanitizePayloadForFirestore(rawPayload) {
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(rawPayload || {})) {
    if (count >= 100) break;
    const safeKey = String(k).slice(0, 100);
    if (!safeKey) continue;
    if (Array.isArray(v)) {
      out[safeKey] = v.map((item) => String(item ?? '').slice(0, 2000)).join(', ').slice(0, 5000);
    } else if (v === null || v === undefined) {
      out[safeKey] = '';
    } else if (typeof v === 'object') {
      out[safeKey] = JSON.stringify(v).slice(0, 5000);
    } else {
      out[safeKey] = String(v).slice(0, 5000);
    }
    count += 1;
  }
  return out;
}

function validateSubmissionFields(formFields, payload, files) {
  const fieldErrors = {};
  if (!Array.isArray(formFields) || formFields.length === 0) return fieldErrors;

  for (const field of formFields) {
    if (!field || typeof field !== 'object') continue;
    const type = String(field.type || '');
    const name = String(field.name || '').trim();
    if (!name || ['submit', 'heading', 'divider', 'hidden'].includes(type)) continue;

    const rawVal = payload[name];
    const strVal = Array.isArray(rawVal) ? rawVal.join(', ').trim() : String(rawVal ?? '').trim();
    const hasUploadedFile =
      type === 'file' && Array.isArray(files) && files.some((f) => f.field === name);

    if (field.required && !strVal && !hasUploadedFile) {
      fieldErrors[name] = `${field.label || name} is required.`;
      continue;
    }

    if (!strVal) continue;

    if (type === 'email' && !isValidEmail(strVal)) {
      fieldErrors[name] = 'Please enter a valid email address.';
    } else if (type === 'url' && !isSafeHttpUrl(strVal)) {
      fieldErrors[name] = 'Please enter a valid http:// or https:// URL.';
    } else if (type === 'number' && !Number.isFinite(Number(strVal))) {
      fieldErrors[name] = 'Please enter a valid number.';
    }
  }

  return fieldErrors;
}

function sendHtmlPage(res, statusCode, title, heading, message, details = '', removeBranding = false) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const brandHeader = removeBranding
    ? ''
    : '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#A90706;margin-bottom:8px;">BrosDev Forms</div>';
  return res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#FAFAFA;font-family:Inter,system-ui,-apple-system,sans-serif;color:#111111;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;"><div style="max-width:480px;width:100%;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:10px;padding:32px;box-sizing:border-box;">${brandHeader}<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h1><p style="margin:0;font-size:14px;line-height:1.6;color:#525252;">${escapeHtml(message)}</p>${details}</div></body></html>`
  );
}

export async function handlePublicSubmit(req, res, explicitFormKey) {
  applyCors(req, res, true);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const accept = String(req.headers.accept || '');
  const contentType = String(req.headers['content-type'] || '');
  const wantsJson =
    accept.includes('application/json') ||
    contentType.toLowerCase().includes('application/json') ||
    String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';

  if (req.method !== 'POST') {
    if (!wantsJson) {
      return sendHtmlPage(
        res,
        405,
        'Method Not Allowed',
        'Use POST to submit this form',
        'This endpoint accepts HTTP POST submissions from HTML forms, JavaScript fetch, or REST API clients.'
      );
    }
    return sendJson(res, 405, { ok: false, error: 'Method not allowed. Send a POST request.' });
  }

  const urlPath = String(req.url || '').split('?')[0];
  const segments = urlPath.split('/').filter(Boolean);
  const formKey = String(explicitFormKey || req.query?.formKey || segments[segments.length - 1] || '').trim();

  if (!formKey || !/^[a-zA-Z0-9_-]{3,64}$/.test(formKey)) {
    return wantsJson
      ? sendJson(res, 400, { ok: false, error: 'Invalid form identifier.' })
      : sendHtmlPage(res, 400, 'Invalid Form', 'Invalid form identifier', 'Please check the form action URL.');
  }

  let parsedBody;
  try {
    parsedBody = await readBodyWithFiles(req);
  } catch (err) {
    const msg = err?.message || 'Unable to read submission payload.';
    return wantsJson
      ? sendJson(res, 413, { ok: false, error: msg })
      : sendHtmlPage(res, 413, 'Payload Too Large', 'Submission too large', msg);
  }

  const rawPayload = parsedBody.fields && typeof parsedBody.fields === 'object' ? { ...parsedBody.fields } : {};
  const files = Array.isArray(parsedBody.files) ? parsedBody.files.slice(0, 10) : [];

  // 1. Load public form projection from Cloud Firestore
  const lookup = await firestoreGetPublicForm(formKey);
  if (lookup.status === 'not_found') {
    const msg = 'Form not found. Check your Form ID or ensure the form has been created.';
    return wantsJson
      ? sendJson(res, 404, { ok: false, error: msg })
      : sendHtmlPage(res, 404, 'Form Not Found', 'Form not found', msg);
  }
  if (lookup.status === 'forbidden') {
    const msg =
      'This form is not published yet (it is currently Draft, Inactive, or Suspended). Publish the form in BrosDev Forms before submitting from your website.';
    return wantsJson
      ? sendJson(res, 403, { ok: false, error: msg })
      : sendHtmlPage(res, 403, 'Form Unavailable', 'Form is not published', msg);
  }
  if (lookup.status !== 'ok' || !lookup.form) {
    const msg = lookup.message || 'Unable to verify form configuration.';
    return wantsJson
      ? sendJson(res, 502, { ok: false, error: msg })
      : sendHtmlPage(res, 502, 'Temporary Error', 'Unable to verify form', msg);
  }

  const publicForm = lookup.form;
  if (publicForm.status !== 'published') {
    const msg = 'This form is not currently accepting submissions.';
    return wantsJson
      ? sendJson(res, 403, { ok: false, error: msg })
      : sendHtmlPage(res, 403, 'Form Inactive', 'Form is not active', msg);
  }

  // 2. Domain allowlist verification
  const originDomain = extractOriginHostname(req);
  const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (!isDomainAllowed(originDomain, publicForm.allowedDomains, reqHost)) {
    const msg = `Submissions from "${originDomain}" are not permitted by this form's domain allowlist.`;
    return wantsJson
      ? sendJson(res, 403, { ok: false, error: msg })
      : sendHtmlPage(res, 403, 'Domain Not Allowed', 'Domain not allowed', msg);
  }

  // 3. Optional Secret API Key verification (SHA-256 constant-time check)
  const spamConfig =
    publicForm.spamProtection && typeof publicForm.spamProtection === 'object'
      ? publicForm.spamProtection
      : {};
  if (spamConfig.requireSecretKey) {
    const providedKey = String(req.headers['x-api-key'] || rawPayload._apiKey || '').trim();
    const expectedHash = String(publicForm.secretApiKeyHash || '').trim();
    const keyMatches =
      providedKey &&
      expectedHash &&
      (expectedHash.length === 64
        ? timingSafeHexEqual(sha256Hex(providedKey), expectedHash)
        : timingSafeHexEqual(providedKey.slice(-16), expectedHash));

    if (!keyMatches) {
      const msg = 'Valid X-API-Key header is required to submit this form.';
      return wantsJson
        ? sendJson(res, 401, { ok: false, error: msg })
        : sendHtmlPage(res, 401, 'Unauthorized', 'API key required', msg);
    }
  }

  // 4. Honeypot anti-spam check
  const honeypotField = String(spamConfig.honeypotField || '_gotcha');
  const honeypotEnabled = spamConfig.honeypotEnabled !== false;
  const honeypotVal = rawPayload[honeypotField];
  const isSpam = Boolean(honeypotEnabled && honeypotVal && String(honeypotVal).trim() !== '');

  const requestedRedirect = typeof rawPayload._redirect === 'string' ? rawPayload._redirect.trim() : '';
  delete rawPayload[honeypotField];
  delete rawPayload._redirect;
  delete rawPayload._apiKey;

  if (isSpam) {
    // Silent 200 to avoid tipping off spam bots; do not store or send email
    if (!wantsJson) {
      return sendHtmlPage(
        res,
        200,
        'Submission Received',
        'Thank you!',
        String(publicForm.successMessage || 'Your submission has been received.')
      );
    }
    return sendJson(res, 200, {
      ok: true,
      formKey,
      message: String(publicForm.successMessage || 'Thank you! Your submission has been received.'),
      emailDeliveryStatus: 'disabled',
    });
  }

  // 5. Validate fields against form schema
  const fieldErrors = validateSubmissionFields(publicForm.fields, rawPayload, files);
  if (Object.keys(fieldErrors).length > 0) {
    if (!wantsJson) {
      const listItems = Object.entries(fieldErrors)
        .map(([k, msg]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(msg)}</li>`)
        .join('');
      return sendHtmlPage(
        res,
        422,
        'Validation Error',
        'Please check your form entries',
        'One or more fields need attention before submitting.',
        `<ul style="margin:14px 0 0;padding-left:18px;font-size:13px;color:#A90706;">${listItems}</ul><div style="margin-top:18px;"><a href="javascript:history.back()" style="color:#111111;font-size:13px;font-weight:600;">&larr; Go back to form</a></div>`
      );
    }
    return sendJson(res, 422, {
      ok: false,
      error: 'Validation failed for one or more form fields.',
      fieldErrors,
    });
  }

  // 6. Unseal server-side email routing config & dispatch via Resend
  const cleanPayload = sanitizePayloadForFirestore(rawPayload);
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  const routingConfig = unsealRoutingPayload(publicForm.routingToken);

  let emailDeliveryStatus = 'disabled';
  let emailError = '';
  let resendMessageId = '';

  if (!routingConfig) {
    if (!resendApiKey) {
      emailDeliveryStatus = 'failed';
      emailError = 'RESEND_API_KEY is not configured in server environment variables.';
    } else if (!publicForm.routingToken) {
      emailDeliveryStatus = 'failed';
      emailError = 'Form email routing token is missing. Open the form in BrosDev Forms and click Save to activate email forwarding.';
    } else {
      emailDeliveryStatus = 'failed';
      emailError = 'Form email routing key changed. Open the form in BrosDev Forms to refresh email routing.';
    }
  } else if (routingConfig.notificationsEnabled === false || !Array.isArray(routingConfig.recipients) || routingConfig.recipients.length === 0) {
    emailDeliveryStatus = 'disabled';
  } else if (!resendApiKey) {
    emailDeliveryStatus = 'failed';
    emailError = 'RESEND_API_KEY is not configured in server environment variables.';
  } else {
    const formTitle = String(publicForm.title || formKey);
    const subject =
      interpolateTemplate(routingConfig.subject || `New submission: ${formTitle}`, cleanPayload).trim() ||
      `New submission: ${formTitle}`;
    const replyToField = String(routingConfig.replyToField || 'email');
    const replyToVal = cleanPayload[replyToField] ? String(cleanPayload[replyToField]).trim() : '';

    const isWhiteLabel = Boolean(routingConfig.removeBranding || publicForm.removeBranding);
    const html = renderNotificationHtml(
      formTitle,
      cleanPayload,
      files,
      originDomain,
      routingConfig.defaultEmailFooter,
      isWhiteLabel
    );

    const sendRes = await sendViaResend({
      apiKey: resendApiKey,
      fromName: routingConfig.senderDisplayName || 'BrosDev Forms',
      fromEmail: routingConfig.defaultSenderEmail || 'onboarding@resend.dev',
      to: routingConfig.recipients,
      subject,
      html,
      replyTo: isValidEmail(replyToVal) ? replyToVal : undefined,
    });

    if (sendRes.ok) {
      emailDeliveryStatus = 'accepted';
      resendMessageId = sendRes.resendMessageId || '';
    } else {
      emailDeliveryStatus = 'failed';
      emailError = sendRes.error || 'Resend email delivery failed.';
    }

    // Optional submitter confirmation auto-reply
    if (routingConfig.confirmationEnabled) {
      const autoReplyField = String(routingConfig.autoReplyEmailField || 'email');
      const submitterEmail = cleanPayload[autoReplyField] ? String(cleanPayload[autoReplyField]).trim() : '';
      if (isValidEmail(submitterEmail)) {
        const autoSubject =
          interpolateTemplate(routingConfig.autoReplySubject || 'Thank you for your message', cleanPayload).trim() ||
          'Thank you for your message';
        const autoBody = interpolateTemplate(
          routingConfig.autoReplyBody || 'Thank you! We received your submission and will reply shortly.',
          cleanPayload
        );
        await sendViaResend({
          apiKey: resendApiKey,
          fromName: routingConfig.senderDisplayName || 'BrosDev Forms',
          fromEmail: routingConfig.defaultSenderEmail || 'onboarding@resend.dev',
          to: [submitterEmail],
          subject: autoSubject,
          html: renderAutoReplyHtml(autoSubject, autoBody, routingConfig.defaultEmailFooter, isWhiteLabel),
        }).catch(() => {});
      }
    }
  }

  // 7. Persist submission to Cloud Firestore
  const subId = Date.now() * 100 + Math.floor(Math.random() * 100);
  const subDocId = `sub_${subId}`;
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const sourceIp = (forwardedFor || String(req.socket?.remoteAddress || 'external')).slice(0, 64);

  const persistResult = await firestoreCreateSubmission(subDocId, {
    id: subId,
    formId: Number(publicForm.formId),
    formDocId: String(publicForm.formDocId || `form_${publicForm.formId}`),
    formKey,
    formTitle: String(publicForm.title || formKey).slice(0, 160),
    ownerUid: String(publicForm.ownerUid),
    payload: cleanPayload,
    files,
    isRead: false,
    status: 'received',
    emailDeliveryStatus,
    sourceIp,
    originDomain: originDomain.slice(0, 255),
  });

  // 7b. Optional outbound HTTPS webhook dispatch (Professional & Business plans)
  if (routingConfig?.webhookUrl && isSafeWebhookUrl(routingConfig.webhookUrl)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    await fetch(routingConfig.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BrosDevForms-Webhook/1.0',
      },
      body: JSON.stringify({
        event: 'form.submitted',
        submissionId: subId,
        formKey,
        formTitle: String(publicForm.title || formKey),
        originDomain,
        payload: cleanPayload,
        files,
        receivedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  }

  // 8. Respond (Redirect, HTML thank-you page, or JSON)
  const finalRedirect = isSafeHttpUrl(requestedRedirect)
    ? requestedRedirect
    : isSafeHttpUrl(publicForm.redirectUrl)
      ? String(publicForm.redirectUrl).trim()
      : '';

  const successMessage = String(
    publicForm.successMessage || 'Thank you! Your submission has been received.'
  );
  const removeBrandingPage = Boolean(routingConfig?.removeBranding || publicForm.removeBranding);

  if (!wantsJson) {
    if (finalRedirect) {
      res.statusCode = 303;
      res.setHeader('Location', finalRedirect);
      return res.end();
    }
    return sendHtmlPage(
      res,
      200,
      `${publicForm.title || 'Submission'} — Received`,
      'Thank you!',
      successMessage,
      '',
      removeBrandingPage
    );
  }

  return sendJson(res, 200, {
    ok: true,
    submissionId: subId,
    formId: formKey,
    formKey,
    message: successMessage,
    ...(finalRedirect ? { redirectUrl: finalRedirect } : {}),
    emailDeliveryStatus,
    ...(resendMessageId ? { resendMessageId } : {}),
    ...(emailError ? { emailError } : {}),
    persisted: persistResult.ok,
    ...(!persistResult.ok ? { persistError: persistResult.error } : {}),
    receivedAt: new Date().toISOString(),
  });
}

// ---------------- DYNAMIC SAFE EMBED WIDGET ----------------

export async function handleEmbedScript(req, res, explicitFormKey) {
  applyCors(req, res, true);
  const urlPath = String(req.url || '').split('?')[0];
  const segments = urlPath.split('/').filter(Boolean);
  const rawKey = String(explicitFormKey || req.query?.formKey || segments[segments.length - 1] || '');
  const formKey = rawKey.replace(/\.js$/, '').trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'forms.brosdev.info');
  const proto = String(req.headers['x-forwarded-proto'] || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'));
  const baseUrl = String(process.env.APP_URL || `${proto}://${host}`).replace(/\/+$/, '');

  let formConfig = {
    formKey,
    title: '',
    description: '',
    fields: [
      { type: 'short_text', name: 'name', label: 'Full Name', placeholder: 'Your name', required: true },
      { type: 'email', name: 'email', label: 'Email Address', placeholder: 'you@company.com', required: true },
      { type: 'long_text', name: 'message', label: 'Message', placeholder: 'How can we help?', required: true },
    ],
    honeypotEnabled: true,
    honeypotField: '_gotcha',
    successMessage: 'Thank you! Your submission has been received.',
    removeBranding: false,
    statusError: '',
  };

  if (/^[a-zA-Z0-9_-]{3,64}$/.test(formKey)) {
    const lookup = await firestoreGetPublicForm(formKey).catch(() => ({ status: 'error' }));
    if (lookup.status === 'ok' && lookup.form) {
      const pf = lookup.form;
      const spam = pf.spamProtection && typeof pf.spamProtection === 'object' ? pf.spamProtection : {};
      formConfig = {
        formKey,
        title: String(pf.title || ''),
        description: String(pf.description || ''),
        fields: Array.isArray(pf.fields) && pf.fields.length > 0 ? pf.fields : formConfig.fields,
        honeypotEnabled: spam.honeypotEnabled !== false,
        honeypotField: String(spam.honeypotField || '_gotcha'),
        successMessage: String(pf.successMessage || formConfig.successMessage),
        removeBranding: Boolean(pf.removeBranding),
        statusError: pf.status !== 'published' ? 'This form is not currently accepting submissions.' : '',
      };
    } else if (lookup.status === 'forbidden') {
      formConfig.statusError = 'This form is not published yet. Publish it in BrosDev Forms to display it.';
    } else if (lookup.status === 'not_found') {
      formConfig.statusError = 'Form not found. Check your embed code Form ID.';
    }
  }

  const endpoint = `${baseUrl}/api/submit/${encodeURIComponent(formKey)}`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.end(`(function(){
  var cfg = ${JSON.stringify(formConfig)};
  var endpoint = ${JSON.stringify(endpoint)};

  function findContainers() {
    var list = [];
    var byId = document.getElementById('brosdev-form-' + cfg.formKey);
    if (byId) list.push(byId);
    var byAttr = document.querySelectorAll('[data-brosdev-form="' + cfg.formKey + '"]');
    for (var i = 0; i < byAttr.length; i++) {
      if (list.indexOf(byAttr[i]) === -1) list.push(byAttr[i]);
    }
    return list;
  }

  function applyInputStyle(el) {
    el.style.width = '100%';
    el.style.boxSizing = 'border-box';
    el.style.padding = '10px 12px';
    el.style.border = '1px solid #D4D4D4';
    el.style.borderRadius = '6px';
    el.style.fontSize = '14px';
    el.style.fontFamily = 'inherit';
    el.style.background = '#FFFFFF';
    el.style.color = '#111111';
  }

  function renderWidget(container) {
    while (container.firstChild) container.removeChild(container.firstChild);

    var card = document.createElement('div');
    card.style.fontFamily = 'Inter, system-ui, -apple-system, sans-serif';
    card.style.maxWidth = '520px';
    card.style.background = '#FFFFFF';
    card.style.border = '1px solid #E5E5E5';
    card.style.borderRadius = '10px';
    card.style.padding = '24px';
    card.style.boxSizing = 'border-box';
    card.style.color = '#111111';

    if (cfg.statusError) {
      var errP = document.createElement('p');
      errP.style.margin = '0';
      errP.style.fontSize = '14px';
      errP.style.color = '#A90706';
      errP.textContent = cfg.statusError;
      card.appendChild(errP);
      container.appendChild(card);
      return;
    }

    if (cfg.title) {
      var h = document.createElement('h3');
      h.style.margin = '0 0 6px';
      h.style.fontSize = '18px';
      h.style.fontWeight = '700';
      h.textContent = cfg.title;
      card.appendChild(h);
    }

    if (cfg.description) {
      var d = document.createElement('p');
      d.style.margin = '0 0 18px';
      d.style.fontSize = '13px';
      d.style.color = '#525252';
      d.textContent = cfg.description;
      card.appendChild(d);
    }

    var form = document.createElement('form');
    form.style.display = 'grid';
    form.style.gap = '14px';

    if (cfg.honeypotEnabled) {
      var hp = document.createElement('input');
      hp.type = 'text';
      hp.name = cfg.honeypotField || '_gotcha';
      hp.style.display = 'none';
      hp.tabIndex = -1;
      hp.autocomplete = 'off';
      form.appendChild(hp);
    }

    var submitLabel = 'Submit';
    var hasFile = false;

    for (var i = 0; i < cfg.fields.length; i++) {
      var f = cfg.fields[i];
      if (!f || !f.type) continue;

      if (f.type === 'submit') {
        if (f.label) submitLabel = f.label;
        continue;
      }
      if (f.type === 'divider') {
        var hr = document.createElement('hr');
        hr.style.border = 'none';
        hr.style.borderTop = '1px solid #E5E5E5';
        hr.style.margin = '4px 0';
        form.appendChild(hr);
        continue;
      }
      if (f.type === 'heading') {
        var sh = document.createElement('div');
        sh.style.fontSize = '15px';
        sh.style.fontWeight = '700';
        sh.textContent = f.label || '';
        form.appendChild(sh);
        continue;
      }
      if (f.type === 'hidden') {
        var hid = document.createElement('input');
        hid.type = 'hidden';
        hid.name = f.name || '';
        hid.value = f.defaultValue || '';
        form.appendChild(hid);
        continue;
      }

      var wrap = document.createElement('div');
      wrap.style.display = 'grid';
      wrap.style.gap = '6px';

      var lbl = document.createElement('label');
      lbl.style.fontSize = '13px';
      lbl.style.fontWeight = '600';
      lbl.style.color = '#111111';
      lbl.textContent = (f.label || f.name || 'Field') + (f.required ? ' *' : '');
      wrap.appendChild(lbl);

      var inputEl;
      if (f.type === 'long_text') {
        inputEl = document.createElement('textarea');
        inputEl.rows = 4;
        applyInputStyle(inputEl);
      } else if (f.type === 'dropdown') {
        inputEl = document.createElement('select');
        applyInputStyle(inputEl);
        var opts = Array.isArray(f.options) && f.options.length ? f.options : ['Option 1'];
        for (var j = 0; j < opts.length; j++) {
          var opt = document.createElement('option');
          opt.value = String(opts[j]);
          opt.textContent = String(opts[j]);
          inputEl.appendChild(opt);
        }
      } else if (f.type === 'radio' || f.type === 'checkbox') {
        var group = document.createElement('div');
        group.style.display = 'grid';
        group.style.gap = '6px';
        var choices = Array.isArray(f.options) && f.options.length ? f.options : [f.label || 'Yes'];
        for (var c = 0; c < choices.length; c++) {
          var row = document.createElement('label');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.gap = '8px';
          row.style.fontSize = '13px';
          var cb = document.createElement('input');
          cb.type = f.type;
          cb.name = f.name || '';
          cb.value = String(choices[c]);
          if (f.required && f.type === 'radio' && c === 0) cb.required = true;
          row.appendChild(cb);
          var sp = document.createElement('span');
          sp.textContent = String(choices[c]);
          row.appendChild(sp);
          group.appendChild(row);
        }
        wrap.appendChild(group);
        form.appendChild(wrap);
        continue;
      } else {
        inputEl = document.createElement('input');
        inputEl.type = f.type === 'short_text' ? 'text' : (f.type === 'phone' ? 'tel' : f.type);
        if (f.type === 'file') hasFile = true;
        applyInputStyle(inputEl);
      }

      inputEl.name = f.name || '';
      if (f.placeholder) inputEl.placeholder = f.placeholder;
      if (f.defaultValue && f.type !== 'file') inputEl.value = f.defaultValue;
      if (f.required) inputEl.required = true;
      wrap.appendChild(inputEl);
      form.appendChild(wrap);
    }

    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.textContent = submitLabel;
    btn.style.padding = '11px 18px';
    btn.style.background = '#A90706';
    btn.style.color = '#FFFFFF';
    btn.style.border = 'none';
    btn.style.borderRadius = '6px';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '600';
    btn.style.cursor = 'pointer';
    form.appendChild(btn);

    var statusEl = document.createElement('div');
    statusEl.style.fontSize = '13px';
    statusEl.style.minHeight = '18px';
    form.appendChild(statusEl);

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      btn.disabled = true;
      statusEl.style.color = '#525252';
      statusEl.textContent = 'Sending...';

      var fetchOpts;
      if (hasFile) {
        fetchOpts = {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: new FormData(form)
        };
      } else {
        var data = {};
        new FormData(form).forEach(function(v, k) {
          if (Object.prototype.hasOwnProperty.call(data, k)) {
            data[k] = Array.isArray(data[k]) ? data[k].concat([v]) : [data[k], v];
          } else {
            data[k] = v;
          }
        });
        fetchOpts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data)
        };
      }

      fetch(endpoint, fetchOpts)
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, data: j }; }); })
        .then(function(res) {
          if (!res.ok || !res.data.ok) {
            statusEl.style.color = '#A90706';
            statusEl.textContent = (res.data && res.data.error) || 'Submission failed. Please check your entries.';
            return;
          }
          statusEl.style.color = '#16A34A';
          statusEl.textContent = res.data.message || cfg.successMessage;
          form.reset();
          if (res.data.redirectUrl && /^https?:\\/\\//i.test(res.data.redirectUrl)) {
            window.location.href = res.data.redirectUrl;
          }
        })
        .catch(function() {
          statusEl.style.color = '#A90706';
          statusEl.textContent = 'Network error. Please try again.';
        })
        .finally(function() {
          btn.disabled = false;
        });
    });

    card.appendChild(form);
    if (!cfg.removeBranding) {
      var brand = document.createElement('div');
      brand.style.marginTop = '12px';
      brand.style.paddingTop = '10px';
      brand.style.borderTop = '1px solid #F0F0F0';
      brand.style.fontSize = '11px';
      brand.style.color = '#737373';
      brand.textContent = 'Powered by BrosDev Forms';
      card.appendChild(brand);
    }
    container.appendChild(card);
  }

  function mountAll() {
    var containers = findContainers();
    for (var i = 0; i < containers.length; i++) {
      renderWidget(containers[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();`);
}
