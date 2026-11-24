const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAnairFslSrj47ORXdWMQ3Ex2MSUPEe9DE';

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

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (typeof req.body === 'object') {
      return req.body;
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    const obj = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function handleHealth(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  return sendJson(res, 200, {
    ok: true,
    service: 'brosdev-forms',
    database: 'firestore',
    resendConfigured: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
  });
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

    const fromName = String(body?.fromName || 'BrosDev Forms').replace(/[\r\n<>]/g, '').trim();
    const rawFromEmail = String(body?.fromEmail || 'onboarding@resend.dev').trim();
    const safeFromEmail = rawFromEmail.includes('@') ? rawFromEmail : 'onboarding@resend.dev';
    const fromHeader = `${fromName || 'BrosDev Forms'} <${safeFromEmail}>`;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader,
        to: recipients,
        subject: String(body?.subject || 'New Form Submission'),
        html: String(body?.html || '<p>New submission received via BrosDev Forms.</p>'),
        ...(body?.replyTo ? { reply_to: String(body.replyTo) } : {}),
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return sendJson(res, 200, {
        status: 'failed',
        error: json?.message || `Resend returned HTTP ${resp.status}`,
      });
    }

    return sendJson(res, 200, {
      status: 'accepted',
      resendMessageId: String(json?.id || ''),
    });
  } catch (err) {
    return sendJson(res, 200, {
      status: 'failed',
      error: err?.message || 'Unable to send email via Resend.',
    });
  }
}

export async function handlePublicSubmit(req, res, explicitFormKey) {
  applyCors(req, res, true);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const urlPath = String(req.url || '').split('?')[0];
  const segments = urlPath.split('/').filter(Boolean);
  const formKey = String(explicitFormKey || req.query?.formKey || segments[segments.length - 1] || '').trim();

  if (!formKey || !/^[a-zA-Z0-9_-]{3,64}$/.test(formKey)) {
    return sendJson(res, 400, { ok: false, error: 'Invalid form identifier.' });
  }

  const payload = await readBody(req);
  const accept = String(req.headers.accept || '');
  const contentType = String(req.headers['content-type'] || '');
  const wantsJson = accept.includes('application/json') || contentType.includes('application/json');
  const redirectUrl =
    typeof payload?._redirect === 'string' && /^https?:\/\//i.test(payload._redirect)
      ? payload._redirect
      : '';

  if (redirectUrl && !wantsJson) {
    res.statusCode = 303;
    res.setHeader('Location', redirectUrl);
    return res.end();
  }

  if (!wantsJson) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>Submission Received</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:24px;color:#111"><h2 style="margin:0 0 8px">Thank you!</h2><p style="color:#525252">Your submission for <strong>${escapeHtml(formKey)}</strong> was received.</p></body></html>`
    );
  }

  return sendJson(res, 200, {
    ok: true,
    formKey,
    message: 'Thank you! Your submission has been received.',
    receivedAt: new Date().toISOString(),
  });
}

export async function handleEmbedScript(req, res, explicitFormKey) {
  applyCors(req, res, true);
  const urlPath = String(req.url || '').split('?')[0];
  const segments = urlPath.split('/').filter(Boolean);
  const rawKey = String(explicitFormKey || req.query?.formKey || segments[segments.length - 1] || '');
  const formKey = rawKey.replace(/\.js$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'forms.brosdev.info');
  const proto = String(req.headers['x-forwarded-proto'] || 'https');
  const baseUrl = String(process.env.APP_URL || `${proto}://${host}`).replace(/\/+$/, '');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.end(`(function(){
  var key=${JSON.stringify(formKey)};
  var endpoint=${JSON.stringify(`${baseUrl}/api/submit/${formKey}`)};
  document.querySelectorAll('[data-brosdev-form="'+key+'"]').forEach(function(el){
    el.innerHTML='<form style="font-family:system-ui,sans-serif;max-width:460px;display:grid;gap:12px">'
      +'<input name="name" required placeholder="Your name" style="padding:10px;border:1px solid #d4d4d4;border-radius:6px" />'
      +'<input name="email" type="email" required placeholder="you@company.com" style="padding:10px;border:1px solid #d4d4d4;border-radius:6px" />'
      +'<textarea name="message" required rows="4" placeholder="Message" style="padding:10px;border:1px solid #d4d4d4;border-radius:6px"></textarea>'
      +'<button type="submit" style="padding:10px 16px;background:#A90706;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Send Message</button>'
      +'<div data-status style="font-size:13px;color:#525252"></div></form>';
    var f=el.querySelector('form'), st=el.querySelector('[data-status]');
    f.addEventListener('submit', function(e){
      e.preventDefault();
      st.textContent='Sending...';
      var body={};
      new FormData(f).forEach(function(v,k){ body[k]=v; });
      fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)})
        .then(function(r){ return r.json(); })
        .then(function(d){ st.textContent=d.message||'Submitted!'; f.reset(); })
        .catch(function(){ st.textContent='Submission failed. Please try again.'; });
    });
  });
})();`);
}
