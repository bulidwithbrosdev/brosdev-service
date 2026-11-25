import {
  handleEmbedScript,
  handleHealth,
  handlePublicNewsletterSubscribe,
  handlePublicSubmit,
  handlePublicWidgetConfig,
  handleRazorpayWebhook,
  handleResendSend,
  handleResendTestConnection,
  handleSealRouting,
  handleShortLinkRedirect,
  handleWebhookDispatch,
  handleWidgetEmbedLoaderJs,
  handleWidgetEventTrack,
  sendJson,
} from './_lib.js';
import {
  handleCampaignDomains,
  handleCampaignSend,
  handleCampaignTestSend,
  handleCampaignUnsubscribe,
  handleCronCampaigns,
  handleResendWebhook,
} from './_campaigns.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function resolvePathname(req) {
  const urlObj = new URL(req.url || '/', 'https://forms.brosdev.info');
  const qPath =
    (Array.isArray(req.query?.__path) ? req.query.__path[0] : req.query?.__path) ||
    urlObj.searchParams.get('__path') ||
    '';
  const raw = String(qPath || urlObj.pathname || '/').trim();
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

export default async function handler(req, res) {
  const path = resolvePathname(req);

  try {
    // Health & Root
    if (path === '/' || path === '/api' || path === '/api/index' || path === '/api/health') {
      return await handleHealth(req, res);
    }

    // Phase 1 — Forms, Resend, Webhooks, Razorpay, Short Links, Newsletter
    if (path === '/api/forms/seal-routing') {
      return await handleSealRouting(req, res);
    }
    if (path === '/api/resend/test-connection') {
      return await handleResendTestConnection(req, res);
    }
    if (path === '/api/resend/send') {
      return await handleResendSend(req, res);
    }
    if (path === '/api/webhooks/dispatch') {
      return await handleWebhookDispatch(req, res);
    }
    if (path === '/api/webhooks/resend') {
      return await handleResendWebhook(req, res);
    }
    if (path === '/api/billing/razorpay/webhook' || path === '/api/billing/razorpay-webhook') {
      return await handleRazorpayWebhook(req, res);
    }

    const newsletterMatch = path.match(/^\/api\/newsletter\/([^/]+?)(?:\/subscribe)?$/);
    if (newsletterMatch) {
      return await handlePublicNewsletterSubscribe(req, res, decodeURIComponent(newsletterMatch[1]));
    }

    const shortLinkMatch = path.match(/^\/(?:api\/)?r\/([^/]+)$/);
    if (shortLinkMatch) {
      return await handleShortLinkRedirect(req, res, decodeURIComponent(shortLinkMatch[1]));
    }

    const submitMatch = path.match(/^\/(?:api\/)?submit\/([^/]+)$/);
    if (submitMatch) {
      return await handlePublicSubmit(req, res, decodeURIComponent(submitMatch[1]));
    }

    const embedFormMatch = path.match(/^\/(?:api\/)?embed\/([^/]+)$/);
    if (embedFormMatch) {
      return await handleEmbedScript(req, res, decodeURIComponent(embedFormMatch[1]));
    }

    // Phase 2 — Website Components & Widgets
    if (path === '/embed.js' || path === '/api/widgets/embed' || path === '/api/widgets/embed.js') {
      return await handleWidgetEmbedLoaderJs(req, res);
    }
    if (path === '/api/widgets/events') {
      return await handleWidgetEventTrack(req, res);
    }
    const widgetPublicMatch = path.match(/^\/api\/widgets\/public\/([^/]+)$/);
    if (widgetPublicMatch) {
      return await handlePublicWidgetConfig(req, res, decodeURIComponent(widgetPublicMatch[1]));
    }

    // Phase 3 — Newsletter & Email Campaign Studio
    if (path === '/api/campaigns/domains') {
      return await handleCampaignDomains(req, res);
    }
    if (path === '/api/campaigns/unsubscribe') {
      return await handleCampaignUnsubscribe(req, res);
    }
    if (path === '/api/cron/campaigns') {
      return await handleCronCampaigns(req, res);
    }

    const campaignTestMatch = path.match(/^\/api\/campaigns\/([^/]+)\/test$/);
    if (campaignTestMatch) {
      return await handleCampaignTestSend(req, res, decodeURIComponent(campaignTestMatch[1]));
    }

    const campaignSendMatch = path.match(/^\/api\/campaigns\/([^/]+)\/send$/);
    if (campaignSendMatch) {
      return await handleCampaignSend(req, res, decodeURIComponent(campaignSendMatch[1]));
    }

    return sendJson(res, 404, { ok: false, error: 'API endpoint not found.' });
  } catch (err) {
    if (!res.headersSent) {
      return sendJson(res, 500, {
        ok: false,
        error: typeof err?.message === 'string' && err.message.trim() ? err.message : 'Internal server error.',
      });
    }
  }
}
