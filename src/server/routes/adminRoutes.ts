import crypto from 'node:crypto';
import express, { Response } from 'express';
import { and, count, desc, eq, gte, ilike, or, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  adminAuditLogs,
  adminPermissions,
  adminRoles,
  adminUsers,
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
  users,
} from '../../db/schema.ts';
import {
  AuthRequest,
  isAdmin2faVerified,
  markAdmin2faVerified,
  recordAdminAudit,
  requireAdminPermission,
  requireAuth,
} from '../../middleware/auth.ts';
import {
  buildTotpUri,
  decryptSecret,
  encryptSecret,
  generateFormSecretKey,
  generateTotpSecret,
  hashPassword,
  maskApiKey,
  verifyTotpCode,
} from '../crypto.ts';
import {
  retryFailedEmailLog,
  sendEmailViaResend,
  testResendApiConnection,
} from '../emailService.ts';
import { DEFAULT_INVOICE_TEMPLATE, getCurrentPeriodMonth } from '../bootstrap.ts';
import { createEmailPasswordAccount } from './authRoutes.ts';

export const adminRouter = express.Router();
adminRouter.use(requireAuth);

// 1. Admin Session & Two-Factor Authentication (TOTP)
adminRouter.get(
  '/session',
  requireAdminPermission(undefined, { skip2faCheck: true }),
  async (req: AuthRequest, res: Response) => {
    const ctx = req.adminContext!;
    const sessionUid = req.authUid || req.firebaseUser?.uid;
    const verified = sessionUid ? isAdmin2faVerified(sessionUid) : false;
    return res.json({
      admin: {
        userId: req.dbUser!.id,
        email: req.dbUser!.email,
        displayName: req.dbUser!.displayName,
        roleSlug: ctx.roleSlug,
        roleName: ctx.roleName,
        permissions: ctx.permissions,
        totpEnabled: ctx.totpEnabled,
        totpVerified: !ctx.totpEnabled || verified,
      },
    });
  }
);

adminRouter.post(
  '/2fa/setup',
  requireAdminPermission(undefined, { skip2faCheck: true }),
  async (req: AuthRequest, res: Response) => {
    try {
      const secret = generateTotpSecret();
      const encrypted = encryptSecret(secret);
      await db
        .update(adminUsers)
        .set({ totpSecretEncrypted: encrypted })
        .where(eq(adminUsers.id, req.adminContext!.adminUserId));

      return res.json({
        secret,
        otpauthUri: buildTotpUri(req.dbUser!.email, secret),
      });
    } catch (err) {
      console.error('Admin 2FA setup error:', err);
      return res.status(500).json({ error: 'Failed to initialize 2FA setup' });
    }
  }
);

adminRouter.post(
  '/2fa/verify',
  requireAdminPermission(undefined, { skip2faCheck: true }),
  async (req: AuthRequest, res: Response) => {
    try {
      const code = String(req.body.code || '').trim();
      const [adminRow] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, req.adminContext!.adminUserId))
        .limit(1);

      const secret = decryptSecret(adminRow?.totpSecretEncrypted);
      if (!secret || !verifyTotpCode(secret, code)) {
        return res.status(401).json({ error: 'Invalid 6-digit authenticator code.' });
      }

      await db
        .update(adminUsers)
        .set({ totpEnabled: true, lastAdminLoginAt: new Date() })
        .where(eq(adminUsers.id, adminRow.id));

      const sessionUid = req.authUid || req.firebaseUser?.uid;
      if (sessionUid) markAdmin2faVerified(sessionUid);
      await recordAdminAudit(req, 'admin.2fa.verified', 'admin_user', adminRow.id);
      return res.json({ verified: true, totpEnabled: true });
    } catch (err) {
      console.error('Admin 2FA verify error:', err);
      return res.status(500).json({ error: 'Failed to verify 2FA code' });
    }
  }
);

adminRouter.post(
  '/2fa/disable',
  requireAdminPermission(undefined),
  async (req: AuthRequest, res: Response) => {
    try {
      await db
        .update(adminUsers)
        .set({ totpEnabled: false, totpSecretEncrypted: null })
        .where(eq(adminUsers.id, req.adminContext!.adminUserId));
      await recordAdminAudit(req, 'admin.2fa.disabled', 'admin_user', req.adminContext!.adminUserId);
      return res.json({ totpEnabled: false });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to disable 2FA' });
    }
  }
);

// 2. Super Admin Overview Dashboard
adminRouter.get(
  '/dashboard',
  requireAdminPermission('admin.dashboard.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const [usersCount] = await db.select({ total: count() }).from(users);
      const [activeUsersCount] = await db
        .select({ total: count() })
        .from(users)
        .where(eq(users.status, 'active'));
      const [formsCount] = await db.select({ total: count() }).from(forms);
      const [submissionsCount] = await db.select({ total: count() }).from(submissions);

      const emailBreakdown = await db
        .select({ status: emailLogs.status, total: count() })
        .from(emailLogs)
        .groupBy(emailLogs.status);

      const emailStats = {
        total: 0,
        delivered: 0,
        accepted: 0,
        failed: 0,
        bounced: 0,
        pending: 0,
      };
      for (const row of emailBreakdown) {
        const n = Number(row.total);
        emailStats.total += n;
        if (row.status in emailStats) {
          (emailStats as any)[row.status] = n;
        }
      }

      const activeSubs = await db
        .select({
          billingCycle: subscriptions.billingCycle,
          monthlyPriceCents: subscriptionPlans.monthlyPriceCents,
          yearlyPriceCents: subscriptionPlans.yearlyPriceCents,
          planSlug: subscriptionPlans.slug,
        })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(or(eq(subscriptions.status, 'active'), eq(subscriptions.status, 'trialing')));

      let mrrCents = 0;
      let paidActiveSubscriptions = 0;
      for (const s of activeSubs) {
        if (s.monthlyPriceCents > 0) {
          paidActiveSubscriptions += 1;
          mrrCents +=
            s.billingCycle === 'yearly'
              ? Math.round(s.yearlyPriceCents / 12)
              : s.monthlyPriceCents;
        }
      }

      const [apiTotal] = await db.select({ total: count() }).from(apiUsageLogs);
      const periodMonth = getCurrentPeriodMonth();
      const [monthlyResendUsage] = await db
        .select({ total: sum(subscriptionUsage.emailsSentCount) })
        .from(subscriptionUsage)
        .where(eq(subscriptionUsage.periodMonth, periodMonth));

      // Build 14-day real time series for all 5 requested charts
      const since = new Date();
      since.setDate(since.getDate() - 13);
      since.setHours(0, 0, 0, 0);

      const [recentUsers, recentSubs, recentEmails, recentPayments, recentApi] = await Promise.all([
        db.select({ createdAt: users.createdAt }).from(users).where(gte(users.createdAt, since)),
        db
          .select({ createdAt: submissions.createdAt })
          .from(submissions)
          .where(gte(submissions.createdAt, since)),
        db
          .select({ createdAt: emailLogs.createdAt, status: emailLogs.status })
          .from(emailLogs)
          .where(gte(emailLogs.createdAt, since)),
        db
          .select({ createdAt: payments.createdAt, amountCents: payments.amountCents, status: payments.status })
          .from(payments)
          .where(gte(payments.createdAt, since)),
        db
          .select({ createdAt: apiUsageLogs.createdAt, statusCode: apiUsageLogs.statusCode })
          .from(apiUsageLogs)
          .where(gte(apiUsageLogs.createdAt, since)),
      ]);

      const seriesMap = new Map<
        string,
        {
          date: string;
          registrations: number;
          submissions: number;
          emailsDelivered: number;
          emailsAccepted: number;
          emailsFailed: number;
          revenueUsd: number;
          apiRequests: number;
        }
      >();

      for (let i = 0; i < 14; i++) {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        seriesMap.set(iso, {
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          registrations: 0,
          submissions: 0,
          emailsDelivered: 0,
          emailsAccepted: 0,
          emailsFailed: 0,
          revenueUsd: 0,
          apiRequests: 0,
        });
      }

      for (const r of recentUsers) {
        const row = seriesMap.get(new Date(r.createdAt).toISOString().slice(0, 10));
        if (row) row.registrations += 1;
      }
      for (const r of recentSubs) {
        const row = seriesMap.get(new Date(r.createdAt).toISOString().slice(0, 10));
        if (row) row.submissions += 1;
      }
      for (const r of recentEmails) {
        const row = seriesMap.get(new Date(r.createdAt).toISOString().slice(0, 10));
        if (!row) continue;
        if (r.status === 'delivered') row.emailsDelivered += 1;
        else if (r.status === 'accepted') row.emailsAccepted += 1;
        else if (r.status === 'failed' || r.status === 'bounced') row.emailsFailed += 1;
      }
      for (const r of recentPayments) {
        const row = seriesMap.get(new Date(r.createdAt).toISOString().slice(0, 10));
        if (row && r.status === 'succeeded') row.revenueUsd += Number(r.amountCents) / 100;
      }
      for (const r of recentApi) {
        const row = seriesMap.get(new Date(r.createdAt).toISOString().slice(0, 10));
        if (row) row.apiRequests += 1;
      }

      return res.json({
        kpis: {
          totalUsers: Number(usersCount?.total || 0),
          activeCustomers: Number(activeUsersCount?.total || 0),
          totalForms: Number(formsCount?.total || 0),
          totalSubmissions: Number(submissionsCount?.total || 0),
          totalEmailsSent: emailStats.total,
          successfulEmailDeliveries: emailStats.delivered,
          acceptedEmailDeliveries: emailStats.accepted,
          failedEmailDeliveries: emailStats.failed + emailStats.bounced,
          activeSubscriptions: activeSubs.length,
          paidActiveSubscriptions,
          mrrCents,
          totalApiRequests: Number(apiTotal?.total || 0),
          resendMonthlyUsage: Number(monthlyResendUsage?.total || 0),
        },
        charts: Array.from(seriesMap.values()),
      });
    } catch (err) {
      console.error('GET /api/admin/dashboard failed:', err);
      return res.status(500).json({ error: 'Failed to load admin overview' });
    }
  }
);

// 3. Resend Configuration Management (Super Admin only)
adminRouter.get(
  '/resend',
  requireAdminPermission('admin.resend.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const [settings] = await db.select().from(emailProviderSettings).limit(1);
      const periodMonth = getCurrentPeriodMonth();
      const [usageRow] = await db
        .select({ total: sum(subscriptionUsage.emailsSentCount) })
        .from(subscriptionUsage)
        .where(eq(subscriptionUsage.periodMonth, periodMonth));

      return res.json({
        config: settings
          ? {
              id: settings.id,
              provider: settings.provider,
              hasApiKey: Boolean(settings.apiKeyEncrypted || process.env.RESEND_API_KEY),
              apiKeyMasked:
                settings.apiKeyMasked ||
                (process.env.RESEND_API_KEY ? 'Configured via environment variable' : ''),
              sendingDomain: settings.sendingDomain,
              defaultSenderName: settings.defaultSenderName,
              defaultSenderEmail: settings.defaultSenderEmail,
              defaultReplyTo: settings.defaultReplyTo,
              defaultEmailFooter: settings.defaultEmailFooter,
              globalNotificationsEnabled: settings.globalNotificationsEnabled,
              connectionStatus: settings.connectionStatus,
              lastTestedAt: settings.lastTestedAt,
              lastError: settings.lastError,
              rateLimitLimit: settings.rateLimitLimit,
              rateLimitRemaining: settings.rateLimitRemaining,
              rateLimitResetAt: settings.rateLimitResetAt,
              updatedAt: settings.updatedAt,
            }
          : null,
        monthlyEmailsSent: Number(usageRow?.total || 0),
        webhookEndpoint: '/api/webhooks/resend',
        webhookSecretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      });
    } catch (err) {
      console.error('GET /api/admin/resend failed:', err);
      return res.status(500).json({ error: 'Failed to load Resend settings' });
    }
  }
);

const resendConfigSchema = z.object({
  apiKey: z.string().optional(),
  sendingDomain: z.string().min(3).max(160),
  defaultSenderName: z.string().min(1).max(100),
  defaultSenderEmail: z.string().email(),
  defaultReplyTo: z.string().email(),
  defaultEmailFooter: z.string().max(500),
  globalNotificationsEnabled: z.boolean(),
});

adminRouter.put(
  '/resend',
  requireAdminPermission('admin.resend.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = resendConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid Resend configuration', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const [existing] = await db.select().from(emailProviderSettings).limit(1);

      const updateValues: Record<string, unknown> = {
        sendingDomain: d.sendingDomain.trim().toLowerCase(),
        defaultSenderName: d.defaultSenderName.trim(),
        defaultSenderEmail: d.defaultSenderEmail.trim().toLowerCase(),
        defaultReplyTo: d.defaultReplyTo.trim().toLowerCase(),
        defaultEmailFooter: d.defaultEmailFooter.trim(),
        globalNotificationsEnabled: d.globalNotificationsEnabled,
        updatedAt: new Date(),
      };

      const newRawKey = d.apiKey?.trim();
      if (newRawKey) {
        updateValues.apiKeyEncrypted = encryptSecret(newRawKey);
        updateValues.apiKeyMasked = maskApiKey(newRawKey);
        updateValues.lastError = null;
      }

      if (existing) {
        await db
          .update(emailProviderSettings)
          .set(updateValues)
          .where(eq(emailProviderSettings.id, existing.id));
      } else {
        await db.insert(emailProviderSettings).values(updateValues as any);
      }

      await recordAdminAudit(req, 'resend.config.updated', 'email_provider_settings', existing?.id || 1, {
        sendingDomain: d.sendingDomain,
        defaultSenderEmail: d.defaultSenderEmail,
        apiKeyRotated: Boolean(newRawKey),
      });

      return res.json({ saved: true, apiKeyRotated: Boolean(newRawKey) });
    } catch (err) {
      console.error('PUT /api/admin/resend failed:', err);
      return res.status(500).json({ error: 'Failed to save Resend settings' });
    }
  }
);

adminRouter.post(
  '/resend/test-connection',
  requireAdminPermission('admin.resend.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await testResendApiConnection();
      await recordAdminAudit(req, 'resend.connection.tested', 'email_provider_settings', 'global', {
        ok: result.ok,
        status: result.status,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Connection test failed' });
    }
  }
);

adminRouter.post(
  '/resend/send-test',
  requireAdminPermission('admin.resend.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const to = String(req.body.to || req.dbUser!.email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return res.status(400).json({ error: 'Enter a valid recipient email address.' });
      }
      const result = await sendEmailViaResend({
        userId: req.dbUser!.id,
        emailType: 'test',
        to,
        subject: 'BrosDev Forms — Resend Integration Verification',
        html: `<div style="font-family:system-ui,sans-serif;padding:24px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;max-width:540px;"><h2 style="margin:0 0 8px;color:#111;">Resend Configuration Verified</h2><p style="color:#444;line-height:1.6;">This test email was dispatched via your platform Resend account from BrosDev Forms Super Admin Panel at ${new Date().toUTCString()}.</p></div>`,
      });
      await recordAdminAudit(req, 'resend.test_email.sent', 'email_log', result.emailLogId, {
        to,
        status: result.status,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to dispatch test email' });
    }
  }
);

// 4. Email Management & Usage
adminRouter.get(
  '/emails',
  requireAdminPermission('admin.emails.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const status = String(req.query.status || '').trim();
      const q = String(req.query.q || '').trim();

      const conditions = [];
      if (status) conditions.push(eq(emailLogs.status, status));
      if (q) {
        conditions.push(
          or(
            ilike(emailLogs.recipientEmail, `%${q}%`),
            ilike(emailLogs.subject, `%${q}%`),
            ilike(emailLogs.resendMessageId, `%${q}%`),
            ilike(users.email, `%${q}%`)
          )!
        );
      }

      const logs = await db
        .select({
          id: emailLogs.id,
          userId: emailLogs.userId,
          customerEmail: users.email,
          formId: emailLogs.formId,
          formTitle: forms.title,
          submissionId: emailLogs.submissionId,
          emailType: emailLogs.emailType,
          recipientEmail: emailLogs.recipientEmail,
          senderEmail: emailLogs.senderEmail,
          subject: emailLogs.subject,
          resendMessageId: emailLogs.resendMessageId,
          status: emailLogs.status,
          errorDetails: emailLogs.errorDetails,
          retryCount: emailLogs.retryCount,
          createdAt: emailLogs.createdAt,
          updatedAt: emailLogs.updatedAt,
        })
        .from(emailLogs)
        .innerJoin(users, eq(emailLogs.userId, users.id))
        .leftJoin(forms, eq(emailLogs.formId, forms.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(emailLogs.createdAt))
        .limit(200);

      const summaryRows = await db
        .select({ status: emailLogs.status, total: count() })
        .from(emailLogs)
        .groupBy(emailLogs.status);

      const summary: Record<string, number> = {
        total: 0,
        accepted: 0,
        delivered: 0,
        bounced: 0,
        failed: 0,
        pending: 0,
      };
      for (const r of summaryRows) {
        summary[r.status] = Number(r.total);
        summary.total += Number(r.total);
      }

      return res.json({ summary, logs });
    } catch (err) {
      console.error('GET /api/admin/emails failed:', err);
      return res.status(500).json({ error: 'Failed to load email logs' });
    }
  }
);

adminRouter.post(
  '/emails/:id/retry',
  requireAdminPermission('admin.emails.retry'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid email log ID' });
      const result = await retryFailedEmailLog(id);
      await recordAdminAudit(req, 'email.retried', 'email_log', id, result);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Retry failed' });
    }
  }
);

adminRouter.get(
  '/email-usage',
  requireAdminPermission('admin.emails.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const periodMonth = getCurrentPeriodMonth();
      const rows = await db
        .select({
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
          planName: subscriptionPlans.name,
          planEmailLimit: subscriptionPlans.maxEmailsPerMonth,
          customEmailLimit: users.customEmailLimit,
          emailsSentThisMonth: subscriptionUsage.emailsSentCount,
        })
        .from(users)
        .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .leftJoin(
          subscriptionUsage,
          and(
            eq(subscriptionUsage.userId, users.id),
            eq(subscriptionUsage.periodMonth, periodMonth)
          )
        )
        .orderBy(desc(subscriptionUsage.emailsSentCount));

      const statusByUser = await db
        .select({
          userId: emailLogs.userId,
          delivered: sql<number>`count(*) filter (where ${emailLogs.status} = 'delivered')`,
          accepted: sql<number>`count(*) filter (where ${emailLogs.status} = 'accepted')`,
          failed: sql<number>`count(*) filter (where ${emailLogs.status} in ('failed', 'bounced'))`,
        })
        .from(emailLogs)
        .groupBy(emailLogs.userId);

      const map = new Map(statusByUser.map((r) => [r.userId, r]));
      return res.json({
        periodMonth,
        customers: rows.map((r) => {
          const limit = r.customEmailLimit ?? r.planEmailLimit ?? 100;
          const sent = Number(r.emailsSentThisMonth || 0);
          const stats = map.get(r.userId);
          return {
            ...r,
            effectiveLimit: limit,
            emailsSentThisMonth: sent,
            usagePct: limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0,
            deliveredTotal: Number(stats?.delivered || 0),
            acceptedTotal: Number(stats?.accepted || 0),
            failedTotal: Number(stats?.failed || 0),
          };
        }),
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load email usage' });
    }
  }
);

// 5. Customer Management
adminRouter.get(
  '/users',
  requireAdminPermission('admin.users.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      const periodMonth = getCurrentPeriodMonth();

      const allUsers = await db
        .select({
          id: users.id,
          uid: users.uid,
          email: users.email,
          displayName: users.displayName,
          hasPassword: sql<boolean>`${users.passwordHash} is not null`,
          status: users.status,
          customFormLimit: users.customFormLimit,
          customSubmissionLimit: users.customSubmissionLimit,
          customEmailLimit: users.customEmailLimit,
          customRateLimit: users.customRateLimit,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          adminRoleSlug: adminRoles.slug,
          adminRoleName: adminRoles.name,
          subscriptionId: subscriptions.id,
          subscriptionStatus: subscriptions.status,
          billingCycle: subscriptions.billingCycle,
          planId: subscriptionPlans.id,
          planName: subscriptionPlans.name,
          planMaxForms: subscriptionPlans.maxForms,
          planMaxSubmissions: subscriptionPlans.maxSubmissionsPerMonth,
          planMaxEmails: subscriptionPlans.maxEmailsPerMonth,
          submissionsThisMonth: subscriptionUsage.submissionsCount,
          emailsThisMonth: subscriptionUsage.emailsSentCount,
          apiRequestsThisMonth: subscriptionUsage.apiRequestsCount,
          storageBytes: subscriptionUsage.storageBytes,
        })
        .from(users)
        .leftJoin(adminUsers, and(eq(adminUsers.userId, users.id), eq(adminUsers.isActive, true)))
        .leftJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
        .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .leftJoin(
          subscriptionUsage,
          and(
            eq(subscriptionUsage.userId, users.id),
            eq(subscriptionUsage.periodMonth, periodMonth)
          )
        )
        .where(
          q ? or(ilike(users.email, `%${q}%`), ilike(users.displayName, `%${q}%`)) : undefined
        )
        .orderBy(desc(users.createdAt));

      const formCounts = await db
        .select({ userId: forms.userId, total: count() })
        .from(forms)
        .groupBy(forms.userId);
      const subCounts = await db
        .select({ userId: submissions.userId, total: count() })
        .from(submissions)
        .groupBy(submissions.userId);

      const fMap = new Map(formCounts.map((r) => [r.userId, Number(r.total)]));
      const sMap = new Map(subCounts.map((r) => [r.userId, Number(r.total)]));

      return res.json({
        users: allUsers.map((u) => ({
          ...u,
          hasPassword: Boolean(u.hasPassword),
          formsCount: fMap.get(u.id) || 0,
          totalSubmissionsCount: sMap.get(u.id) || 0,
        })),
      });
    } catch (err) {
      console.error('GET /api/admin/users failed:', err);
      return res.status(500).json({ error: 'Failed to load customers' });
    }
  }
);

const adminCreateUserSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  displayName: z.string().max(100).optional().default(''),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  planId: z.number().int().positive().optional(),
  billingCycle: z.enum(['monthly', 'yearly']).optional().default('monthly'),
  adminRoleSlug: z.enum(['', 'super_admin', 'admin', 'support']).optional().default(''),
});

adminRouter.post(
  '/users',
  requireAdminPermission('admin.users.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = adminCreateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid user details.' });
      }
      const d = parsed.data;
      const created = await createEmailPasswordAccount({
        email: d.email,
        password: d.password,
        displayName: d.displayName,
        planId: d.planId,
        billingCycle: d.billingCycle,
      });

      if (d.adminRoleSlug && req.adminContext?.roleSlug === 'super_admin') {
        const [role] = await db
          .select()
          .from(adminRoles)
          .where(eq(adminRoles.slug, d.adminRoleSlug))
          .limit(1);
        if (role) {
          await db
            .insert(adminUsers)
            .values({ userId: created.id, roleId: role.id, isActive: true })
            .onConflictDoNothing();
        }
      }

      await recordAdminAudit(req, 'customer.created', 'user', created.id, {
        email: created.email,
        planId: d.planId ?? 'default_free',
        adminRoleSlug: d.adminRoleSlug || 'customer',
      });

      return res.status(201).json({
        user: {
          id: created.id,
          uid: created.uid,
          email: created.email,
          displayName: created.displayName,
        },
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to create user' });
    }
  }
);

adminRouter.patch(
  '/users/:id',
  requireAdminPermission('admin.users.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!Number.isInteger(targetUserId)) return res.status(400).json({ error: 'Invalid user ID' });

      const {
        displayName,
        email,
        status,
        planId,
        billingCycle,
        customFormLimit,
        customSubmissionLimit,
        customEmailLimit,
        customRateLimit,
        adminRoleSlug,
        resetUsage,
      } = req.body;

      const [existingTarget] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!existingTarget) return res.status(404).json({ error: 'User not found' });

      const userUpdates: Record<string, unknown> = {};
      if (typeof displayName === 'string' && displayName.trim().length > 0) {
        userUpdates.displayName = displayName.trim().slice(0, 100);
      }
      if (typeof email === 'string' && email.trim().length > 0) {
        const normalized = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
          return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        if (normalized !== existingTarget.email.toLowerCase()) {
          const conflict = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, normalized))
            .limit(1);
          if (conflict.length > 0) {
            return res.status(409).json({ error: 'Another user already uses that email address.' });
          }
          userUpdates.email = normalized;
        }
      }
      if (status === 'active' || status === 'suspended') {
        if (status === 'suspended' && targetUserId === req.dbUser!.id) {
          return res.status(400).json({ error: 'You cannot suspend your own account.' });
        }
        userUpdates.status = status;
      }
      if (customFormLimit !== undefined)
        userUpdates.customFormLimit = customFormLimit === null || customFormLimit === '' ? null : Number(customFormLimit);
      if (customSubmissionLimit !== undefined)
        userUpdates.customSubmissionLimit =
          customSubmissionLimit === null || customSubmissionLimit === '' ? null : Number(customSubmissionLimit);
      if (customEmailLimit !== undefined)
        userUpdates.customEmailLimit =
          customEmailLimit === null || customEmailLimit === '' ? null : Number(customEmailLimit);
      if (customRateLimit !== undefined)
        userUpdates.customRateLimit =
          customRateLimit === null || customRateLimit === '' ? null : Number(customRateLimit);

      if (Object.keys(userUpdates).length > 0) {
        await db.update(users).set(userUpdates).where(eq(users.id, targetUserId));
      }

      // Role update (Super Admin only; prevent self-demotion)
      if (adminRoleSlug !== undefined && req.adminContext?.roleSlug === 'super_admin') {
        if (targetUserId === req.dbUser!.id && adminRoleSlug !== 'super_admin') {
          return res.status(400).json({ error: 'You cannot demote your own Super Admin role.' });
        }
        if (adminRoleSlug === '' || adminRoleSlug === null) {
          await db.delete(adminUsers).where(eq(adminUsers.userId, targetUserId));
        } else if (['super_admin', 'admin', 'support'].includes(adminRoleSlug)) {
          const [role] = await db
            .select()
            .from(adminRoles)
            .where(eq(adminRoles.slug, adminRoleSlug))
            .limit(1);
          if (role) {
            await db
              .insert(adminUsers)
              .values({ userId: targetUserId, roleId: role.id, isActive: true })
              .onConflictDoUpdate({
                target: adminUsers.userId,
                set: { roleId: role.id, isActive: true },
              });
          }
        }
      }

      if (planId) {
        const now = new Date();
        const end = new Date(now);
        if (billingCycle === 'yearly') end.setFullYear(end.getFullYear() + 1);
        else end.setMonth(end.getMonth() + 1);

        await db
          .insert(subscriptions)
          .values({
            userId: targetUserId,
            planId: Number(planId),
            status: 'active',
            billingCycle: billingCycle === 'yearly' ? 'yearly' : 'monthly',
            provider: 'manual',
            currentPeriodStart: now,
            currentPeriodEnd: end,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: subscriptions.userId,
            set: {
              planId: Number(planId),
              status: 'active',
              billingCycle: billingCycle === 'yearly' ? 'yearly' : 'monthly',
              currentPeriodStart: now,
              currentPeriodEnd: end,
              updatedAt: now,
            },
          });
      }

      if (resetUsage) {
        await db
          .update(subscriptionUsage)
          .set({
            submissionsCount: 0,
            emailsSentCount: 0,
            apiRequestsCount: 0,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(subscriptionUsage.userId, targetUserId),
              eq(subscriptionUsage.periodMonth, getCurrentPeriodMonth())
            )
          );
      }

      await recordAdminAudit(req, 'customer.updated', 'user', targetUserId, {
        displayName: userUpdates.displayName,
        email: userUpdates.email,
        status,
        planId,
        adminRoleSlug,
        customFormLimit,
        customSubmissionLimit,
        customEmailLimit,
        resetUsage: Boolean(resetUsage),
      });

      return res.json({ updated: true });
    } catch (err) {
      console.error('PATCH /api/admin/users/:id failed:', err);
      return res.status(500).json({ error: 'Failed to update customer' });
    }
  }
);

function generateStrongTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(14);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

adminRouter.post(
  '/users/:id/reset-password',
  requireAdminPermission('admin.users.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!Number.isInteger(targetUserId)) return res.status(400).json({ error: 'Invalid user ID' });

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });

      const generateTemporary = Boolean(req.body.generateTemporary);
      const sendEmail = Boolean(req.body.sendEmail);
      const chosenPassword = generateTemporary
        ? generateStrongTemporaryPassword()
        : String(req.body.newPassword || '');

      if (chosenPassword.length < 8 || chosenPassword.length > 128) {
        return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
      }

      const nextHash = hashPassword(chosenPassword);
      await db
        .update(users)
        .set({ passwordHash: nextHash })
        .where(eq(users.id, targetUserId));

      let emailSent = false;
      if (sendEmail) {
        try {
          const result = await sendEmailViaResend({
            userId: targetUser.id,
            emailType: 'notification',
            to: targetUser.email,
            subject: 'BrosDev Forms — Your Account Password Was Reset',
            html: `<div style="font-family:system-ui,sans-serif;padding:24px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;max-width:540px;"><h2 style="margin:0 0 8px;color:#111;">Password Reset Confirmation</h2><p style="color:#444;line-height:1.6;">An administrator has updated the password for your BrosDev Forms account (${targetUser.email}). Please sign in and update your password from Account Settings.</p></div>`,
          });
          emailSent = result.status === 'accepted';
        } catch {
          emailSent = false;
        }
      }

      await recordAdminAudit(req, 'customer.password_reset', 'user', targetUserId, {
        email: targetUser.email,
        mode: generateTemporary ? 'generated_temporary' : 'admin_defined',
        notificationEmailed: emailSent,
      });

      return res.json({
        reset: true,
        temporaryPassword: generateTemporary ? chosenPassword : undefined,
        emailSent,
        message: 'User password has been updated.',
      });
    } catch (err) {
      console.error('POST /api/admin/users/:id/reset-password failed:', err);
      return res.status(500).json({ error: 'Failed to reset user password.' });
    }
  }
);

adminRouter.delete(
  '/users/:id',
  requireAdminPermission('admin.users.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!Number.isInteger(targetUserId)) return res.status(400).json({ error: 'Invalid user ID' });
      if (targetUserId === req.dbUser!.id) {
        return res.status(400).json({ error: 'You cannot delete your own administrator account.' });
      }

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });

      const targetAdmin = await db
        .select({ roleSlug: adminRoles.slug })
        .from(adminUsers)
        .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
        .where(eq(adminUsers.userId, targetUserId))
        .limit(1);

      if (targetAdmin[0]?.roleSlug === 'super_admin' && req.adminContext?.roleSlug !== 'super_admin') {
        return res.status(403).json({ error: 'Only a Super Admin can delete another Super Admin.' });
      }

      await db.delete(users).where(eq(users.id, targetUserId));
      await recordAdminAudit(req, 'customer.deleted', 'user', targetUserId, {
        email: targetUser.email,
      });
      return res.json({ deleted: true });
    } catch (err) {
      console.error('DELETE /api/admin/users/:id failed:', err);
      return res.status(500).json({ error: 'Failed to delete user.' });
    }
  }
);

// 6. Platform Forms & Submissions Moderation
adminRouter.get(
  '/forms',
  requireAdminPermission('admin.forms.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select({
          id: forms.id,
          formKey: forms.formKey,
          title: forms.title,
          status: forms.status,
          allowedDomains: forms.allowedDomains,
          secretApiKeyPrefix: forms.secretApiKeyPrefix,
          createdAt: forms.createdAt,
          updatedAt: forms.updatedAt,
          ownerEmail: users.email,
          ownerId: users.id,
        })
        .from(forms)
        .innerJoin(users, eq(forms.userId, users.id))
        .orderBy(desc(forms.createdAt))
        .limit(200);

      const subCounts = await db
        .select({ formId: submissions.formId, total: count() })
        .from(submissions)
        .groupBy(submissions.formId);
      const map = new Map(subCounts.map((r) => [r.formId, Number(r.total)]));

      return res.json({
        forms: rows.map((r) => ({ ...r, submissionCount: map.get(r.id) || 0 })),
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load platform forms' });
    }
  }
);

adminRouter.patch(
  '/forms/:id',
  requireAdminPermission('admin.forms.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const formId = Number(req.params.id);
      const { status, allowedDomains, revokeApiKey } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (['draft', 'published', 'inactive', 'suspended'].includes(status)) {
        updates.status = status;
      }
      if (Array.isArray(allowedDomains)) {
        updates.allowedDomains = allowedDomains.map(String);
      }
      if (revokeApiKey) {
        const rotated = generateFormSecretKey();
        updates.secretApiKeyHash = rotated.hash;
        updates.secretApiKeyPrefix = rotated.prefix;
      }

      await db.update(forms).set(updates).where(eq(forms.id, formId));
      await recordAdminAudit(req, 'form.moderated', 'form', formId, {
        status,
        revokeApiKey: Boolean(revokeApiKey),
      });
      return res.json({ updated: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update form' });
    }
  }
);

adminRouter.get(
  '/submissions',
  requireAdminPermission('admin.submissions.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      const rows = await db
        .select({
          id: submissions.id,
          formId: submissions.formId,
          formTitle: forms.title,
          formKey: forms.formKey,
          customerEmail: users.email,
          payload: submissions.payload,
          status: submissions.status,
          emailDeliveryStatus: submissions.emailDeliveryStatus,
          originDomain: submissions.originDomain,
          sourceIp: submissions.sourceIp,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .innerJoin(forms, eq(submissions.formId, forms.id))
        .innerJoin(users, eq(submissions.userId, users.id))
        .where(
          q
            ? or(
                ilike(forms.title, `%${q}%`),
                ilike(users.email, `%${q}%`),
                sql`${submissions.payload}::text ilike ${`%${q}%`}`
              )
            : undefined
        )
        .orderBy(desc(submissions.createdAt))
        .limit(200);

      return res.json({ submissions: rows });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load platform submissions' });
    }
  }
);

// 7. API Monitoring & Rate Limits
adminRouter.get(
  '/api-monitoring',
  requireAdminPermission('admin.api.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const [totals] = await db
        .select({
          total: count(),
          successful: sql<number>`count(*) filter (where ${apiUsageLogs.statusCode} >= 200 and ${apiUsageLogs.statusCode} < 400)`,
          failed: sql<number>`count(*) filter (where ${apiUsageLogs.statusCode} >= 400)`,
          rateLimited: sql<number>`count(*) filter (where ${apiUsageLogs.isRateLimited} = true)`,
          suspicious: sql<number>`count(*) filter (where ${apiUsageLogs.isSuspicious} = true)`,
        })
        .from(apiUsageLogs);

      const byCustomer = await db
        .select({
          userId: users.id,
          email: users.email,
          totalRequests: count(),
          failedRequests: sql<number>`count(*) filter (where ${apiUsageLogs.statusCode} >= 400)`,
        })
        .from(apiUsageLogs)
        .innerJoin(users, eq(apiUsageLogs.userId, users.id))
        .groupBy(users.id, users.email)
        .orderBy(desc(count()))
        .limit(25);

      const byForm = await db
        .select({
          formId: forms.id,
          formKey: forms.formKey,
          formTitle: forms.title,
          status: forms.status,
          totalRequests: count(),
          failedRequests: sql<number>`count(*) filter (where ${apiUsageLogs.statusCode} >= 400)`,
        })
        .from(apiUsageLogs)
        .innerJoin(forms, eq(apiUsageLogs.formId, forms.id))
        .groupBy(forms.id, forms.formKey, forms.title, forms.status)
        .orderBy(desc(count()))
        .limit(25);

      const recentLogs = await db
        .select({
          id: apiUsageLogs.id,
          endpoint: apiUsageLogs.endpoint,
          method: apiUsageLogs.method,
          statusCode: apiUsageLogs.statusCode,
          isRateLimited: apiUsageLogs.isRateLimited,
          isSuspicious: apiUsageLogs.isSuspicious,
          ipAddress: apiUsageLogs.ipAddress,
          originDomain: apiUsageLogs.originDomain,
          responseTimeMs: apiUsageLogs.responseTimeMs,
          errorMessage: apiUsageLogs.errorMessage,
          createdAt: apiUsageLogs.createdAt,
        })
        .from(apiUsageLogs)
        .orderBy(desc(apiUsageLogs.createdAt))
        .limit(100);

      const [limitsSetting] = await db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, 'global_api_limits'))
        .limit(1);

      return res.json({
        summary: {
          totalRequests: Number(totals?.total || 0),
          successfulRequests: Number(totals?.successful || 0),
          failedRequests: Number(totals?.failed || 0),
          rateLimitedEvents: Number(totals?.rateLimited || 0),
          suspiciousTraffic: Number(totals?.suspicious || 0),
        },
        byCustomer,
        byForm,
        recentLogs,
        globalLimits: limitsSetting?.value || {
          globalRequestsPerMin: 1200,
          perIpRequestsPerMin: 120,
          maxPayloadKb: 512,
          maxFileUploadMb: 5,
          blockSuspiciousOrigins: true,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load API monitoring data' });
    }
  }
);

adminRouter.put(
  '/api-monitoring/limits',
  requireAdminPermission('admin.api.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const val = {
        globalRequestsPerMin: Math.max(10, Number(req.body.globalRequestsPerMin || 1200)),
        perIpRequestsPerMin: Math.max(5, Number(req.body.perIpRequestsPerMin || 120)),
        maxPayloadKb: Math.max(64, Number(req.body.maxPayloadKb || 512)),
        maxFileUploadMb: Math.max(1, Number(req.body.maxFileUploadMb || 5)),
        blockSuspiciousOrigins: Boolean(req.body.blockSuspiciousOrigins),
      };

      await db
        .insert(platformSettings)
        .values({ key: 'global_api_limits', value: val, updatedBy: req.dbUser!.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value: val, updatedBy: req.dbUser!.id, updatedAt: new Date() },
        });

      await recordAdminAudit(req, 'api.global_limits.updated', 'platform_settings', 'global_api_limits', val);
      return res.json({ saved: true, globalLimits: val });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update API limits' });
    }
  }
);

// 8. Subscription Plans CRUD
const planSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(80),
  audienceLabel: z.string().max(140).optional().default(''),
  description: z.string().max(400).optional().default(''),
  monthlyPriceCents: z.number().int().min(0),
  yearlyPriceCents: z.number().int().min(0),
  trialDays: z.number().int().min(0).max(90),
  maxForms: z.number().int().min(1),
  maxSubmissionsPerMonth: z.number().int().min(1),
  maxEmailsPerMonth: z.number().int().min(0),
  maxApiRequestsPerMin: z.number().int().min(1),
  maxStorageMb: z.number().int().min(1),
  isActive: z.boolean().optional().default(true),
  isArchived: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(10),
  features: z.object({
    advancedBuilder: z.boolean(),
    jsIntegration: z.boolean(),
    restApi: z.boolean(),
    webhooks: z.boolean(),
    customEmailTemplates: z.boolean(),
    multipleRecipients: z.boolean(),
    removeBranding: z.boolean(),
    teamMembers: z.boolean(),
    prioritySupport: z.boolean(),
    advancedAnalytics: z.boolean(),
  }),
});

adminRouter.get(
  '/plans',
  requireAdminPermission('admin.billing.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const plans = await db
        .select()
        .from(subscriptionPlans)
        .orderBy(subscriptionPlans.sortOrder, subscriptionPlans.id);

      const subCounts = await db
        .select({ planId: subscriptions.planId, total: count() })
        .from(subscriptions)
        .groupBy(subscriptions.planId);
      const map = new Map(subCounts.map((r) => [r.planId, Number(r.total)]));

      return res.json({
        plans: plans.map((p) => ({ ...p, subscriberCount: map.get(p.id) || 0 })),
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load subscription plans' });
    }
  }
);

adminRouter.post(
  '/plans',
  requireAdminPermission('admin.plans.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = planSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid plan fields', details: parsed.error.flatten() });
      }
      const [created] = await db.insert(subscriptionPlans).values(parsed.data).returning();
      await recordAdminAudit(req, 'plan.created', 'subscription_plan', created.id, {
        name: created.name,
        monthlyPriceCents: created.monthlyPriceCents,
      });
      return res.status(201).json({ plan: created });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to create plan' });
    }
  }
);

adminRouter.put(
  '/plans/:id',
  requireAdminPermission('admin.plans.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const planId = Number(req.params.id);
      const parsed = planSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid plan fields', details: parsed.error.flatten() });
      }
      const [updated] = await db
        .update(subscriptionPlans)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(subscriptionPlans.id, planId))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Plan not found' });

      await recordAdminAudit(req, 'plan.updated', 'subscription_plan', planId, {
        name: updated.name,
        monthlyPriceCents: updated.monthlyPriceCents,
        maxForms: updated.maxForms,
        maxSubmissionsPerMonth: updated.maxSubmissionsPerMonth,
      });
      return res.json({ plan: updated });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update plan' });
    }
  }
);

adminRouter.delete(
  '/plans/:id',
  requireAdminPermission('admin.plans.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const planId = Number(req.params.id);
      const [subCount] = await db
        .select({ total: count() })
        .from(subscriptions)
        .where(eq(subscriptions.planId, planId));

      if (Number(subCount?.total || 0) > 0) {
        await db
          .update(subscriptionPlans)
          .set({ isArchived: true, isActive: false, updatedAt: new Date() })
          .where(eq(subscriptionPlans.id, planId));
        await recordAdminAudit(req, 'plan.archived', 'subscription_plan', planId);
        return res.json({ archived: true, message: 'Plan has active subscribers and was archived.' });
      }

      await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
      await recordAdminAudit(req, 'plan.deleted', 'subscription_plan', planId);
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete/archive plan' });
    }
  }
);

// 9. Subscriptions, Transactions, Invoices, Usage Reset
adminRouter.get(
  '/subscriptions',
  requireAdminPermission('admin.billing.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const periodMonth = getCurrentPeriodMonth();
      const rows = await db
        .select({
          id: subscriptions.id,
          userId: users.id,
          customerEmail: users.email,
          customerName: users.displayName,
          planId: subscriptionPlans.id,
          planName: subscriptionPlans.name,
          monthlyPriceCents: subscriptionPlans.monthlyPriceCents,
          yearlyPriceCents: subscriptionPlans.yearlyPriceCents,
          maxSubmissionsPerMonth: subscriptionPlans.maxSubmissionsPerMonth,
          maxEmailsPerMonth: subscriptionPlans.maxEmailsPerMonth,
          status: subscriptions.status,
          billingCycle: subscriptions.billingCycle,
          provider: subscriptions.provider,
          trialEndsAt: subscriptions.trialEndsAt,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
          submissionsCount: subscriptionUsage.submissionsCount,
          emailsSentCount: subscriptionUsage.emailsSentCount,
          apiRequestsCount: subscriptionUsage.apiRequestsCount,
          storageBytes: subscriptionUsage.storageBytes,
        })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .leftJoin(
          subscriptionUsage,
          and(
            eq(subscriptionUsage.userId, users.id),
            eq(subscriptionUsage.periodMonth, periodMonth)
          )
        )
        .orderBy(desc(subscriptions.updatedAt));

      return res.json({ subscriptions: rows });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load subscriptions' });
    }
  }
);

adminRouter.patch(
  '/subscriptions/:id',
  requireAdminPermission('admin.billing.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const subId = Number(req.params.id);
      const { planId, status, billingCycle, cancelAtPeriodEnd } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (planId) updates.planId = Number(planId);
      if (['active', 'trialing', 'past_due', 'canceled', 'expired'].includes(status)) {
        updates.status = status;
      }
      if (billingCycle === 'monthly' || billingCycle === 'yearly') {
        updates.billingCycle = billingCycle;
      }
      if (typeof cancelAtPeriodEnd === 'boolean') {
        updates.cancelAtPeriodEnd = cancelAtPeriodEnd;
      }

      const [updated] = await db
        .update(subscriptions)
        .set(updates)
        .where(eq(subscriptions.id, subId))
        .returning();

      await recordAdminAudit(req, 'subscription.updated', 'subscription', subId, updates);
      return res.json({ subscription: updated });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update subscription' });
    }
  }
);

adminRouter.get(
  '/transactions',
  requireAdminPermission('admin.billing.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select({
          id: payments.id,
          userId: payments.userId,
          customerEmail: users.email,
          provider: payments.provider,
          providerPaymentId: payments.providerPaymentId,
          amountCents: payments.amountCents,
          currency: payments.currency,
          status: payments.status,
          refundStatus: payments.refundStatus,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .innerJoin(users, eq(payments.userId, users.id))
        .orderBy(desc(payments.createdAt))
        .limit(200);

      return res.json({ transactions: rows });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load transactions' });
    }
  }
);

adminRouter.post(
  '/transactions/:id/refund',
  requireAdminPermission('admin.billing.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const paymentId = Number(req.params.id);
      const [updated] = await db
        .update(payments)
        .set({ status: 'refunded', refundStatus: 'full' })
        .where(eq(payments.id, paymentId))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Transaction not found' });
      await recordAdminAudit(req, 'payment.refunded', 'payment', paymentId);
      return res.json({ payment: updated });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to process refund record' });
    }
  }
);

adminRouter.get(
  '/invoices',
  requireAdminPermission('admin.billing.view'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          customerEmail: users.email,
          customerName: users.displayName,
          amountCents: invoices.amountCents,
          currency: invoices.currency,
          status: invoices.status,
          periodStart: invoices.periodStart,
          periodEnd: invoices.periodEnd,
          issuedAt: invoices.issuedAt,
        })
        .from(invoices)
        .innerJoin(users, eq(invoices.userId, users.id))
        .orderBy(desc(invoices.issuedAt))
        .limit(200);

      const [templateRow] = await db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, 'invoice_template'))
        .limit(1);

      return res.json({
        invoices: rows,
        invoiceTemplate: {
          ...DEFAULT_INVOICE_TEMPLATE,
          ...((templateRow?.value as Record<string, unknown>) || {}),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load invoices' });
    }
  }
);

adminRouter.get(
  '/invoices/:id',
  requireAdminPermission('admin.billing.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const invoiceId = Number(req.params.id);
      if (!Number.isInteger(invoiceId)) return res.status(400).json({ error: 'Invalid invoice ID' });

      const rows = await db
        .select({
          invoice: invoices,
          customerId: users.id,
          customerEmail: users.email,
          customerName: users.displayName,
        })
        .from(invoices)
        .innerJoin(users, eq(invoices.userId, users.id))
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
      const { invoice: inv, customerId, customerEmail, customerName } = rows[0];

      const [payment] = inv.paymentId
        ? await db.select().from(payments).where(eq(payments.id, inv.paymentId)).limit(1)
        : [];

      const [templateRow] = await db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, 'invoice_template'))
        .limit(1);

      const template = {
        ...DEFAULT_INVOICE_TEMPLATE,
        ...((templateRow?.value as Record<string, unknown>) || {}),
      };

      const meta = (payment?.metadata || {}) as Record<string, any>;
      let planName = String(meta.planName || '');
      let billingCycle = String(meta.billingCycle || 'monthly');
      let planDesc = 'BrosDev Forms SaaS Subscription';

      if (!planName && inv.subscriptionId) {
        const subRows = await db
          .select({
            planName: subscriptionPlans.name,
            planDesc: subscriptionPlans.description,
            billingCycle: subscriptions.billingCycle,
          })
          .from(subscriptions)
          .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
          .where(eq(subscriptions.id, inv.subscriptionId))
          .limit(1);
        if (subRows[0]) {
          planName = subRows[0].planName;
          planDesc = subRows[0].planDesc || planDesc;
          billingCycle = subRows[0].billingCycle;
        }
      }

      return res.json({
        invoice: {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountCents: inv.amountCents,
          currency: inv.currency,
          status: inv.status,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          issuedAt: inv.issuedAt,
          customer: {
            id: customerId,
            email: customerEmail,
            displayName: customerName || customerEmail,
          },
          plan: {
            name: planName || 'Subscription',
            billingCycle,
            description: planDesc,
          },
          payment: payment
            ? {
                provider: payment.provider,
                providerPaymentId: payment.providerPaymentId,
                status: payment.status,
                refundStatus: payment.refundStatus,
                paymentMethod: String(meta.paymentMethod || 'card'),
                cardBrand: meta.cardBrand ? String(meta.cardBrand) : undefined,
                last4: meta.last4 ? String(meta.last4) : undefined,
                cardholderName: meta.cardholderName ? String(meta.cardholderName) : undefined,
                billingZip: meta.billingZip ? String(meta.billingZip) : undefined,
                upiId: meta.upiId ? String(meta.upiId) : undefined,
                bankName: meta.bankName ? String(meta.bankName) : undefined,
                createdAt: payment.createdAt,
              }
            : null,
          template,
        },
      });
    } catch (err) {
      console.error('GET /api/admin/invoices/:id failed:', err);
      return res.status(500).json({ error: 'Failed to load invoice details' });
    }
  }
);

const invoiceTemplateSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  companyTagline: z.string().trim().max(160).optional().default(''),
  companyAddress: z.string().trim().max(300).optional().default(''),
  supportEmail: z.string().trim().email(),
  website: z.string().trim().max(160).optional().default(''),
  taxId: z.string().trim().max(80).optional().default(''),
  taxRatePct: z.number().min(0).max(50),
  invoicePrefix: z.string().trim().min(1).max(12),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#A90706'),
  paymentTerms: z.string().trim().max(140).optional().default('Paid on receipt via BrosDev Pay'),
  footerNotes: z.string().trim().max(600).optional().default(''),
});

adminRouter.put(
  '/invoice-template',
  requireAdminPermission('admin.billing.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = invoiceTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid invoice template settings.' });
      }
      const val = {
        ...parsed.data,
        invoicePrefix: parsed.data.invoicePrefix.toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'INV',
      };
      await db
        .insert(platformSettings)
        .values({ key: 'invoice_template', value: val, updatedBy: req.dbUser!.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value: val, updatedBy: req.dbUser!.id, updatedAt: new Date() },
        });
      await recordAdminAudit(req, 'invoice_template.updated', 'platform_settings', 'invoice_template', val);
      return res.json({ saved: true, invoiceTemplate: val });
    } catch (err) {
      console.error('PUT /api/admin/invoice-template failed:', err);
      return res.status(500).json({ error: 'Failed to save invoice template' });
    }
  }
);

adminRouter.post(
  '/usage/reset-all',
  requireAdminPermission('admin.billing.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const periodMonth = getCurrentPeriodMonth();
      await db
        .update(subscriptionUsage)
        .set({
          submissionsCount: 0,
          emailsSentCount: 0,
          apiRequestsCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionUsage.periodMonth, periodMonth));
      await recordAdminAudit(req, 'usage.monthly_reset_all', 'subscription_usage', periodMonth);
      return res.json({ reset: true, periodMonth });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to reset monthly usage' });
    }
  }
);

// 10. Global Settings
adminRouter.get(
  '/settings',
  requireAdminPermission('admin.settings.manage'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const rows = await db.select().from(platformSettings);
      const map: Record<string, unknown> = {};
      for (const r of rows) map[r.key] = r.value;
      return res.json({ settings: map });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load platform settings' });
    }
  }
);

adminRouter.put(
  '/settings',
  requireAdminPermission('admin.settings.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { key, value } = req.body as { key: string; value: Record<string, unknown> };
      if (!key || typeof value !== 'object') {
        return res.status(400).json({ error: 'Valid setting key and value object required' });
      }
      await db
        .insert(platformSettings)
        .values({ key, value, updatedBy: req.dbUser!.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value, updatedBy: req.dbUser!.id, updatedAt: new Date() },
        });
      await recordAdminAudit(req, 'platform_settings.updated', 'platform_settings', key, value);
      return res.json({ saved: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save platform setting' });
    }
  }
);

// 11. Admin Roles & RBAC Management (Super Admin only)
adminRouter.get(
  '/roles',
  requireAdminPermission('admin.roles.manage'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const roles = await db.select().from(adminRoles);
      const perms = await db.select().from(adminPermissions);
      const members = await db
        .select({
          id: adminUsers.id,
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
          roleId: adminRoles.id,
          roleSlug: adminRoles.slug,
          roleName: adminRoles.name,
          isActive: adminUsers.isActive,
          totpEnabled: adminUsers.totpEnabled,
          lastAdminLoginAt: adminUsers.lastAdminLoginAt,
        })
        .from(adminUsers)
        .innerJoin(users, eq(adminUsers.userId, users.id))
        .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
        .orderBy(adminUsers.id);

      return res.json({
        roles: roles.map((r) => ({
          ...r,
          permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permissionKey),
        })),
        members,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load admin roles' });
    }
  }
);

adminRouter.post(
  '/roles/assign',
  requireAdminPermission('admin.roles.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const roleSlug = String(req.body.roleSlug || '').trim();
      const [targetUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!targetUser) {
        return res
          .status(404)
          .json({ error: 'No registered user found with that email. User must sign in first.' });
      }
      const [role] = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.slug, roleSlug))
        .limit(1);
      if (!role) return res.status(400).json({ error: 'Invalid admin role' });

      await db
        .insert(adminUsers)
        .values({ userId: targetUser.id, roleId: role.id, isActive: true })
        .onConflictDoUpdate({
          target: adminUsers.userId,
          set: { roleId: role.id, isActive: true },
        });

      await recordAdminAudit(req, 'admin_role.assigned', 'user', targetUser.id, {
        email,
        roleSlug,
      });
      return res.json({ assigned: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to assign admin role' });
    }
  }
);

adminRouter.delete(
  '/roles/:adminUserId',
  requireAdminPermission('admin.roles.manage'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.adminUserId);
      if (id === req.adminContext!.adminUserId) {
        return res.status(400).json({ error: 'You cannot revoke your own Super Admin access.' });
      }
      await db.delete(adminUsers).where(eq(adminUsers.id, id));
      await recordAdminAudit(req, 'admin_role.revoked', 'admin_user', id);
      return res.json({ revoked: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to revoke admin access' });
    }
  }
);

// 12. Admin Audit Logs
adminRouter.get(
  '/audit-logs',
  requireAdminPermission('admin.audit.view'),
  async (req: AuthRequest, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      const logs = await db
        .select()
        .from(adminAuditLogs)
        .where(
          q
            ? or(
                ilike(adminAuditLogs.adminEmail, `%${q}%`),
                ilike(adminAuditLogs.action, `%${q}%`),
                ilike(adminAuditLogs.targetType, `%${q}%`)
              )
            : undefined
        )
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(200);

      return res.json({ logs });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load audit logs' });
    }
  }
);
