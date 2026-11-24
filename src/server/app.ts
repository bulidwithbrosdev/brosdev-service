import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';

function getResendApiKey(): string {
  return (process.env.RESEND_API_KEY || '').trim();
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function verifyBearerFirebaseUser(req: Request) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await adminAuth.verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // CORS support for custom frontend origins (e.g., https://forms.brosdev.info)
  const configuredOrigins = new Set(
    [
      'https://forms.brosdev.info',
      'https://www.forms.brosdev.info',
      process.env.APP_URL,
      ...(process.env.ALLOWED_FRONTEND_ORIGINS || '').split(','),
    ]
      .map((origin) => (origin || '').trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );

  app.use('/api', (req, res, next) => {
    const origin = (req.headers.origin || '').trim().replace(/\/+$/, '');
    const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (origin && (configuredOrigins.has(origin) || isLocalOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Accept, X-API-Key, Idempotency-Key'
      );
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  // Health check (Firebase Firestore mode — zero external PostgreSQL required)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'brosdev-forms',
      database: 'firestore',
      resendConfigured: Boolean(getResendApiKey()),
    });
  });

  // Server-side Resend connection test (never exposes RESEND_API_KEY to browser)
  app.post('/api/resend/test-connection', async (req: Request, res: Response) => {
    const decoded = await verifyBearerFirebaseUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const apiKey = getResendApiKey();
    if (!apiKey) {
      return res.json({
        connected: false,
        error: 'RESEND_API_KEY is not configured in server environment variables.',
        domains: [],
      });
    }
    try {
      const resp = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.json({
          connected: false,
          error: json?.message || `Resend returned HTTP ${resp.status}`,
          domains: [],
        });
      }
      const domains = Array.isArray(json?.data)
        ? json.data.map((d: any) => ({ name: String(d.name || ''), status: String(d.status || 'unknown') }))
        : [];
      return res.json({ connected: true, domains });
    } catch (err: any) {
      return res.json({
        connected: false,
        error: err?.message || 'Unable to reach Resend API.',
        domains: [],
      });
    }
  });

  // Server-side Resend email dispatch (authenticated Firebase users only)
  app.post('/api/resend/send', async (req: Request, res: Response) => {
    const decoded = await verifyBearerFirebaseUser(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const apiKey = getResendApiKey();
    const {
      to,
      subject,
      html,
      fromName = 'BrosDev Forms',
      fromEmail = 'forms@brosdev.xyz',
      replyTo,
    } = req.body || {};

    const recipients = Array.isArray(to) ? to.filter(Boolean) : to ? [String(to)] : [];
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient email is required.' });
    }

    if (!apiKey) {
      return res.status(200).json({
        status: 'failed',
        error: 'RESEND_API_KEY is not set in server environment variables.',
      });
    }

    const safeFromEmail = String(fromEmail).includes('@') ? String(fromEmail) : 'forms@brosdev.xyz';
    const fromHeader = `${String(fromName || 'BrosDev Forms').replace(/[\r\n<>]/g, '')} <${safeFromEmail}>`;

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader,
          to: recipients,
          subject: String(subject || 'New Form Submission'),
          html: String(html || `<p>New submission received via BrosDev Forms.</p>`),
          ...(replyTo ? { reply_to: String(replyTo) } : {}),
        }),
      });
      const json: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(200).json({
          status: 'failed',
          error: json?.message || `Resend returned HTTP ${resp.status}`,
        });
      }
      return res.status(200).json({
        status: 'sent',
        resendMessageId: String(json?.id || ''),
      });
    } catch (err: any) {
      return res.status(200).json({
        status: 'failed',
        error: err?.message || 'Network error while contacting Resend API.',
      });
    }
  });

  // Public form submission handler (supports HTML forms, Fetch API, and REST API)
  const handlePublicSubmit = async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-API-Key, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const formKey = String(req.params.formKey || '').trim();
    if (!formKey || !/^[a-zA-Z0-9_-]{3,64}$/.test(formKey)) {
      return res.status(400).json({ ok: false, error: 'Invalid form identifier.' });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const wantsJson =
      req.headers.accept?.includes('application/json') ||
      req.headers['content-type']?.includes('application/json');

    const redirectUrl = typeof payload._redirect === 'string' && /^https?:\/\//i.test(payload._redirect)
      ? payload._redirect
      : '';

    if (redirectUrl && !wantsJson) {
      return res.redirect(303, redirectUrl);
    }

    if (!wantsJson) {
      return res.status(200).send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Submission Received</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:24px;color:#111"><h2 style="margin:0 0 8px">Thank you!</h2><p style="color:#525252">Your submission for <strong>${escapeHtml(formKey)}</strong> was received.</p></body></html>`
      );
    }

    return res.status(200).json({
      ok: true,
      formKey,
      message: 'Thank you! Your submission has been received.',
      receivedAt: new Date().toISOString(),
    });
  };

  app.all('/api/submit/:formKey', handlePublicSubmit);
  app.all('/submit/:formKey', handlePublicSubmit);

  // Public embeddable JavaScript widget
  const handleEmbedScript = (req: Request, res: Response) => {
    const formKey = String(req.params.formKey || '').replace(/\.js$/, '');
    const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(`(function(){
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
  };

  app.get('/api/embed/:formKey', handleEmbedScript);
  app.get('/embed/:formKey', handleEmbedScript);

  // Clean JSON 404 for unmatched /api/* routes
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Structured JSON error handler for /api/*
  app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    if (req.path.startsWith('/api')) {
      const status = Number(err?.status || err?.statusCode || 500);
      const message =
        typeof err?.message === 'string' && err.message.trim()
          ? err.message.trim()
          : 'Internal server error.';
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
    return next(err);
  });

  return app;
}
