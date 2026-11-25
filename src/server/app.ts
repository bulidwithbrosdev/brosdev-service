import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import {
  handleEmbedScript,
  handleHealth,
  handlePublicNewsletterSubscribe,
  handlePublicSubmit,
  handleRazorpayWebhook,
  handleResendSend,
  handleResendTestConnection,
  handleSealRouting,
  handleShortLinkRedirect,
  handleWebhookDispatch,
} from '../../api/_lib.js';

export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.all('/api/health', (req: Request, res: Response) => {
    void handleHealth(req, res);
  });

  app.all('/api/forms/seal-routing', (req: Request, res: Response) => {
    void handleSealRouting(req, res);
  });

  app.all('/api/resend/test-connection', (req: Request, res: Response) => {
    void handleResendTestConnection(req, res);
  });

  app.all('/api/resend/send', (req: Request, res: Response) => {
    void handleResendSend(req, res);
  });

  app.all('/api/webhooks/dispatch', (req: Request, res: Response) => {
    void handleWebhookDispatch(req, res);
  });

  app.all('/api/newsletter/:listKey/subscribe', (req: Request, res: Response) => {
    void handlePublicNewsletterSubscribe(req, res, req.params.listKey);
  });

  app.all('/api/newsletter/:listKey', (req: Request, res: Response) => {
    void handlePublicNewsletterSubscribe(req, res, req.params.listKey);
  });

  app.all('/api/billing/razorpay/webhook', (req: Request, res: Response) => {
    void handleRazorpayWebhook(req, res);
  });

  app.get('/api/r/:slug', (req: Request, res: Response) => {
    void handleShortLinkRedirect(req, res, req.params.slug);
  });

  app.get('/r/:slug', (req: Request, res: Response) => {
    void handleShortLinkRedirect(req, res, req.params.slug);
  });

  app.all('/api/submit/:formKey', (req: Request, res: Response) => {
    void handlePublicSubmit(req, res, req.params.formKey);
  });

  app.all('/submit/:formKey', (req: Request, res: Response) => {
    void handlePublicSubmit(req, res, req.params.formKey);
  });

  app.get('/api/embed/:formKey', (req: Request, res: Response) => {
    void handleEmbedScript(req, res, req.params.formKey);
  });

  app.get('/embed/:formKey', (req: Request, res: Response) => {
    void handleEmbedScript(req, res, req.params.formKey);
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

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
