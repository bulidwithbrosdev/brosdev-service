import 'dotenv/config';
import express from 'express';
import { isDatabaseConfigured } from '../db/index.ts';
import { publicRouter } from './routes/publicRoutes.ts';
import { authRouter } from './routes/authRoutes.ts';
import { customerRouter } from './routes/customerRoutes.ts';
import { adminRouter } from './routes/adminRoutes.ts';

export function createApiApp() {
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
    res.json({
      ok: true,
      service: 'brosdev-forms',
      databaseConfigured: isDatabaseConfigured(),
    });
  });

  // Guard DB-backed API routes when deployed without database credentials configured
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error:
          'Database is not configured for this deployment. Add DATABASE_URL (PostgreSQL connection string) in your hosting Environment Variables and redeploy.',
      });
    }
    return next();
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

  return app;
}
