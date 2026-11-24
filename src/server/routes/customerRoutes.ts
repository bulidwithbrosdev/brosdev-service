import express, { Response } from 'express';
import { and, count, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  apiUsageLogs,
  emailLogs,
  emailProviderSettings,
  forms,
  invoices,
  payments,
  platformSettings,
  submissions,
  subscriptionPlans,
  subscriptions,
  subscriptionUsage,
  FormEmailConfig,
  FormFieldConfig,
  FormSpamConfig,
} from '../../db/schema.ts';
import { AuthRequest, isAdmin2faVerified, requireAuth } from '../../middleware/auth.ts';
import { getCurrentPeriodMonth, getUserUsageForMonth } from '../bootstrap.ts';
import {
  generateFormKey,
  generateFormSecretKey,
  sanitizeSafeHttpUrl,
} from '../crypto.ts';
import { retryFailedEmailLog } from '../emailService.ts';

export const customerRouter = express.Router();
customerRouter.use(requireAuth);

const formFieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'short_text',
    'long_text',
    'email',
    'phone',
    'number',
    'dropdown',
    'radio',
    'checkbox',
    'date',
    'file',
    'url',
    'hidden',
    'submit',
    'heading',
    'divider',
  ]),
  name: z.string().max(80),
  label: z.string().max(200),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().max(500).optional(),
  width: z.enum(['full', 'half']).optional(),
  options: z.array(z.string().max(200)).optional(),
  errorMessage: z.string().max(300).optional(),
  validation: z
    .object({
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().max(200).optional(),
    })
    .optional(),
});

const emailConfigSchema = z.object({
  notificationsEnabled: z.boolean(),
  recipients: z.array(z.string().email()).max(20),
  subject: z.string().min(1).max(200),
  senderDisplayName: z.string().min(1).max(80),
  replyToField: z.string().max(80),
  notificationTemplate: z.string().max(8000),
  confirmationEnabled: z.boolean(),
  autoReplyEmailField: z.string().max(80),
  autoReplySubject: z.string().max(200),
  autoReplyBody: z.string().max(5000),
});

const spamConfigSchema = z.object({
  honeypotEnabled: z.boolean(),
  honeypotField: z.string().min(1).max(60),
  rateLimitPerMin: z.number().int().min(1).max(1000),
  requireSecretKey: z.boolean(),
});

const createOrUpdateFormSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(1000).optional().default(''),
  fields: z.array(formFieldSchema).max(100).optional().default([]),
  status: z.enum(['draft', 'published', 'inactive']).optional().default('draft'),
  successMessage: z
    .string()
    .max(500)
    .optional()
    .default('Thank you! Your submission has been received.'),
  redirectUrl: z.string().max(500).optional().default(''),
  allowedDomains: z.array(z.string().max(200)).max(50).optional().default([]),
  spamProtection: spamConfigSchema.optional(),
  emailConfig: emailConfigSchema.optional(),
});

async function getUserSubscriptionContext(userId: number) {
  const rows = await db
    .select({
      subscription: subscriptions,
      plan: subscriptionPlans,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const usage = await getUserUsageForMonth(userId, getCurrentPeriodMonth());
  const [formCountRow] = await db
    .select({ total: count() })
    .from(forms)
    .where(eq(forms.userId, userId));

  return {
    subscription: rows[0]?.subscription || null,
    plan: rows[0]?.plan || null,
    usage,
    currentFormCount: Number(formCountRow?.total || 0),
  };
}

function defaultFields(): FormFieldConfig[] {
  return [
    {
      id: 'fld_name',
      type: 'short_text',
      name: 'name',
      label: 'Full Name',
      placeholder: 'Jane Doe',
      required: true,
      width: 'half',
    },
    {
      id: 'fld_email',
      type: 'email',
      name: 'email',
      label: 'Work Email',
      placeholder: 'jane@company.com',
      required: true,
      width: 'half',
    },
    {
      id: 'fld_message',
      type: 'long_text',
      name: 'message',
      label: 'Message',
      placeholder: 'How can we help your team?',
      required: true,
      width: 'full',
    },
    {
      id: 'fld_submit',
      type: 'submit',
      name: 'submit',
      label: 'Send Message',
      width: 'full',
    },
  ];
}

function defaultEmailConfig(userEmail: string, title: string): FormEmailConfig {
  return {
    notificationsEnabled: true,
    recipients: [userEmail],
    subject: `New submission: ${title}`,
    senderDisplayName: 'BrosDev Forms',
    replyToField: 'email',
    notificationTemplate:
      'You received a new submission on {{form_title}}.\n\n{{submission_table}}',
    confirmationEnabled: false,
    autoReplyEmailField: 'email',
    autoReplySubject: `We received your message — ${title}`,
    autoReplyBody:
      'Hi {{name}},\n\nThank you for reaching out via {{form_title}}. Our team has received your submission and will reply shortly.',
  };
}

// 1. Current user profile, plan, quotas, and admin role summary
customerRouter.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const subCtx = await getUserSubscriptionContext(user.id);
    const [emailSettings] = await db.select().from(emailProviderSettings).limit(1);
    const [generalRow] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, 'platform_general'))
      .limit(1);

    const maxForms = user.customFormLimit ?? subCtx.plan?.maxForms ?? 2;
    const maxSubmissions =
      user.customSubmissionLimit ?? subCtx.plan?.maxSubmissionsPerMonth ?? 100;
    const maxEmails = user.customEmailLimit ?? subCtx.plan?.maxEmailsPerMonth ?? 100;

    return res.json({
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoUrl: user.photoUrl,
        status: user.status,
        createdAt: user.createdAt,
      },
      subscription: subCtx.subscription,
      plan: subCtx.plan,
      usage: {
        ...(subCtx.usage || {
          submissionsCount: 0,
          emailsSentCount: 0,
          apiRequestsCount: 0,
          storageBytes: 0,
          periodMonth: getCurrentPeriodMonth(),
        }),
        formsCreated: subCtx.currentFormCount,
      },
      limits: {
        maxForms,
        maxSubmissions,
        maxEmails,
        maxApiRequestsPerMin: user.customRateLimit ?? subCtx.plan?.maxApiRequestsPerMin ?? 20,
        maxStorageMb: subCtx.plan?.maxStorageMb ?? 25,
      },
      platformEmailSender: {
        sendingDomain: emailSettings?.sendingDomain || 'brosdev.xyz',
        defaultSenderEmail: emailSettings?.defaultSenderEmail || 'forms@brosdev.xyz',
        defaultSenderName: emailSettings?.defaultSenderName || 'BrosDev Forms',
      },
      publicApiBaseUrl:
        String((generalRow?.value as any)?.publicApiBaseUrl || 'https://api.brosdev.xyz'),
      admin: req.adminContext
        ? {
            roleSlug: req.adminContext.roleSlug,
            roleName: req.adminContext.roleName,
            permissions: req.adminContext.permissions,
            totpEnabled: req.adminContext.totpEnabled,
            totpVerified:
              (req.authUid || req.firebaseUser?.uid)
                ? isAdmin2faVerified((req.authUid || req.firebaseUser?.uid)!)
                : false,
          }
        : null,
    });
  } catch (err) {
    console.error('GET /api/me failed:', err);
    return res.status(500).json({ error: 'Failed to load user workspace' });
  }
});

// 2. Customer Dashboard metrics & activity charts
customerRouter.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const subCtx = await getUserSubscriptionContext(userId);

    const [formsTotal] = await db
      .select({ total: count() })
      .from(forms)
      .where(eq(forms.userId, userId));

    const [submissionsTotal] = await db
      .select({ total: count() })
      .from(submissions)
      .where(eq(submissions.userId, userId));

    const [failedSubsTotal] = await db
      .select({ total: count() })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          or(
            eq(submissions.status, 'failed'),
            eq(submissions.emailDeliveryStatus, 'failed'),
            eq(submissions.emailDeliveryStatus, 'bounced')
          )
        )
      );

    const [emailsSentTotal] = await db
      .select({ total: count() })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.userId, userId),
          or(eq(emailLogs.status, 'accepted'), eq(emailLogs.status, 'delivered'))
        )
      );

    const [apiTotal] = await db
      .select({ total: count() })
      .from(apiUsageLogs)
      .where(eq(apiUsageLogs.userId, userId));

    const recentSubs = await db
      .select({
        id: submissions.id,
        formId: submissions.formId,
        formTitle: forms.title,
        formKey: forms.formKey,
        payload: submissions.payload,
        isRead: submissions.isRead,
        status: submissions.status,
        emailDeliveryStatus: submissions.emailDeliveryStatus,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .innerJoin(forms, eq(submissions.formId, forms.id))
      .where(eq(submissions.userId, userId))
      .orderBy(desc(submissions.createdAt))
      .limit(8);

    // Last 14 days activity series (real data from DB)
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const subRows = await db
      .select({ createdAt: submissions.createdAt })
      .from(submissions)
      .where(and(eq(submissions.userId, userId), gte(submissions.createdAt, since)));

    const apiRows = await db
      .select({ createdAt: apiUsageLogs.createdAt, statusCode: apiUsageLogs.statusCode })
      .from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.userId, userId), gte(apiUsageLogs.createdAt, since)));

    const emailRows = await db
      .select({ createdAt: emailLogs.createdAt, status: emailLogs.status })
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), gte(emailLogs.createdAt, since)));

    const daysMap = new Map<
      string,
      { date: string; submissions: number; apiRequests: number; emails: number }
    >();
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      daysMap.set(key, {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        submissions: 0,
        apiRequests: 0,
        emails: 0,
      });
    }
    for (const r of subRows) {
      const k = new Date(r.createdAt).toISOString().slice(0, 10);
      const item = daysMap.get(k);
      if (item) item.submissions += 1;
    }
    for (const r of apiRows) {
      const k = new Date(r.createdAt).toISOString().slice(0, 10);
      const item = daysMap.get(k);
      if (item) item.apiRequests += 1;
    }
    for (const r of emailRows) {
      const k = new Date(r.createdAt).toISOString().slice(0, 10);
      const item = daysMap.get(k);
      if (item && (r.status === 'accepted' || r.status === 'delivered')) item.emails += 1;
    }

    return res.json({
      stats: {
        totalForms: Number(formsTotal?.total || 0),
        totalSubmissions: Number(submissionsTotal?.total || 0),
        emailsSent: Number(emailsSentTotal?.total || 0),
        failedSubmissions: Number(failedSubsTotal?.total || 0),
        totalApiRequests: Number(apiTotal?.total || 0),
      },
      activitySeries: Array.from(daysMap.values()),
      recentSubmissions: recentSubs,
      usage: subCtx.usage,
      plan: subCtx.plan,
    });
  } catch (err) {
    console.error('GET /api/dashboard failed:', err);
    return res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});

// 3. Forms CRUD
customerRouter.get('/forms', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const userForms = await db
      .select()
      .from(forms)
      .where(eq(forms.userId, userId))
      .orderBy(desc(forms.updatedAt));

    const subCounts = await db
      .select({
        formId: submissions.formId,
        total: count(),
        unread: sql<number>`count(*) filter (where ${submissions.isRead} = false)`,
      })
      .from(submissions)
      .where(eq(submissions.userId, userId))
      .groupBy(submissions.formId);

    const countMap = new Map(subCounts.map((c) => [c.formId, c]));

    return res.json({
      forms: userForms.map((f) => ({
        ...f,
        secretApiKeyHash: undefined,
        submissionCount: Number(countMap.get(f.id)?.total || 0),
        unreadCount: Number(countMap.get(f.id)?.unread || 0),
      })),
    });
  } catch (err) {
    console.error('GET /api/forms failed:', err);
    return res.status(500).json({ error: 'Failed to load forms' });
  }
});

customerRouter.post('/forms', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const subCtx = await getUserSubscriptionContext(user.id);
    const maxForms = user.customFormLimit ?? subCtx.plan?.maxForms ?? 2;

    if (subCtx.currentFormCount >= maxForms) {
      return res.status(403).json({
        error: `Plan limit reached: your ${subCtx.plan?.name || 'current'} plan allows up to ${maxForms} forms. Upgrade to create more.`,
      });
    }

    const parsed = createOrUpdateFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid form configuration', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const formKey = generateFormKey();
    const secret = generateFormSecretKey();
    const fields = data.fields.length > 0 ? data.fields : defaultFields();
    const emailCfg = data.emailConfig || defaultEmailConfig(user.email, data.title);

    if (!subCtx.plan?.features?.multipleRecipients && emailCfg.recipients.length > 1) {
      emailCfg.recipients = emailCfg.recipients.slice(0, 1);
    }

    const safeRedirect = data.redirectUrl ? sanitizeSafeHttpUrl(data.redirectUrl) : '';
    if (data.redirectUrl && !safeRedirect) {
      return res.status(400).json({ error: 'Redirect URL must be a valid http:// or https:// URL.' });
    }

    const [created] = await db
      .insert(forms)
      .values({
        formKey,
        userId: user.id,
        title: data.title,
        description: data.description,
        fields,
        status: data.status,
        successMessage: data.successMessage,
        redirectUrl: safeRedirect,
        allowedDomains: data.allowedDomains,
        spamProtection: data.spamProtection || {
          honeypotEnabled: true,
          honeypotField: '_gotcha',
          rateLimitPerMin: 30,
          requireSecretKey: false,
        },
        secretApiKeyHash: secret.hash,
        secretApiKeyPrefix: secret.prefix,
        emailConfig: emailCfg,
      })
      .returning();

    return res.status(201).json({
      form: { ...created, secretApiKeyHash: undefined },
      newSecretApiKey: secret.rawKey,
    });
  } catch (err) {
    console.error('POST /api/forms failed:', err);
    return res.status(500).json({ error: 'Failed to create form' });
  }
});

customerRouter.get('/forms/:id', async (req: AuthRequest, res: Response) => {
  try {
    const formId = Number(req.params.id);
    if (!Number.isInteger(formId)) return res.status(400).json({ error: 'Invalid form ID' });

    const [form] = await db
      .select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, req.dbUser!.id)))
      .limit(1);

    if (!form) return res.status(404).json({ error: 'Form not found' });
    return res.json({ form: { ...form, secretApiKeyHash: undefined } });
  } catch (err) {
    console.error('GET /api/forms/:id failed:', err);
    return res.status(500).json({ error: 'Failed to load form' });
  }
});

customerRouter.put('/forms/:id', async (req: AuthRequest, res: Response) => {
  try {
    const formId = Number(req.params.id);
    if (!Number.isInteger(formId)) return res.status(400).json({ error: 'Invalid form ID' });

    const [existing] = await db
      .select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, req.dbUser!.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Form not found' });
    if (existing.status === 'suspended') {
      return res.status(403).json({
        error: 'This form is suspended by an administrator and cannot be modified.',
      });
    }

    const parsed = createOrUpdateFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid form data', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const subCtx = await getUserSubscriptionContext(req.dbUser!.id);
    const emailCfg = data.emailConfig || existing.emailConfig;

    if (!subCtx.plan?.features?.multipleRecipients && emailCfg.recipients.length > 1) {
      return res.status(403).json({
        error: 'Multiple email recipients require the Professional or Business plan.',
      });
    }

    const safeRedirect = data.redirectUrl ? sanitizeSafeHttpUrl(data.redirectUrl) : '';
    if (data.redirectUrl && !safeRedirect) {
      return res.status(400).json({ error: 'Redirect URL must be a valid http:// or https:// URL.' });
    }

    const [updated] = await db
      .update(forms)
      .set({
        title: data.title,
        description: data.description,
        fields: data.fields,
        status: data.status,
        successMessage: data.successMessage,
        redirectUrl: safeRedirect,
        allowedDomains: data.allowedDomains,
        spamProtection: data.spamProtection || existing.spamProtection,
        emailConfig: emailCfg,
        updatedAt: new Date(),
      })
      .where(eq(forms.id, formId))
      .returning();

    return res.json({ form: { ...updated, secretApiKeyHash: undefined } });
  } catch (err) {
    console.error('PUT /api/forms/:id failed:', err);
    return res.status(500).json({ error: 'Failed to update form' });
  }
});

customerRouter.post('/forms/:id/duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const formId = Number(req.params.id);
    if (!Number.isInteger(formId)) return res.status(400).json({ error: 'Invalid form ID' });

    const subCtx = await getUserSubscriptionContext(user.id);
    const maxForms = user.customFormLimit ?? subCtx.plan?.maxForms ?? 2;
    if (subCtx.currentFormCount >= maxForms) {
      return res.status(403).json({
        error: `Plan limit reached (${maxForms} forms). Upgrade to duplicate this form.`,
      });
    }

    const [existing] = await db
      .select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, user.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Form not found' });

    const secret = generateFormSecretKey();
    const [copy] = await db
      .insert(forms)
      .values({
        formKey: generateFormKey(),
        userId: user.id,
        title: `${existing.title} (Copy)`,
        description: existing.description,
        fields: existing.fields,
        status: 'draft',
        successMessage: existing.successMessage,
        redirectUrl: existing.redirectUrl,
        allowedDomains: existing.allowedDomains,
        spamProtection: existing.spamProtection,
        secretApiKeyHash: secret.hash,
        secretApiKeyPrefix: secret.prefix,
        emailConfig: existing.emailConfig,
      })
      .returning();

    return res.status(201).json({
      form: { ...copy, secretApiKeyHash: undefined },
      newSecretApiKey: secret.rawKey,
    });
  } catch (err) {
    console.error('POST /api/forms/:id/duplicate failed:', err);
    return res.status(500).json({ error: 'Failed to duplicate form' });
  }
});

customerRouter.post('/forms/:id/rotate-key', async (req: AuthRequest, res: Response) => {
  try {
    const formId = Number(req.params.id);
    if (!Number.isInteger(formId)) return res.status(400).json({ error: 'Invalid form ID' });

    const [existing] = await db
      .select()
      .from(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, req.dbUser!.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Form not found' });

    const secret = generateFormSecretKey();
    const [updated] = await db
      .update(forms)
      .set({
        secretApiKeyHash: secret.hash,
        secretApiKeyPrefix: secret.prefix,
        updatedAt: new Date(),
      })
      .where(eq(forms.id, formId))
      .returning();

    return res.json({
      form: { ...updated, secretApiKeyHash: undefined },
      newSecretApiKey: secret.rawKey,
    });
  } catch (err) {
    console.error('POST /api/forms/:id/rotate-key failed:', err);
    return res.status(500).json({ error: 'Failed to rotate secret API key' });
  }
});

customerRouter.delete('/forms/:id', async (req: AuthRequest, res: Response) => {
  try {
    const formId = Number(req.params.id);
    if (!Number.isInteger(formId)) return res.status(400).json({ error: 'Invalid form ID' });

    const deleted = await db
      .delete(forms)
      .where(and(eq(forms.id, formId), eq(forms.userId, req.dbUser!.id)))
      .returning();

    if (deleted.length === 0) return res.status(404).json({ error: 'Form not found' });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/forms/:id failed:', err);
    return res.status(500).json({ error: 'Failed to delete form' });
  }
});

// 4. Submissions Management
customerRouter.get('/submissions', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const formIdParam = req.query.formId ? Number(req.query.formId) : undefined;
    const search = String(req.query.q || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const deliveryStatus = String(req.query.deliveryStatus || '').trim();

    const conditions = [eq(submissions.userId, userId)];
    if (formIdParam && Number.isInteger(formIdParam)) {
      conditions.push(eq(submissions.formId, formIdParam));
    }
    if (deliveryStatus) {
      conditions.push(eq(submissions.emailDeliveryStatus, deliveryStatus));
    }
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        conditions.push(gte(submissions.createdAt, fromDate));
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(submissions.createdAt, toDate));
      }
    }
    if (search) {
      conditions.push(
        or(
          sql`${submissions.payload}::text ilike ${`%${search}%`}`,
          ilike(forms.title, `%${search}%`)
        )!
      );
    }

    const rows = await db
      .select({
        id: submissions.id,
        formId: submissions.formId,
        formTitle: forms.title,
        formKey: forms.formKey,
        payload: submissions.payload,
        files: submissions.files,
        isRead: submissions.isRead,
        status: submissions.status,
        emailDeliveryStatus: submissions.emailDeliveryStatus,
        sourceIp: submissions.sourceIp,
        originDomain: submissions.originDomain,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .innerJoin(forms, eq(submissions.formId, forms.id))
      .where(and(...conditions))
      .orderBy(desc(submissions.createdAt))
      .limit(200);

    return res.json({ submissions: rows });
  } catch (err) {
    console.error('GET /api/submissions failed:', err);
    return res.status(500).json({ error: 'Failed to load submissions' });
  }
});

customerRouter.patch('/submissions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const subId = Number(req.params.id);
    if (!Number.isInteger(subId)) return res.status(400).json({ error: 'Invalid submission ID' });

    const isRead = Boolean(req.body.isRead);
    const [updated] = await db
      .update(submissions)
      .set({ isRead })
      .where(and(eq(submissions.id, subId), eq(submissions.userId, req.dbUser!.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.json({ submission: updated });
  } catch (err) {
    console.error('PATCH /api/submissions/:id failed:', err);
    return res.status(500).json({ error: 'Failed to update submission' });
  }
});

customerRouter.delete('/submissions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const subId = Number(req.params.id);
    if (!Number.isInteger(subId)) return res.status(400).json({ error: 'Invalid submission ID' });

    const deleted = await db
      .delete(submissions)
      .where(and(eq(submissions.id, subId), eq(submissions.userId, req.dbUser!.id)))
      .returning();

    if (deleted.length === 0) return res.status(404).json({ error: 'Submission not found' });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/submissions/:id failed:', err);
    return res.status(500).json({ error: 'Failed to delete submission' });
  }
});

customerRouter.post('/submissions/:id/retry-email', async (req: AuthRequest, res: Response) => {
  try {
    const subId = Number(req.params.id);
    if (!Number.isInteger(subId)) return res.status(400).json({ error: 'Invalid submission ID' });

    const logs = await db
      .select()
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.submissionId, subId),
          eq(emailLogs.userId, req.dbUser!.id),
          or(eq(emailLogs.status, 'failed'), eq(emailLogs.status, 'bounced'))
        )
      )
      .orderBy(desc(emailLogs.createdAt))
      .limit(5);

    if (logs.length === 0) {
      return res.status(400).json({ error: 'No failed email delivery found for this submission.' });
    }

    const results = [];
    for (const log of logs) {
      results.push(await retryFailedEmailLog(log.id, req.dbUser!.id));
    }

    return res.json({ retried: results.length, results });
  } catch (err: any) {
    console.error('POST /api/submissions/:id/retry-email failed:', err);
    return res.status(400).json({ error: err.message || 'Retry failed' });
  }
});

function escapeCsvCell(val: unknown): string {
  let str = String(val ?? '');
  // Neutralize spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

customerRouter.get('/submissions/export', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const formIdParam = req.query.formId ? Number(req.query.formId) : undefined;

    const conditions = [eq(submissions.userId, userId)];
    if (formIdParam && Number.isInteger(formIdParam)) {
      conditions.push(eq(submissions.formId, formIdParam));
    }

    const rows = await db
      .select({
        id: submissions.id,
        formTitle: forms.title,
        status: submissions.status,
        emailDeliveryStatus: submissions.emailDeliveryStatus,
        createdAt: submissions.createdAt,
        payload: submissions.payload,
      })
      .from(submissions)
      .innerJoin(forms, eq(submissions.formId, forms.id))
      .where(and(...conditions))
      .orderBy(desc(submissions.createdAt))
      .limit(2000);

    const dynamicKeys = new Set<string>();
    for (const r of rows) {
      Object.keys(r.payload || {}).forEach((k) => dynamicKeys.add(k));
    }
    const fieldCols = Array.from(dynamicKeys);
    const headers = ['Submission ID', 'Form', 'Status', 'Email Delivery', 'Timestamp', ...fieldCols];

    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) =>
        [
          r.id,
          r.formTitle,
          r.status,
          r.emailDeliveryStatus,
          new Date(r.createdAt).toISOString(),
          ...fieldCols.map((k) => {
            const v = (r.payload || {})[k];
            return Array.isArray(v) ? v.join('; ') : v ?? '';
          }),
        ]
          .map(escapeCsvCell)
          .join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="brosdev-forms-submissions.csv"');
    return res.send(lines.join('\r\n'));
  } catch (err) {
    console.error('GET /api/submissions/export failed:', err);
    return res.status(500).json({ error: 'CSV export failed' });
  }
});

// 5. Customer Billing & Usage view
customerRouter.get('/billing', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const subCtx = await getUserSubscriptionContext(userId);
    const activePlans = await db
      .select()
      .from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.isActive, true), eq(subscriptionPlans.isArchived, false)))
      .orderBy(subscriptionPlans.sortOrder);

    const userPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(25);

    const userInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.issuedAt))
      .limit(25);

    return res.json({
      subscription: subCtx.subscription,
      currentPlan: subCtx.plan,
      usage: subCtx.usage,
      currentFormCount: subCtx.currentFormCount,
      plans: activePlans,
      payments: userPayments,
      invoices: userInvoices,
      gateway: {
        name: 'BrosDev Pay',
        enabled: true,
        currency: 'USD',
      },
    });
  } catch (err) {
    console.error('GET /api/billing failed:', err);
    return res.status(500).json({ error: 'Failed to load billing details' });
  }
});

function passesLuhnCheck(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectCardBrand(digits: string): string {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  return 'Card';
}

const brosdevPayCheckoutSchema = z.object({
  planId: z.number().int().positive(),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  cardholderName: z.string().min(2).max(120).optional(),
  cardNumber: z.string().optional(),
  expiryMonth: z.string().optional(),
  expiryYear: z.string().optional(),
  cvc: z.string().optional(),
  billingZip: z.string().max(20).optional(),
});

customerRouter.post('/billing/brosdev-pay/checkout', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const parsed = brosdevPayCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid checkout details.' });
    }

    const { planId, billingCycle, cardholderName, cardNumber, expiryMonth, expiryYear, cvc, billingZip } =
      parsed.data;

    const [targetPlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.id, planId),
          eq(subscriptionPlans.isActive, true),
          eq(subscriptionPlans.isArchived, false)
        )
      )
      .limit(1);

    if (!targetPlan) return res.status(404).json({ error: 'Selected plan is unavailable.' });

    const priceCents =
      billingCycle === 'yearly' ? targetPlan.yearlyPriceCents : targetPlan.monthlyPriceCents;

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Free plan switch requires no card charge
    if (priceCents === 0) {
      const [updated] = await db
        .update(subscriptions)
        .set({
          planId: targetPlan.id,
          status: 'active',
          billingCycle,
          provider: 'brosdev_pay',
          cancelAtPeriodEnd: false,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.userId, userId))
        .returning();
      return res.json({
        approved: true,
        message: `Switched to ${targetPlan.name} plan.`,
        subscription: updated,
      });
    }

    // Paid plan checkout via BrosDev Pay
    const digits = String(cardNumber || '').replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !passesLuhnCheck(digits)) {
      return res.status(400).json({ error: 'Please enter a valid credit or debit card number.' });
    }

    const expM = parseInt(String(expiryMonth || ''), 10);
    const rawY = String(expiryYear || '').trim();
    const expY = rawY.length === 2 ? 2000 + parseInt(rawY, 10) : parseInt(rawY, 10);
    if (
      Number.isNaN(expM) ||
      expM < 1 ||
      expM > 12 ||
      Number.isNaN(expY) ||
      expY < now.getUTCFullYear() ||
      (expY === now.getUTCFullYear() && expM < now.getUTCMonth() + 1)
    ) {
      return res.status(400).json({ error: 'Card expiration date is invalid or expired.' });
    }

    const cleanCvc = String(cvc || '').replace(/\D/g, '');
    if (cleanCvc.length < 3 || cleanCvc.length > 4) {
      return res.status(400).json({ error: 'Please enter a valid 3 or 4 digit security code.' });
    }

    const cardBrand = detectCardBrand(digits);
    const last4 = digits.slice(-4);
    const txnRef = `bdp_txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Deterministic server-side decline rules for testing payment error states
    const declineMap: Record<string, string> = {
      '4000000000009995': 'Card declined: insufficient funds.',
      '4000000000000002': 'Card declined by issuing bank.',
      '4000000000000069': 'Card declined: card has expired.',
      '4000000000000127': 'Card declined: security code verification failed.',
    };

    if (declineMap[digits]) {
      await db.insert(payments).values({
        userId,
        provider: 'brosdev_pay',
        providerPaymentId: txnRef,
        amountCents: priceCents,
        currency: 'USD',
        status: 'failed',
        refundStatus: 'none',
        metadata: {
          planId: targetPlan.id,
          planName: targetPlan.name,
          billingCycle,
          cardBrand,
          last4,
          declineReason: declineMap[digits],
        },
      });
      return res.status(402).json({ error: declineMap[digits], transactionId: txnRef });
    }

    // Approved transaction: activate subscription, record payment, issue invoice
    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: targetPlan.id,
        status: 'active',
        billingCycle,
        provider: 'brosdev_pay',
        providerSubscriptionId: `bdp_sub_${userId}_${targetPlan.id}`,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          planId: targetPlan.id,
          status: 'active',
          billingCycle,
          provider: 'brosdev_pay',
          providerSubscriptionId: `bdp_sub_${userId}_${targetPlan.id}`,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          updatedAt: now,
        },
      })
      .returning();

    const [payment] = await db
      .insert(payments)
      .values({
        userId,
        subscriptionId: sub.id,
        provider: 'brosdev_pay',
        providerPaymentId: txnRef,
        amountCents: priceCents,
        currency: 'USD',
        status: 'succeeded',
        refundStatus: 'none',
        metadata: {
          planId: targetPlan.id,
          planName: targetPlan.name,
          billingCycle,
          cardholderName: (cardholderName || '').trim(),
          cardBrand,
          last4,
          billingZip: (billingZip || '').trim(),
        },
      })
      .returning();

    const invoiceNumber = `INV-${now.getUTCFullYear()}-${String(payment.id).padStart(6, '0')}`;
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        userId,
        paymentId: payment.id,
        subscriptionId: sub.id,
        amountCents: priceCents,
        currency: 'USD',
        status: 'paid',
        periodStart: now,
        periodEnd,
      })
      .returning();

    return res.json({
      approved: true,
      transactionId: txnRef,
      invoiceNumber: invoice.invoiceNumber,
      cardBrand,
      last4,
      message: `Payment approved via BrosDev Pay (${cardBrand} ending in ${last4}). ${targetPlan.name} plan is now active.`,
      subscription: sub,
    });
  } catch (err) {
    console.error('POST /api/billing/brosdev-pay/checkout failed:', err);
    return res.status(500).json({ error: 'Unable to process BrosDev Pay transaction.' });
  }
});

