import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  emailLogs,
  emailProviderSettings,
  forms,
  submissions,
  subscriptionUsage,
} from '../db/schema.ts';
import { decryptSecret, escapeHtml } from './crypto.ts';
import { ensurePlatformBootstrapped, getCurrentPeriodMonth, getUserUsageForMonth } from './bootstrap.ts';

export interface SendResendParams {
  userId: number;
  formId?: number | null;
  submissionId?: number | null;
  emailType: 'notification' | 'auto_reply' | 'test';
  to: string;
  senderDisplayName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
  retryEmailLogId?: number;
}

export async function getResendProviderConfig() {
  await ensurePlatformBootstrapped();
  const [row] = await db.select().from(emailProviderSettings).limit(1);
  const decryptedKey = decryptSecret(row?.apiKeyEncrypted) || process.env.RESEND_API_KEY?.trim() || null;
  return {
    settings: row,
    apiKey: decryptedKey,
  };
}

function buildVerifiedFromHeader(senderDisplayName: string | undefined, verifiedSenderEmail: string): string {
  const cleanName = (senderDisplayName || 'BrosDev Forms')
    .replace(/[\r\n<>"]/g, '')
    .trim()
    .slice(0, 80) || 'BrosDev Forms';
  return `${cleanName} <${verifiedSenderEmail}>`;
}

export function renderSubmissionNotificationHtml(params: {
  formTitle: string;
  payload: Record<string, unknown>;
  files: Array<{ field: string; originalName: string; mimeType: string; sizeBytes: number }>;
  template: string;
  footer: string;
  removeBranding: boolean;
  submittedAt: string;
}): string {
  const rowsHtml = Object.entries(params.payload)
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#111111;width:34%;vertical-align:top;font-size:13px;">${escapeHtml(k)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e5e5;color:#333333;font-size:13px;white-space:pre-wrap;">${escapeHtml(
          Array.isArray(v) ? v.join(', ') : v
        )}</td>
      </tr>`
    )
    .join('');

  const filesHtml =
    params.files.length > 0
      ? `<div style="margin-top:16px;padding:12px 14px;background:#f5f5f5;border:1px solid #e5e5e5;border-radius:6px;font-size:12px;color:#333333;">
          <strong>Attachments (${params.files.length}):</strong><br/>
          ${params.files
            .map(
              (f) =>
                `${escapeHtml(f.originalName)} (${escapeHtml(f.mimeType)}, ${(f.sizeBytes / 1024).toFixed(1)} KB)`
            )
            .join('<br/>')}
        </div>`
      : '';

  const submissionTable = `
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;margin:16px 0;">
      <tbody>${rowsHtml || '<tr><td style="padding:12px;color:#666;">No field values provided.</td></tr>'}</tbody>
    </table>
    ${filesHtml}
  `;

  let bodyText = escapeHtml(
    params.template ||
      'You received a new submission on {{form_title}}.\n\n{{submission_table}}'
  ).replace(/\n/g, '<br/>');

  bodyText = bodyText
    .replace(/\{\{form_title\}\}/g, `<strong>${escapeHtml(params.formTitle)}</strong>`)
    .replace(/\{\{submitted_at\}\}/g, escapeHtml(params.submittedAt))
    .replace(/\{\{submission_table\}\}/g, submissionTable);

  // Replace individual field tokens like {{email}} or {{name}}
  for (const [k, v] of Object.entries(params.payload)) {
    const token = new RegExp(`\\{\\{${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
    bodyText = bodyText.replace(token, escapeHtml(Array.isArray(v) ? v.join(', ') : v));
  }

  const footerBlock = params.removeBranding
    ? ''
    : `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#737373;">
        ${escapeHtml(params.footer)}
      </div>`;

  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #e5e5e5;background:#ffffff;">
          <div style="font-size:16px;font-weight:700;color:#111111;">${escapeHtml(params.formTitle)}</div>
          <div style="font-size:12px;color:#737373;margin-top:4px;">Received ${escapeHtml(params.submittedAt)}</div>
        </div>
        <div style="padding:24px;font-size:14px;line-height:1.6;color:#222222;">
          ${bodyText}
          ${footerBlock}
        </div>
      </div>
    </body>
  </html>`;
}

export function renderAutoReplyHtml(params: {
  formTitle: string;
  body: string;
  payload: Record<string, unknown>;
  footer: string;
  removeBranding: boolean;
}): string {
  let rendered = escapeHtml(params.body || 'Thank you for contacting us. We have received your message.').replace(
    /\n/g,
    '<br/>'
  );
  rendered = rendered.replace(/\{\{form_title\}\}/g, escapeHtml(params.formTitle));
  for (const [k, v] of Object.entries(params.payload)) {
    const token = new RegExp(`\\{\\{${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
    rendered = rendered.replace(token, escapeHtml(Array.isArray(v) ? v.join(', ') : v));
  }

  const footerBlock = params.removeBranding
    ? ''
    : `<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;color:#737373;">${escapeHtml(
        params.footer
      )}</div>`;

  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;padding:24px;font-size:14px;line-height:1.6;">
        ${rendered}
        ${footerBlock}
      </div>
    </body>
  </html>`;
}

export async function sendEmailViaResend(params: SendResendParams): Promise<{
  emailLogId: number;
  status: 'accepted' | 'failed';
  resendMessageId?: string;
  error?: string;
}> {
  const { settings, apiKey } = await getResendProviderConfig();
  const verifiedSender = settings?.defaultSenderEmail || 'forms@brosdev.xyz';
  const fromHeader = buildVerifiedFromHeader(
    params.senderDisplayName || settings?.defaultSenderName,
    verifiedSender
  );

  // Check idempotency if not a retry
  if (params.idempotencyKey && !params.retryEmailLogId) {
    const existing = await db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.idempotencyKey, params.idempotencyKey))
      .limit(1);
    if (existing[0]) {
      return {
        emailLogId: existing[0].id,
        status: existing[0].status === 'failed' ? 'failed' : 'accepted',
        resendMessageId: existing[0].resendMessageId || undefined,
      };
    }
  }

  let logId = params.retryEmailLogId;
  if (!logId) {
    const [createdLog] = await db
      .insert(emailLogs)
      .values({
        userId: params.userId,
        formId: params.formId ?? null,
        submissionId: params.submissionId ?? null,
        emailType: params.emailType,
        recipientEmail: params.to,
        senderEmail: fromHeader,
        subject: params.subject,
        status: 'pending',
        idempotencyKey: params.idempotencyKey || null,
      })
      .returning();
    logId = createdLog.id;
  }

  if (!settings?.globalNotificationsEnabled && params.emailType !== 'test') {
    const errMsg = 'Global email delivery is currently paused by the platform administrator.';
    await db
      .update(emailLogs)
      .set({ status: 'failed', errorDetails: errMsg, updatedAt: new Date() })
      .where(eq(emailLogs.id, logId));
    return { emailLogId: logId, status: 'failed', error: errMsg };
  }

  if (!apiKey) {
    const errMsg =
      'Resend API key is not configured. Configure it in Super Admin -> Resend Configuration.';
    await db
      .update(emailLogs)
      .set({ status: 'failed', errorDetails: errMsg, updatedAt: new Date() })
      .where(eq(emailLogs.id, logId));
    if (settings) {
      await db
        .update(emailProviderSettings)
        .set({ connectionStatus: 'unconfigured', lastError: errMsg, updatedAt: new Date() })
        .where(eq(emailProviderSettings.id, settings.id));
    }
    return { emailLogId: logId, status: 'failed', error: errMsg };
  }

  try {
    const resendPayload: Record<string, unknown> = {
      from: fromHeader,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    };

    if (params.replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.replyTo.trim())) {
      resendPayload.reply_to = params.replyTo.trim();
    } else if (settings?.defaultReplyTo) {
      resendPayload.reply_to = settings.defaultReplyTo;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(resendPayload),
    });

    // Capture Resend API rate-limit headers where available
    const rlLimit = parseInt(response.headers.get('ratelimit-limit') || '', 10);
    const rlRemaining = parseInt(response.headers.get('ratelimit-remaining') || '', 10);
    const rlReset = parseInt(response.headers.get('ratelimit-reset') || '', 10);

    if (settings && (!Number.isNaN(rlLimit) || !Number.isNaN(rlRemaining))) {
      await db
        .update(emailProviderSettings)
        .set({
          rateLimitLimit: Number.isNaN(rlLimit) ? settings.rateLimitLimit : rlLimit,
          rateLimitRemaining: Number.isNaN(rlRemaining) ? settings.rateLimitRemaining : rlRemaining,
          rateLimitResetAt: Number.isNaN(rlReset)
            ? settings.rateLimitResetAt
            : new Date(Date.now() + rlReset * 1000),
          updatedAt: new Date(),
        })
        .where(eq(emailProviderSettings.id, settings.id));
    }

    const bodyJson = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok || !bodyJson.id) {
      const errMsg = bodyJson.message || `Resend API error (HTTP ${response.status})`;
      const isDomainError =
        response.status === 403 &&
        (errMsg.toLowerCase().includes('domain') ||
          errMsg.toLowerCase().includes('not verified') ||
          bodyJson.name === 'validation_error');

      if (isDomainError && verifiedSender !== 'onboarding@resend.dev') {
        try {
          const fallbackRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...resendPayload,
              from: buildVerifiedFromHeader(
                params.senderDisplayName || settings?.defaultSenderName,
                'onboarding@resend.dev'
              ),
              reply_to: resendPayload.reply_to || verifiedSender,
            }),
          });
          const fallbackBody = (await fallbackRes.json().catch(() => ({}))) as { id?: string };
          if (fallbackRes.ok && fallbackBody?.id) {
            await db
              .update(emailLogs)
              .set({
                status: 'accepted',
                resendMessageId: fallbackBody.id,
                errorDetails: `Delivered via onboarding@resend.dev (domain "${verifiedSender.split('@')[1] || ''}" requires verification in Resend).`,
                retryCount: params.retryEmailLogId ? sql`${emailLogs.retryCount} + 1` : 0,
                updatedAt: new Date(),
              })
              .where(eq(emailLogs.id, logId));

            if (settings) {
              await db
                .update(emailProviderSettings)
                .set({ connectionStatus: 'connected', lastError: null, updatedAt: new Date() })
                .where(eq(emailProviderSettings.id, settings.id));
            }

            return {
              emailLogId: logId,
              status: 'accepted',
              resendMessageId: fallbackBody.id,
            };
          }
        } catch {
          // Fall through to failure handling
        }
      }

      await db
        .update(emailLogs)
        .set({
          status: 'failed',
          errorDetails: errMsg,
          retryCount: params.retryEmailLogId ? sql`${emailLogs.retryCount} + 1` : 0,
          updatedAt: new Date(),
        })
        .where(eq(emailLogs.id, logId));

      if (settings) {
        await db
          .update(emailProviderSettings)
          .set({ lastError: errMsg, updatedAt: new Date() })
          .where(eq(emailProviderSettings.id, settings.id));
      }
      return { emailLogId: logId, status: 'failed', error: errMsg };
    }

    // Important: Mark as 'accepted', NEVER 'delivered', until Resend webhook confirms delivery!
    await db
      .update(emailLogs)
      .set({
        status: 'accepted',
        resendMessageId: bodyJson.id,
        errorDetails: null,
        retryCount: params.retryEmailLogId ? sql`${emailLogs.retryCount} + 1` : 0,
        updatedAt: new Date(),
      })
      .where(eq(emailLogs.id, logId));

    if (settings) {
      await db
        .update(emailProviderSettings)
        .set({ connectionStatus: 'connected', lastError: null, updatedAt: new Date() })
        .where(eq(emailProviderSettings.id, settings.id));
    }

    // Increment user monthly email usage
    if (params.emailType !== 'test') {
      const usageRow = await getUserUsageForMonth(params.userId, getCurrentPeriodMonth());
      if (usageRow) {
        await db
          .update(subscriptionUsage)
          .set({
            emailsSentCount: sql`${subscriptionUsage.emailsSentCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(subscriptionUsage.id, usageRow.id));
      }
    }

    return {
      emailLogId: logId,
      status: 'accepted',
      resendMessageId: bodyJson.id,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Network failure connecting to Resend API';
    await db
      .update(emailLogs)
      .set({
        status: 'failed',
        errorDetails: errMsg,
        retryCount: params.retryEmailLogId ? sql`${emailLogs.retryCount} + 1` : 0,
        updatedAt: new Date(),
      })
      .where(eq(emailLogs.id, logId));
    return { emailLogId: logId, status: 'failed', error: errMsg };
  }
}

export async function testResendApiConnection(): Promise<{
  ok: boolean;
  status: 'connected' | 'error' | 'unconfigured';
  message: string;
  domainVerified: boolean;
  domains: Array<{ name: string; status: string }>;
}> {
  const { settings, apiKey } = await getResendProviderConfig();
  if (!apiKey) {
    if (settings) {
      await db
        .update(emailProviderSettings)
        .set({
          connectionStatus: 'unconfigured',
          lastTestedAt: new Date(),
          lastError: 'Resend API key is not configured.',
          updatedAt: new Date(),
        })
        .where(eq(emailProviderSettings.id, settings.id));
    }
    return {
      ok: false,
      status: 'unconfigured',
      message: 'No Resend API key configured. Save a valid Resend API key first.',
      domainVerified: false,
      domains: [],
    };
  }

  try {
    const response = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = (await response.json().catch(() => ({}))) as {
      data?: Array<{ name: string; status: string }>;
      message?: string;
    };

    const rlLimit = parseInt(response.headers.get('ratelimit-limit') || '', 10);
    const rlRemaining = parseInt(response.headers.get('ratelimit-remaining') || '', 10);

    if (!response.ok) {
      const errMsg = data.message || `Resend authentication failed (HTTP ${response.status})`;
      if (settings) {
        await db
          .update(emailProviderSettings)
          .set({
            connectionStatus: 'error',
            lastTestedAt: new Date(),
            lastError: errMsg,
            updatedAt: new Date(),
          })
          .where(eq(emailProviderSettings.id, settings.id));
      }
      return { ok: false, status: 'error', message: errMsg, domainVerified: false, domains: [] };
    }

    const domains = Array.isArray(data.data) ? data.data : [];
    const targetDomain = (settings?.sendingDomain || '').toLowerCase();
    const matchedDomain = domains.find((d) => d.name.toLowerCase() === targetDomain);
    const domainVerified = matchedDomain?.status === 'verified';

    if (settings) {
      await db
        .update(emailProviderSettings)
        .set({
          connectionStatus: 'connected',
          lastTestedAt: new Date(),
          lastError: null,
          rateLimitLimit: Number.isNaN(rlLimit) ? settings.rateLimitLimit : rlLimit,
          rateLimitRemaining: Number.isNaN(rlRemaining) ? settings.rateLimitRemaining : rlRemaining,
          updatedAt: new Date(),
        })
        .where(eq(emailProviderSettings.id, settings.id));
    }

    return {
      ok: true,
      status: 'connected',
      message: domainVerified
        ? `Connected to Resend. Sending domain "${targetDomain}" is verified.`
        : `Connected to Resend (${domains.length} domain(s) found). Verify "${targetDomain}" in Resend for production sending.`,
      domainVerified,
      domains: domains.map((d) => ({ name: d.name, status: d.status })),
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Failed to reach Resend API.';
    if (settings) {
      await db
        .update(emailProviderSettings)
        .set({
          connectionStatus: 'error',
          lastTestedAt: new Date(),
          lastError: errMsg,
          updatedAt: new Date(),
        })
        .where(eq(emailProviderSettings.id, settings.id));
    }
    return { ok: false, status: 'error', message: errMsg, domainVerified: false, domains: [] };
  }
}

export function verifyResendWebhookSignature(
  rawBody: string,
  svixId: string | undefined,
  svixTimestamp: string | undefined,
  svixSignature: string | undefined
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  const timestampSec = parseInt(svixTimestamp, 10);
  if (Number.isNaN(timestampSec) || Math.abs(Date.now() / 1000 - timestampSec) > 300) {
    return false;
  }

  const secretKey = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac('sha256', secretKey)
    .update(signedPayload)
    .digest('base64');

  const candidates = svixSignature.split(' ').map((part) => {
    const [, sig] = part.split(',');
    return sig || part;
  });

  return candidates.some((cand) => {
    const a = Buffer.from(cand);
    const b = Buffer.from(expectedSig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function applyResendWebhookEvent(event: {
  type: string;
  data?: { email_id?: string; bounce?: { message?: string } };
}) {
  const resendId = event.data?.email_id;
  if (!resendId) return { updated: false };

  let mappedStatus: 'delivered' | 'bounced' | 'failed' | 'accepted' | null = null;
  let errorDetails: string | null = null;

  switch (event.type) {
    case 'email.delivered':
      mappedStatus = 'delivered';
      break;
    case 'email.bounced':
    case 'email.complained':
      mappedStatus = 'bounced';
      errorDetails = event.data?.bounce?.message || `Resend event: ${event.type}`;
      break;
    case 'email.delivery_delayed':
      mappedStatus = 'accepted';
      errorDetails = 'Delivery delayed by recipient mail server';
      break;
    case 'email.failed':
      mappedStatus = 'failed';
      errorDetails = 'Resend reported delivery failure';
      break;
    default:
      return { updated: false };
  }

  const [updatedLog] = await db
    .update(emailLogs)
    .set({
      status: mappedStatus,
      errorDetails: errorDetails ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(emailLogs.resendMessageId, resendId))
    .returning();

  if (updatedLog?.submissionId && updatedLog.emailType === 'notification') {
    await db
      .update(submissions)
      .set({ emailDeliveryStatus: mappedStatus })
      .where(eq(submissions.id, updatedLog.submissionId));
  }

  return { updated: Boolean(updatedLog), status: mappedStatus };
}

export async function retryFailedEmailLog(emailLogId: number, requesterUserId?: number) {
  const [log] = await db.select().from(emailLogs).where(eq(emailLogs.id, emailLogId)).limit(1);
  if (!log) throw new Error('Email log not found');
  if (requesterUserId && log.userId !== requesterUserId) {
    throw new Error('Forbidden');
  }
  if (log.status !== 'failed' && log.status !== 'bounced') {
    throw new Error('Only failed or bounced emails are eligible for retry');
  }

  let html = `<p>Retried notification email for subject: ${escapeHtml(log.subject)}</p>`;
  let senderDisplayName = 'BrosDev Forms';
  let replyTo: string | undefined;

  if (log.submissionId && log.formId) {
    const [sub] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, log.submissionId))
      .limit(1);
    const [form] = await db.select().from(forms).where(eq(forms.id, log.formId)).limit(1);
    const { settings } = await getResendProviderConfig();

    if (sub && form) {
      senderDisplayName = form.emailConfig.senderDisplayName || settings?.defaultSenderName || 'BrosDev Forms';
      const mappedReply = form.emailConfig.replyToField
        ? String(sub.payload[form.emailConfig.replyToField] || '')
        : '';
      replyTo = mappedReply || undefined;

      html =
        log.emailType === 'auto_reply'
          ? renderAutoReplyHtml({
              formTitle: form.title,
              body: form.emailConfig.autoReplyBody,
              payload: sub.payload,
              footer: settings?.defaultEmailFooter || 'Delivered securely via BrosDev Forms.',
              removeBranding: false,
            })
          : renderSubmissionNotificationHtml({
              formTitle: form.title,
              payload: sub.payload,
              files: sub.files || [],
              template: form.emailConfig.notificationTemplate,
              footer: settings?.defaultEmailFooter || 'Delivered securely via BrosDev Forms.',
              removeBranding: false,
              submittedAt: new Date(sub.createdAt).toISOString(),
            });
    }
  }

  const result = await sendEmailViaResend({
    userId: log.userId,
    formId: log.formId,
    submissionId: log.submissionId,
    emailType: log.emailType as 'notification' | 'auto_reply' | 'test',
    to: log.recipientEmail,
    senderDisplayName,
    replyTo,
    subject: log.subject,
    html,
    retryEmailLogId: log.id,
  });

  if (log.submissionId && log.emailType === 'notification') {
    await db
      .update(submissions)
      .set({ emailDeliveryStatus: result.status })
      .where(eq(submissions.id, log.submissionId));
  }

  return result;
}
