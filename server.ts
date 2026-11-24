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

  // Health probe (no DB eager probe on startup)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'brosdev-forms' });
  });

  // Public form submission endpoints, embeddable widgets, and verified webhooks
  app.use('/api', publicRouter);
  app.use('/', publicRouter);

  // Email & password registration / sign-in
  app.use('/api', authRouter);

  // Authenticated & RBAC-enforced Super Admin APIs
  app.use('/api/admin', adminRouter);

  // Authenticated Customer SaaS APIs
  app.use('/api', customerRouter);

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
