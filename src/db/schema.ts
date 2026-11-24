import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Shared JSON type definitions
export interface FormFieldConfig {
  id: string;
  type:
    | 'short_text'
    | 'long_text'
    | 'email'
    | 'phone'
    | 'number'
    | 'dropdown'
    | 'radio'
    | 'checkbox'
    | 'date'
    | 'file'
    | 'url'
    | 'hidden'
    | 'submit'
    | 'heading'
    | 'divider';
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  width?: 'full' | 'half';
  options?: string[];
  errorMessage?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface FormEmailConfig {
  notificationsEnabled: boolean;
  recipients: string[];
  subject: string;
  senderDisplayName: string;
  replyToField: string;
  notificationTemplate: string;
  confirmationEnabled: boolean;
  autoReplyEmailField: string;
  autoReplySubject: string;
  autoReplyBody: string;
}

export interface FormSpamConfig {
  honeypotEnabled: boolean;
  honeypotField: string;
  rateLimitPerMin: number;
  requireSecretKey: boolean;
}

export interface PlanFeatures {
  advancedBuilder: boolean;
  jsIntegration: boolean;
  restApi: boolean;
  webhooks: boolean;
  customEmailTemplates: boolean;
  multipleRecipients: boolean;
  removeBranding: boolean;
  teamMembers: boolean;
  prioritySupport: boolean;
  advancedAnalytics: boolean;
}

// 1. Users table (linked to Firebase Auth UID)
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull().default(''),
    photoUrl: text('photo_url').default(''),
    status: text('status').notNull().default('active'), // active | suspended
    customFormLimit: integer('custom_form_limit'),
    customSubmissionLimit: integer('custom_submission_limit'),
    customEmailLimit: integer('custom_email_limit'),
    customRateLimit: integer('custom_rate_limit'),
    lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_status').on(table.status),
  ]
);

// 2. Forms table
export const forms = pgTable(
  'forms',
  {
    id: serial('id').primaryKey(),
    formKey: text('form_key').notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    fields: jsonb('fields').$type<FormFieldConfig[]>().notNull().default([]),
    status: text('status').notNull().default('draft'), // draft | published | inactive | suspended
    successMessage: text('success_message')
      .notNull()
      .default('Thank you! Your submission has been received.'),
    redirectUrl: text('redirect_url').notNull().default(''),
    allowedDomains: jsonb('allowed_domains').$type<string[]>().notNull().default([]),
    spamProtection: jsonb('spam_protection')
      .$type<FormSpamConfig>()
      .notNull()
      .default({
        honeypotEnabled: true,
        honeypotField: '_gotcha',
        rateLimitPerMin: 30,
        requireSecretKey: false,
      }),
    secretApiKeyHash: text('secret_api_key_hash').notNull(),
    secretApiKeyPrefix: text('secret_api_key_prefix').notNull(),
    emailConfig: jsonb('email_config').$type<FormEmailConfig>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_forms_user_id').on(table.userId),
    index('idx_forms_status').on(table.status),
  ]
);

// 3. Submissions table
export const submissions = pgTable(
  'submissions',
  {
    id: serial('id').primaryKey(),
    formId: integer('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').unique(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    files: jsonb('files')
      .$type<Array<{ field: string; originalName: string; mimeType: string; sizeBytes: number }>>()
      .notNull()
      .default([]),
    isRead: boolean('is_read').notNull().default(false),
    status: text('status').notNull().default('received'), // received | spam | failed
    emailDeliveryStatus: text('email_delivery_status').notNull().default('pending'), // pending | accepted | delivered | bounced | failed | disabled
    sourceIp: text('source_ip').notNull().default(''),
    originDomain: text('origin_domain').notNull().default(''),
    userAgent: text('user_agent').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_submissions_form_id').on(table.formId),
    index('idx_submissions_user_id').on(table.userId),
    index('idx_submissions_created_at').on(table.createdAt),
  ]
);

// 4. Admin Roles
export const adminRoles = pgTable('admin_roles', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // super_admin | admin | support
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Admin Permissions
export const adminPermissions = pgTable(
  'admin_permissions',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_admin_permissions_role_key').on(table.roleId, table.permissionKey),
  ]
);

// 6. Admin Users
export const adminUsers = pgTable(
  'admin_users',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => adminRoles.id),
    isActive: boolean('is_active').notNull().default(true),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    totpSecretEncrypted: text('totp_secret_encrypted'),
    lastAdminLoginAt: timestamp('last_admin_login_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_admin_users_role_id').on(table.roleId)]
);

// 7. Platform Settings
export const platformSettings = pgTable('platform_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 8. Email Provider Settings (Resend)
export const emailProviderSettings = pgTable('email_provider_settings', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull().default('resend'),
  apiKeyEncrypted: text('api_key_encrypted'),
  apiKeyMasked: text('api_key_masked'),
  sendingDomain: text('sending_domain').notNull().default('brosdev.xyz'),
  defaultSenderName: text('default_sender_name').notNull().default('BrosDev Forms'),
  defaultSenderEmail: text('default_sender_email').notNull().default('forms@brosdev.xyz'),
  defaultReplyTo: text('default_reply_to').notNull().default('support@brosdev.xyz'),
  defaultEmailFooter: text('default_email_footer')
    .notNull()
    .default('Sent securely via BrosDev Forms (brosdev.xyz).'),
  globalNotificationsEnabled: boolean('global_notifications_enabled').notNull().default(true),
  connectionStatus: text('connection_status').notNull().default('unconfigured'), // unconfigured | connected | error
  lastTestedAt: timestamp('last_tested_at'),
  lastError: text('last_error'),
  rateLimitLimit: integer('rate_limit_limit'),
  rateLimitRemaining: integer('rate_limit_remaining'),
  rateLimitResetAt: timestamp('rate_limit_reset_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 9. Subscription Plans
export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  audienceLabel: text('audience_label').notNull().default(''),
  description: text('description').notNull().default(''),
  monthlyPriceCents: integer('monthly_price_cents').notNull().default(0),
  yearlyPriceCents: integer('yearly_price_cents').notNull().default(0),
  trialDays: integer('trial_days').notNull().default(0),
  maxForms: integer('max_forms').notNull().default(2),
  maxSubmissionsPerMonth: integer('max_submissions_per_month').notNull().default(100),
  maxEmailsPerMonth: integer('max_emails_per_month').notNull().default(100),
  maxApiRequestsPerMin: integer('max_api_requests_per_min').notNull().default(30),
  maxStorageMb: integer('max_storage_mb').notNull().default(50),
  features: jsonb('features').$type<PlanFeatures>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isArchived: boolean('is_archived').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 10. Subscriptions
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: integer('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),
    status: text('status').notNull().default('active'), // active | trialing | past_due | canceled | expired
    billingCycle: text('billing_cycle').notNull().default('monthly'), // monthly | yearly
    provider: text('provider').notNull().default('manual'), // manual | brosdev_pay
    providerSubscriptionId: text('provider_subscription_id'),
    trialEndsAt: timestamp('trial_ends_at'),
    currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_subscriptions_plan_id').on(table.planId),
    index('idx_subscriptions_status').on(table.status),
  ]
);

// 11. Subscription Usage (per user per month YYYY-MM)
export const subscriptionUsage = pgTable(
  'subscription_usage',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    periodMonth: text('period_month').notNull(), // YYYY-MM
    formsCreated: integer('forms_created').notNull().default(0),
    submissionsCount: integer('submissions_count').notNull().default(0),
    emailsSentCount: integer('emails_sent_count').notNull().default(0),
    apiRequestsCount: integer('api_requests_count').notNull().default(0),
    storageBytes: integer('storage_bytes').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_subscription_usage_user_month').on(table.userId, table.periodMonth),
  ]
);

// 12. Payments
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: integer('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull().default('brosdev_pay'), // brosdev_pay | manual
    providerPaymentId: text('provider_payment_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('succeeded'), // succeeded | pending | failed | refunded
    refundStatus: text('refund_status').notNull().default('none'), // none | partial | full
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_payments_user_id').on(table.userId),
    index('idx_payments_status').on(table.status),
  ]
);

// 13. Invoices
export const invoices = pgTable(
  'invoices',
  {
    id: serial('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    subscriptionId: integer('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('paid'), // paid | open | void | uncollectible
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
  },
  (table) => [index('idx_invoices_user_id').on(table.userId)]
);

// 14. Email Logs
export const emailLogs = pgTable(
  'email_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    formId: integer('form_id').references(() => forms.id, { onDelete: 'set null' }),
    submissionId: integer('submission_id').references(() => submissions.id, {
      onDelete: 'set null',
    }),
    emailType: text('email_type').notNull().default('notification'), // notification | auto_reply | test
    recipientEmail: text('recipient_email').notNull(),
    senderEmail: text('sender_email').notNull(),
    subject: text('subject').notNull(),
    resendMessageId: text('resend_message_id'),
    status: text('status').notNull().default('pending'), // pending | accepted | delivered | bounced | failed
    errorDetails: text('error_details'),
    idempotencyKey: text('idempotency_key').unique(),
    retryCount: integer('retry_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_email_logs_user_id').on(table.userId),
    index('idx_email_logs_form_id').on(table.formId),
    index('idx_email_logs_status').on(table.status),
    index('idx_email_logs_resend_id').on(table.resendMessageId),
    index('idx_email_logs_created_at').on(table.createdAt),
  ]
);

// 15. API Usage Logs
export const apiUsageLogs = pgTable(
  'api_usage_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    formId: integer('form_id').references(() => forms.id, { onDelete: 'set null' }),
    endpoint: text('endpoint').notNull(),
    method: text('method').notNull(),
    statusCode: integer('status_code').notNull(),
    isRateLimited: boolean('is_rate_limited').notNull().default(false),
    isSuspicious: boolean('is_suspicious').notNull().default(false),
    ipAddress: text('ip_address').notNull().default(''),
    originDomain: text('origin_domain').notNull().default(''),
    responseTimeMs: integer('response_time_ms').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_api_usage_user_id').on(table.userId),
    index('idx_api_usage_form_id').on(table.formId),
    index('idx_api_usage_created_at').on(table.createdAt),
  ]
);

// 16. Admin Audit Logs
export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: serial('id').primaryKey(),
    adminUserId: integer('admin_user_id').references(() => users.id, { onDelete: 'set null' }),
    adminEmail: text('admin_email').notNull(),
    roleSlug: text('role_slug').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull().default(''),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text('ip_address').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_admin_audit_created_at').on(table.createdAt),
    index('idx_admin_audit_action').on(table.action),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  forms: many(forms),
  submissions: many(submissions),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  adminProfile: one(adminUsers, {
    fields: [users.id],
    references: [adminUsers.userId],
  }),
}));

export const formsRelations = relations(forms, ({ one, many }) => ({
  owner: one(users, {
    fields: [forms.userId],
    references: [users.id],
  }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  form: one(forms, {
    fields: [submissions.formId],
    references: [forms.id],
  }),
  owner: one(users, {
    fields: [submissions.userId],
    references: [users.id],
  }),
}));
