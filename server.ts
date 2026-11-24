import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicRouter } from './src/server/routes/publicRoutes.ts';
import { authRouter } from './src/server/routes/authRoutes.ts';
import { customerRouter } from './src/server/routes/customerRoutes.ts';
import { adminRouter } from './src/server/routes/adminRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Capture raw request body for HMAC signature verification on webhooks
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
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

  // Health probe (no DB eager probe on startup)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'brosdev-forms' });
  });

  // Email & password registration / sign-in
  app.use('/api', authRouter);

  // Public form submission endpoints, embeddable widgets, and verified webhooks
  app.use('/api', publicRouter);
  app.use('/', publicRouter);

  // Authenticated & RBAC-enforced Super Admin APIs
  app.use('/api/admin', adminRouter);

  // Authenticated Customer SaaS APIs
  app.use('/api', customerRouter);

  // Always return JSON for unmatched /api/* routes instead of falling back to HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Structured JSON error handler for malformed payloads or unexpected API errors
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
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
    }
  );

  // Mount Vite middleware in development or static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BrosDev Forms server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
