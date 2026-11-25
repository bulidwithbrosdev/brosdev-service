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
  handlePublicWidgetConfig,
  handleWidgetEmbedLoaderJs,
  handleWidgetEventTrack,
} from '../../api/_lib.js';
import {
  handleCampaignDomains,
  handleCampaignSend,
  handleCampaignTestSend,
  handleCampaignUnsubscribe,
  handleCronCampaigns,
  handleResendWebhook,
} from '../../api/_campaigns.js';

export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );
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

  // Phase 2 — Public Website Widgets Embed Loader, Config & Analytics
  app.get('/embed.js', (req: Request, res: Response) => {
    void handleWidgetEmbedLoaderJs(req, res);
  });

  app.get('/api/widgets/embed', (req: Request, res: Response) => {
    void handleWidgetEmbedLoaderJs(req, res);
  });

  app.get('/api/widgets/embed.js', (req: Request, res: Response) => {
    void handleWidgetEmbedLoaderJs(req, res);
  });

  app.all('/api/widgets/public/:publicId', (req: Request, res: Response) => {
    void handlePublicWidgetConfig(req, res, req.params.publicId);
  });

  app.all('/api/widgets/events', (req: Request, res: Response) => {
    void handleWidgetEventTrack(req, res);
  });

  // Phase 3 — Email Campaign Studio, Resend Domains, Webhooks, Unsubscribe & Cron
  app.all('/api/campaigns/domains', (req: Request, res: Response) => {
    void handleCampaignDomains(req, res);
  });

  app.all('/api/campaigns/unsubscribe', (req: Request, res: Response) => {
    void handleCampaignUnsubscribe(req, res);
  });

  app.all('/api/campaigns/:id/test', (req: Request, res: Response) => {
    void handleCampaignTestSend(req, res, req.params.id);
  });

  app.all('/api/campaigns/:id/send', (req: Request, res: Response) => {
    void handleCampaignSend(req, res, req.params.id);
  });

  app.all('/api/webhooks/resend', (req: Request, res: Response) => {
    void handleResendWebhook(req, res);
  });

  app.all('/api/cron/campaigns', (req: Request, res: Response) => {
    void handleCronCampaigns(req, res);
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
