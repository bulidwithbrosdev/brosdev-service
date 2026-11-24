import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  apiUsageLogs,
  forms,
  platformSettings,
  submissions,
  subscriptionPlans,
  subscriptions,
  subscriptionUsage,
  users,
} from '../../db/schema.ts';
import {
  escapeHtml,
  sanitizeSafeHttpUrl,
  verifyApiKeyHash,
} from '../crypto.ts';
import {
  ensurePlatformBootstrapped,
  getCurrentPeriodMonth,
  getUserUsageForMonth,
} from '../bootstrap.ts';
import { checkSlidingRateLimit } from '../rateLimit.ts';
import {
  applyResendWebhookEvent,
  getResendProviderConfig,
  renderAutoReplyHtml,
  renderSubmissionNotificationHtml,
  sendEmailViaResend,
  verifyResendWebhookSignature,
} from '../emailService.ts';
import { getClientIp } from '../../middleware/auth.ts';

export const publicRouter = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files: 5,
  },
});

function extractOriginDomain(req: Request): string {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return '';
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isDomainAllowed(originDomain: string, allowedDomains: string[]): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  if (!originDomain) return false;
  return allowedDomains.some((raw) => {
    const rule = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!rule) return false;
    if (rule === '*') return true;
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1); // .example.com
      return originDomain === rule.slice(2) || originDomain.endsWith(suffix);
    }
    return originDomain === rule;
  });
}

async function logApiUsage(entry: {
  userId?: number | null;
  formId?: number | null;
  endpoint: string;
  method: string;
  statusCode: number;
  isRateLimited?: boolean;
  isSuspicious?: boolean;
  ipAddress: string;
  originDomain: string;
  responseTimeMs: number;
  errorMessage?: string | null;
}) {
  try {
    await db.insert(apiUsageLogs).values({
      userId: entry.userId ?? null,
      formId: entry.formId ?? null,
      endpoint: entry.endpoint,
      method: entry.method,
      statusCode: entry.statusCode,
      isRateLimited: Boolean(entry.isRateLimited),
      isSuspicious: Boolean(entry.isSuspicious),
      ipAddress: entry.ipAddress,
      originDomain: entry.originDomain,
      responseTimeMs: entry.responseTimeMs,
      errorMessage: entry.errorMessage ?? null,
    });
  } catch (err) {
    console.error('Failed to log API usage:', err);
  }
}

// Public CORS preflight specifically for form submission endpoints
publicRouter.options('/submit/:formKey', (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-API-Key, Idempotency-Key, Accept'
  );
  res.status(204).end();
});

// Core public form submission handler (supports HTML forms, JS Fetch, REST API, multipart files)
publicRouter.post(
  '/submit/:formKey',
  (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      upload.any()(req, res, (err: any) => {
        if (err) {
          return res.status(400).json({ error: err.message || 'File upload limit exceeded' });
        }
        next();
      });
    } else {
      next();
    }
  },
  async (req: Request, res: Response) => {
    const startedAt = Date.now();
    const formKey = String(req.params.formKey || '').trim();
    const ipAddress = getClientIp(req);
    const originDomain = extractOriginDomain(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    const wantsJson =
      (req.headers.accept || '').includes('application/json') ||
      (req.headers['content-type'] || '').includes('application/json') ||
      Boolean(req.headers['x-api-key']) ||
      Boolean(req.headers.authorization);

    const respondError = async (
      statusCode: number,
      message: string,
      extra: {
        userId?: number | null;
        formId?: number | null;
        isRateLimited?: boolean;
        isSuspicious?: boolean;
        fieldErrors?: Record<string, string>;
      } = {}
    ) => {
      await logApiUsage({
        userId: extra.userId,
        formId: extra.formId,
        endpoint: `/submit/${formKey}`,
        method: 'POST',
        statusCode,
        isRateLimited: extra.isRateLimited,
        isSuspicious: extra.isSuspicious,
        ipAddress,
        originDomain,
        responseTimeMs: Date.now() - startedAt,
        errorMessage: message,
      });
      if (wantsJson) {
        return res.status(statusCode).json({
          ok: false,
          error: message,
          ...(extra.fieldErrors ? { fieldErrors: extra.fieldErrors } : {}),
        });
      }
      return res
        .status(statusCode)
        .type('html')
        .send(
          `<!doctype html><html><head><meta charset="utf-8"/><title>Submission Error</title></head><body style="font-family:system-ui,sans-serif;background:#f5f5f5;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;"><div style="max-width:480px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:32px;"><h1 style="margin:0 0 8px;font-size:20px;color:#A90706;">Submission could not be processed</h1><p style="margin:0;color:#444;line-height:1.5;">${escapeHtml(
            message
          )}</p></div></body></html>`
        );
    };

    try {
      await ensurePlatformBootstrapped();

      // 1. Global rate limit check
      const [globalLimitRow] = await db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, 'global_api_limits'))
        .limit(1);
      const globalLimits = (globalLimitRow?.value || {}) as {
        globalRequestsPerMin?: number;
        perIpRequestsPerMin?: number;
      };
      const ipRate = checkSlidingRateLimit(
        `ip:${ipAddress}`,
        Number(globalLimits.perIpRequestsPerMin || 120)
      );
      if (!ipRate.allowed) {
        res.setHeader('Retry-After', String(ipRate.resetInSeconds));
        return respondError(429, 'Too many requests from this IP address. Please try again shortly.', {
          isRateLimited: true,
          isSuspicious: true,
        });
      }

      // 2. Validate Form ID
      const [form] = await db.select().from(forms).where(eq(forms.formKey, formKey)).limit(1);
      if (!form) {
        return respondError(404, 'Form endpoint not found.');
      }
      if (form.status !== 'published') {
        return respondError(
          403,
          form.status === 'suspended'
            ? 'This form has been suspended by the platform administrator.'
            : 'This form is not currently accepting submissions.',
          { userId: form.userId, formId: form.id }
        );
      }

      // 3. Load customer, subscription, and plan
      const [owner] = await db.select().from(users).where(eq(users.id, form.userId)).limit(1);
      if (!owner || owner.status !== 'active') {
        return respondError(403, 'Form owner account is inactive or suspended.', {
          userId: form.userId,
          formId: form.id,
        });
      }

      const subRows = await db
        .select({
          subscription: subscriptions,
          plan: subscriptionPlans,
        })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.userId, owner.id))
        .limit(1);

      const activeSub = subRows[0];
      if (
        !activeSub ||
        (activeSub.subscription.status !== 'active' &&
          activeSub.subscription.status !== 'trialing')
      ) {
        return respondError(402, 'Form owner subscription is not active.', {
          userId: owner.id,
          formId: form.id,
        });
      }

      // 4. Allowed domains check (bypassed if valid server-side secret API key is supplied)
      const providedSecret =
        String(req.headers['x-api-key'] || '').trim() ||
        (req.headers.authorization?.startsWith('Bearer bdf_sk_')
          ? req.headers.authorization.slice('Bearer '.length).trim()
          : '');
      const hasValidSecret = Boolean(
        providedSecret && verifyApiKeyHash(providedSecret, form.secretApiKeyHash)
      );

      if (providedSecret && !hasValidSecret) {
        return respondError(401, 'Invalid form secret API key.', {
          userId: owner.id,
          formId: form.id,
          isSuspicious: true,
        });
      }
      if (form.spamProtection?.requireSecretKey && !hasValidSecret) {
        return respondError(401, 'This form requires a valid X-API-Key header for submissions.', {
          userId: owner.id,
          formId: form.id,
        });
      }
      if (!hasValidSecret && form.allowedDomains && form.allowedDomains.length > 0) {
        if (!isDomainAllowed(originDomain, form.allowedDomains)) {
          return respondError(
            403,
            `Origin domain "${originDomain || 'unknown'}" is not in this form's allowed domains list.`,
            { userId: owner.id, formId: form.id, isSuspicious: true }
          );
        }
      }

      // 5. Plan & Form rate limits
      const effectiveRateLimit = Math.min(
        owner.customRateLimit ?? activeSub.plan.maxApiRequestsPerMin,
        form.spamProtection?.rateLimitPerMin || activeSub.plan.maxApiRequestsPerMin
      );
      const formRate = checkSlidingRateLimit(`form:${form.id}`, effectiveRateLimit);
      if (!formRate.allowed) {
        res.setHeader('Retry-After', String(formRate.resetInSeconds));
        return respondError(429, 'Form submission rate limit exceeded. Please wait a moment.', {
          userId: owner.id,
          formId: form.id,
          isRateLimited: true,
        });
      }

      // 6. Check Monthly Usage Limits (server-enforced!)
      const periodMonth = getCurrentPeriodMonth();
      const usage = await getUserUsageForMonth(owner.id, periodMonth);
      const maxSubmissions = owner.customSubmissionLimit ?? activeSub.plan.maxSubmissionsPerMonth;
      if (usage && usage.submissionsCount >= maxSubmissions) {
        return respondError(
          429,
          'Monthly form submission quota reached for this account. Upgrade the plan to continue receiving submissions.',
          { userId: owner.id, formId: form.id, isRateLimited: true }
        );
      }

      // 7. Extract body & files
      const rawBody: Record<string, unknown> =
        req.body && typeof req.body === 'object' ? { ...req.body } : {};
      const uploadedFiles = Array.isArray((req as any).files)
        ? ((req as any).files as Express.Multer.File[])
        : [];
      const filesMeta = uploadedFiles.map((f) => ({
        field: f.fieldname,
        originalName: f.originalname,
        mimeType: f.mimetype,
        sizeBytes: f.size,
      }));
      const totalUploadBytes = filesMeta.reduce((acc, f) => acc + f.sizeBytes, 0);

      // 8. Honeypot spam protection
      if (form.spamProtection?.honeypotEnabled) {
        const hpField = form.spamProtection.honeypotField || '_gotcha';
        const hpValue = rawBody[hpField];
        if (hpValue !== undefined && String(hpValue).trim().length > 0) {
          await db.insert(submissions).values({
            formId: form.id,
            userId: owner.id,
            payload: { _spamBlocked: true, honeypotField: hpField },
            files: [],
            status: 'spam',
            emailDeliveryStatus: 'disabled',
            sourceIp: ipAddress,
            originDomain,
            userAgent,
          });
          await logApiUsage({
            userId: owner.id,
            formId: form.id,
            endpoint: `/submit/${formKey}`,
            method: 'POST',
            statusCode: 200,
            isSuspicious: true,
            ipAddress,
            originDomain,
            responseTimeMs: Date.now() - startedAt,
            errorMessage: 'Honeypot triggered',
          });
          if (wantsJson) {
            return res.status(200).json({ ok: true, message: form.successMessage });
          }
          return res.status(200).send(escapeHtml(form.successMessage));
        }
        delete rawBody[hpField];
      }

      // 9. Idempotency check
      const rawIdemKey =
        String(req.headers['idempotency-key'] || rawBody._idempotency_key || '').trim();
      delete rawBody._idempotency_key;
      const scopedIdemKey = rawIdemKey ? `sub:${form.id}:${rawIdemKey.slice(0, 128)}` : null;

      if (scopedIdemKey) {
        const existingSub = await db
          .select()
          .from(submissions)
          .where(eq(submissions.idempotencyKey, scopedIdemKey))
          .limit(1);
        if (existingSub[0]) {
          await logApiUsage({
            userId: owner.id,
            formId: form.id,
            endpoint: `/submit/${formKey}`,
            method: 'POST',
            statusCode: 200,
            ipAddress,
            originDomain,
            responseTimeMs: Date.now() - startedAt,
          });
          return res.status(200).json({
            ok: true,
            idempotentReplay: true,
            submissionId: existingSub[0].id,
            message: form.successMessage,
          });
        }
      }

      // 10. Validate Form Fields
      const fieldErrors: Record<string, string> = {};
      const cleanPayload: Record<string, unknown> = {};

      for (const field of form.fields || []) {
        if (field.type === 'submit' || field.type === 'heading' || field.type === 'divider') {
          continue;
        }
        const key = field.name || field.id;
        let val = rawBody[key];
        if (
          (val === undefined || val === null || val === '') &&
          field.defaultValue !== undefined &&
          field.defaultValue !== ''
        ) {
          val = field.defaultValue;
        }

        if (field.type === 'file') {
          const matchingFiles = filesMeta.filter((f) => f.field === key);
          if (field.required && matchingFiles.length === 0) {
            fieldErrors[key] = field.errorMessage || `${field.label} is required.`;
          } else if (matchingFiles.length > 0) {
            cleanPayload[key] = matchingFiles.map((f) => f.originalName).join(', ');
          }
          continue;
        }

        const strVal = Array.isArray(val) ? val.join(', ').trim() : String(val ?? '').trim();

        if (field.required && !strVal) {
          fieldErrors[key] = field.errorMessage || `${field.label} is required.`;
          continue;
        }

        if (strVal) {
          if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
            fieldErrors[key] = field.errorMessage || `Please enter a valid email for ${field.label}.`;
          }
          if (field.type === 'url' && !sanitizeSafeHttpUrl(strVal)) {
            fieldErrors[key] = field.errorMessage || `Please enter a valid http(s) URL for ${field.label}.`;
          }
          if (field.type === 'number') {
            const num = Number(strVal);
            if (Number.isNaN(num)) {
              fieldErrors[key] = field.errorMessage || `${field.label} must be a valid number.`;
            } else {
              if (field.validation?.min !== undefined && num < field.validation.min) {
                fieldErrors[key] = field.errorMessage || `${field.label} must be at least ${field.validation.min}.`;
              }
              if (field.validation?.max !== undefined && num > field.validation.max) {
                fieldErrors[key] = field.errorMessage || `${field.label} must be at most ${field.validation.max}.`;
              }
            }
          }
          if (field.validation?.minLength && strVal.length < field.validation.minLength) {
            fieldErrors[key] =
              field.errorMessage ||
              `${field.label} must be at least ${field.validation.minLength} characters.`;
          }
          if (field.validation?.maxLength && strVal.length > field.validation.maxLength) {
            fieldErrors[key] =
              field.errorMessage ||
              `${field.label} must be at most ${field.validation.maxLength} characters.`;
          }
          cleanPayload[key] = Array.isArray(val) ? val : strVal;
        }
      }

      // Preserve any additional custom fields submitted via API/HTML form
      for (const [k, v] of Object.entries(rawBody)) {
        if (!(k in cleanPayload) && !k.startsWith('_')) {
          cleanPayload[k] = v;
        }
      }

      if (Object.keys(fieldErrors).length > 0) {
        return respondError(422, 'Validation failed for one or more form fields.', {
          userId: owner.id,
          formId: form.id,
          fieldErrors,
        });
      }

      // 11. Store Submission
      const [createdSub] = await db
        .insert(submissions)
        .values({
          formId: form.id,
          userId: owner.id,
          idempotencyKey: scopedIdemKey,
          payload: cleanPayload,
          files: filesMeta,
          isRead: false,
          status: 'received',
          emailDeliveryStatus: form.emailConfig?.notificationsEnabled ? 'pending' : 'disabled',
          sourceIp: ipAddress,
          originDomain,
          userAgent,
        })
        .returning();

      // 12. Update Usage counters
      if (usage) {
        await db
          .update(subscriptionUsage)
          .set({
            submissionsCount: sql`${subscriptionUsage.submissionsCount} + 1`,
            apiRequestsCount: sql`${subscriptionUsage.apiRequestsCount} + 1`,
            storageBytes: sql`${subscriptionUsage.storageBytes} + ${totalUploadBytes}`,
            updatedAt: new Date(),
          })
          .where(eq(subscriptionUsage.id, usage.id));
      }

      // 13. Apply Email Routing via Global Resend Account
      const maxEmails = owner.customEmailLimit ?? activeSub.plan.maxEmailsPerMonth;
      const emailQuotaRemaining = Math.max(0, maxEmails - (usage?.emailsSentCount || 0));
      let aggregateEmailStatus: 'accepted' | 'failed' | 'disabled' = 'disabled';
      const resendMessageIds: string[] = [];

      if (form.emailConfig?.notificationsEnabled) {
        const { settings } = await getResendProviderConfig();
        const footer = settings?.defaultEmailFooter || 'Delivered securely via BrosDev Forms.';
        const removeBranding = Boolean(activeSub.plan.features?.removeBranding);

        const rawRecipients = (form.emailConfig.recipients || [])
          .map((r) => r.trim())
          .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));
        const recipients = activeSub.plan.features?.multipleRecipients
          ? rawRecipients
          : rawRecipients.slice(0, 1);

        if (recipients.length > 0 && emailQuotaRemaining > 0) {
          const replyToMapped = form.emailConfig.replyToField
            ? String(cleanPayload[form.emailConfig.replyToField] || '').trim()
            : '';

          const html = renderSubmissionNotificationHtml({
            formTitle: form.title,
            payload: cleanPayload,
            files: filesMeta,
            template: form.emailConfig.notificationTemplate,
            footer,
            removeBranding,
            submittedAt: new Date(createdSub.createdAt).toUTCString(),
          });

          const subject = (form.emailConfig.subject || `New submission: ${form.title}`).replace(
            /\{\{form_title\}\}/g,
            form.title
          );

          let anyAccepted = false;
          let anyFailed = false;

          for (let i = 0; i < recipients.length; i++) {
            const rcpt = recipients[i];
            const resSend = await sendEmailViaResend({
              userId: owner.id,
              formId: form.id,
              submissionId: createdSub.id,
              emailType: 'notification',
              to: rcpt,
              senderDisplayName: form.emailConfig.senderDisplayName,
              replyTo: replyToMapped || undefined,
              subject,
              html,
              idempotencyKey: `notif:${createdSub.id}:${i}`,
            });
            if (resSend.status === 'accepted') {
              anyAccepted = true;
              if (resSend.resendMessageId) resendMessageIds.push(resSend.resendMessageId);
            } else {
              anyFailed = true;
            }
          }

          aggregateEmailStatus = anyAccepted ? 'accepted' : anyFailed ? 'failed' : 'disabled';

          // Auto-reply to submitter if enabled
          if (form.emailConfig.confirmationEnabled && form.emailConfig.autoReplyEmailField) {
            const submitterEmail = String(
              cleanPayload[form.emailConfig.autoReplyEmailField] || ''
            ).trim();
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) {
              const autoHtml = renderAutoReplyHtml({
                formTitle: form.title,
                body: form.emailConfig.autoReplyBody,
                payload: cleanPayload,
                footer,
                removeBranding,
              });
              await sendEmailViaResend({
                userId: owner.id,
                formId: form.id,
                submissionId: createdSub.id,
                emailType: 'auto_reply',
                to: submitterEmail,
                senderDisplayName: form.emailConfig.senderDisplayName,
                subject: form.emailConfig.autoReplySubject || `We received your message — ${form.title}`,
                html: autoHtml,
                idempotencyKey: `autoreply:${createdSub.id}`,
              });
            }
          }
        } else if (emailQuotaRemaining <= 0) {
          aggregateEmailStatus = 'failed';
        }

        await db
          .update(submissions)
          .set({ emailDeliveryStatus: aggregateEmailStatus })
          .where(eq(submissions.id, createdSub.id));
      }

      // 14. Record API usage log
      await logApiUsage({
        userId: owner.id,
        formId: form.id,
        endpoint: `/submit/${formKey}`,
        method: 'POST',
        statusCode: 200,
        ipAddress,
        originDomain,
        responseTimeMs: Date.now() - startedAt,
      });

      const safeRedirect = sanitizeSafeHttpUrl(form.redirectUrl);

      if (wantsJson) {
        return res.status(200).json({
          ok: true,
          submissionId: createdSub.id,
          formId: form.formKey,
          message: form.successMessage,
          redirectUrl: safeRedirect || null,
          emailDeliveryStatus: aggregateEmailStatus,
          resendMessageIds,
        });
      }

      if (safeRedirect) {
        return res.redirect(303, safeRedirect);
      }

      return res
        .status(200)
        .type('html')
        .send(
          `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(
            form.title
          )}</title></head><body style="font-family:system-ui,sans-serif;background:#f5f5f5;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;"><div style="max-width:480px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:32px;"><div style="width:40px;height:40px;border-radius:8px;background:#A90706;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;margin-bottom:16px;">✓</div><h1 style="margin:0 0 8px;font-size:20px;color:#111;">Submission Received</h1><p style="margin:0;color:#444;line-height:1.6;">${escapeHtml(
            form.successMessage
          )}</p></div></body></html>`
        );
    } catch (err: any) {
      console.error('Submission pipeline error:', err);
      return respondError(500, 'Internal error processing form submission.');
    }
  }
);

// Embeddable JS widget script for any published form
publicRouter.get('/embed/:formKey.js', async (req: Request, res: Response) => {
  try {
    const formKey = String(req.params.formKey || '').trim();
    const [form] = await db.select().from(forms).where(eq(forms.formKey, formKey)).limit(1);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!form || form.status !== 'published') {
      return res
        .status(404)
        .send(`console.warn("BrosDev Forms: Form ${JSON.stringify(formKey)} is not published.");`);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const safeConfig = JSON.stringify({
      formKey: form.formKey,
      title: form.title,
      description: form.description,
      fields: form.fields,
      endpoint: `${baseUrl}/api/submit/${form.formKey}`,
      honeypotField: form.spamProtection?.honeypotEnabled
        ? form.spamProtection.honeypotField || '_gotcha'
        : null,
    });

    const script = `(function(){
  var cfg = ${safeConfig};
  var mount = document.getElementById('brosdev-form-' + cfg.formKey);
  if (!mount) return;
  var form = document.createElement('form');
  form.style.cssText = 'font-family:system-ui,-apple-system,sans-serif;max-width:560px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:24px;color:#111;';
  var h = document.createElement('h3');
  h.textContent = cfg.title;
  h.style.cssText = 'margin:0 0 6px;font-size:18px;font-weight:700;';
  form.appendChild(h);
  if (cfg.description) {
    var p = document.createElement('p');
    p.textContent = cfg.description;
    p.style.cssText = 'margin:0 0 18px;font-size:14px;color:#555;';
    form.appendChild(p);
  }
  if (cfg.honeypotField) {
    var hp = document.createElement('input');
    hp.type = 'text'; hp.name = cfg.honeypotField; hp.tabIndex = -1; hp.autocomplete = 'off';
    hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0;width:0;';
    form.appendChild(hp);
  }
  var hasSubmit = false;
  (cfg.fields || []).forEach(function(f){
    if (f.type === 'divider') {
      var hr = document.createElement('hr');
      hr.style.cssText = 'border:0;border-top:1px solid #e5e5e5;margin:16px 0;';
      form.appendChild(hr); return;
    }
    if (f.type === 'heading') {
      var sh = document.createElement('h4');
      sh.textContent = f.label;
      sh.style.cssText = 'margin:16px 0 8px;font-size:15px;font-weight:600;';
      form.appendChild(sh); return;
    }
    if (f.type === 'submit') {
      hasSubmit = true;
      var btn = document.createElement('button');
      btn.type = 'submit'; btn.textContent = f.label || 'Submit';
      btn.style.cssText = 'margin-top:12px;background:#A90706;color:#fff;border:none;border-radius:6px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;';
      form.appendChild(btn); return;
    }
    if (f.type === 'hidden') {
      var hi = document.createElement('input');
      hi.type = 'hidden'; hi.name = f.name; hi.value = f.defaultValue || '';
      form.appendChild(hi); return;
    }
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:14px;';
    var lbl = document.createElement('label');
    lbl.textContent = f.label + (f.required ? ' *' : '');
    lbl.style.cssText = 'display:block;font-size:13px;font-weight:600;margin-bottom:6px;';
    wrap.appendChild(lbl);
    var el;
    if (f.type === 'long_text') {
      el = document.createElement('textarea'); el.rows = 4;
    } else if (f.type === 'dropdown') {
      el = document.createElement('select');
      (f.options || []).forEach(function(opt){
        var o = document.createElement('option'); o.value = opt; o.textContent = opt; el.appendChild(o);
      });
    } else {
      el = document.createElement('input');
      el.type = f.type === 'short_text' ? 'text' : f.type === 'phone' ? 'tel' : f.type;
    }
    el.name = f.name;
    if (f.placeholder) el.placeholder = f.placeholder;
    if (f.required) el.required = true;
    if (f.defaultValue && el.type !== 'file') el.value = f.defaultValue;
    el.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #d4d4d4;border-radius:6px;padding:9px 12px;font-size:14px;';
    wrap.appendChild(el);
    form.appendChild(wrap);
  });
  if (!hasSubmit) {
    var defBtn = document.createElement('button');
    defBtn.type = 'submit'; defBtn.textContent = 'Submit';
    defBtn.style.cssText = 'margin-top:8px;background:#A90706;color:#fff;border:none;border-radius:6px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;';
    form.appendChild(defBtn);
  }
  var statusBox = document.createElement('div');
  statusBox.style.cssText = 'margin-top:12px;font-size:13px;';
  form.appendChild(statusBox);
  form.addEventListener('submit', function(e){
    e.preventDefault();
    statusBox.textContent = 'Submitting...';
    statusBox.style.color = '#555';
    var fd = new FormData(form);
    fetch(cfg.endpoint, { method: 'POST', headers: { 'Accept': 'application/json' }, body: fd })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(res){
        if (res.ok) {
          statusBox.textContent = res.data.message || 'Submitted successfully.';
          statusBox.style.color = '#16A34A';
          form.reset();
        } else {
          statusBox.textContent = res.data.error || 'Submission failed.';
          statusBox.style.color = '#A90706';
        }
      })
      .catch(function(){ statusBox.textContent = 'Network error. Please retry.'; statusBox.style.color = '#A90706'; });
  });
  mount.innerHTML = '';
  mount.appendChild(form);
})();`;

    return res.status(200).send(script);
  } catch (err) {
    console.error('Embed script error:', err);
    return res.status(500).send('console.error("BrosDev Forms embed error");');
  }
});

// Resend Webhook Receiver (Svix signature verified)
publicRouter.post('/webhooks/resend', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body || {});
    const valid = verifyResendWebhookSignature(
      rawBody,
      req.headers['svix-id'] as string | undefined,
      req.headers['svix-timestamp'] as string | undefined,
      req.headers['svix-signature'] as string | undefined
    );

    if (!valid) {
      return res.status(401).json({ error: 'Invalid or missing Resend webhook signature' });
    }

    const result = await applyResendWebhookEvent(req.body);
    return res.status(200).json({ received: true, ...result });
  } catch (err) {
    console.error('Resend webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

