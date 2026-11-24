import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adminPermissions,
  adminRoles,
  adminUsers,
  emailProviderSettings,
  platformSettings,
  subscriptionPlans,
  subscriptions,
  subscriptionUsage,
  users,
} from '../db/schema.ts';

const INITIAL_SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || 'gajjars614@gmail.com'
).toLowerCase();

let bootstrapPromise: Promise<void> | null = null;

export function getCurrentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function ensurePlatformBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

async function runBootstrap(): Promise<void> {
  // 1. Seed admin roles & permissions
  const roleSeeds = [
    {
      slug: 'super_admin',
      name: 'Super Admin',
      description: 'Full platform access including Resend credentials, billing plans, system settings, and role management.',
      permissions: [
        'admin.dashboard.view',
        'admin.users.view',
        'admin.users.manage',
        'admin.forms.view',
        'admin.forms.manage',
        'admin.submissions.view',
        'admin.api.view',
        'admin.api.manage',
        'admin.resend.view',
        'admin.resend.manage',
        'admin.emails.view',
        'admin.emails.retry',
        'admin.plans.manage',
        'admin.billing.view',
        'admin.billing.manage',
        'admin.settings.manage',
        'admin.roles.manage',
        'admin.audit.view',
      ],
    },
    {
      slug: 'admin',
      name: 'Admin',
      description: 'Customer, form, billing overview, email log, and support operations management.',
      permissions: [
        'admin.dashboard.view',
        'admin.users.view',
        'admin.users.manage',
        'admin.forms.view',
        'admin.forms.manage',
        'admin.submissions.view',
        'admin.api.view',
        'admin.api.manage',
        'admin.emails.view',
        'admin.emails.retry',
        'admin.billing.view',
        'admin.audit.view',
      ],
    },
    {
      slug: 'support',
      name: 'Support',
      description: 'Read-only customer, form, submission, and email log visibility for customer support.',
      permissions: [
        'admin.dashboard.view',
        'admin.users.view',
        'admin.forms.view',
        'admin.submissions.view',
        'admin.emails.view',
      ],
    },
  ];

  for (const roleSeed of roleSeeds) {
    const existing = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.slug, roleSeed.slug))
      .limit(1);

    let roleId: number;
    if (existing.length === 0) {
      const inserted = await db
        .insert(adminRoles)
        .values({
          slug: roleSeed.slug,
          name: roleSeed.name,
          description: roleSeed.description,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        roleId = inserted[0].id;
      } else {
        const refetched = await db
          .select()
          .from(adminRoles)
          .where(eq(adminRoles.slug, roleSeed.slug))
          .limit(1);
        roleId = refetched[0].id;
      }
    } else {
      roleId = existing[0].id;
    }

    for (const perm of roleSeed.permissions) {
      await db
        .insert(adminPermissions)
        .values({ roleId, permissionKey: perm })
        .onConflictDoNothing();
    }
  }

  // 2. Seed initial subscription plans (editable by admin)
  const existingPlans = await db.select().from(subscriptionPlans).limit(1);
  if (existingPlans.length === 0) {
    await db
      .insert(subscriptionPlans)
      .values([
        {
          slug: 'free',
          name: 'Free',
          audienceLabel: 'For personal projects & prototypes',
          description: 'Core form builder and HTML endpoint routing with BrosDev branding.',
          monthlyPriceCents: 0,
          yearlyPriceCents: 0,
          trialDays: 0,
          maxForms: 2,
          maxSubmissionsPerMonth: 100,
          maxEmailsPerMonth: 100,
          maxApiRequestsPerMin: 20,
          maxStorageMb: 25,
          sortOrder: 1,
          isActive: true,
          isArchived: false,
          features: {
            advancedBuilder: false,
            jsIntegration: false,
            restApi: true,
            webhooks: false,
            customEmailTemplates: false,
            multipleRecipients: false,
            removeBranding: false,
            teamMembers: false,
            prioritySupport: false,
            advancedAnalytics: false,
          },
        },
        {
          slug: 'starter',
          name: 'Starter',
          audienceLabel: 'For early-stage teams & freelancers',
          description: 'Advanced form builder, JavaScript Fetch integration, and custom email templates.',
          monthlyPriceCents: 1900,
          yearlyPriceCents: 19000,
          trialDays: 14,
          maxForms: 10,
          maxSubmissionsPerMonth: 2000,
          maxEmailsPerMonth: 2000,
          maxApiRequestsPerMin: 60,
          maxStorageMb: 250,
          sortOrder: 2,
          isActive: true,
          isArchived: false,
          features: {
            advancedBuilder: true,
            jsIntegration: true,
            restApi: true,
            webhooks: false,
            customEmailTemplates: true,
            multipleRecipients: false,
            removeBranding: false,
            teamMembers: false,
            prioritySupport: false,
            advancedAnalytics: false,
          },
        },
        {
          slug: 'professional',
          name: 'Professional',
          audienceLabel: 'For growing SaaS & agencies',
          description: 'Multiple email recipients, white-label delivery, and advanced analytics.',
          monthlyPriceCents: 4900,
          yearlyPriceCents: 49000,
          trialDays: 14,
          maxForms: 50,
          maxSubmissionsPerMonth: 10000,
          maxEmailsPerMonth: 10000,
          maxApiRequestsPerMin: 180,
          maxStorageMb: 2048,
          sortOrder: 3,
          isActive: true,
          isArchived: false,
          features: {
            advancedBuilder: true,
            jsIntegration: true,
            restApi: true,
            webhooks: true,
            customEmailTemplates: true,
            multipleRecipients: true,
            removeBranding: true,
            teamMembers: false,
            prioritySupport: true,
            advancedAnalytics: true,
          },
        },
        {
          slug: 'business',
          name: 'Business',
          audienceLabel: 'For high-volume operations',
          description: 'Enterprise quotas, team collaboration, webhooks, and custom integrations.',
          monthlyPriceCents: 12900,
          yearlyPriceCents: 129000,
          trialDays: 14,
          maxForms: 200,
          maxSubmissionsPerMonth: 50000,
          maxEmailsPerMonth: 50000,
          maxApiRequestsPerMin: 600,
          maxStorageMb: 10240,
          sortOrder: 4,
          isActive: true,
          isArchived: false,
          features: {
            advancedBuilder: true,
            jsIntegration: true,
            restApi: true,
            webhooks: true,
            customEmailTemplates: true,
            multipleRecipients: true,
            removeBranding: true,
            teamMembers: true,
            prioritySupport: true,
            advancedAnalytics: true,
          },
        },
      ])
      .onConflictDoNothing();
  }

  // 3. Seed default Resend email provider settings
  const existingEmailCfg = await db.select().from(emailProviderSettings).limit(1);
  if (existingEmailCfg.length === 0) {
    await db.insert(emailProviderSettings).values({
      provider: 'resend',
      sendingDomain: 'brosdev.xyz',
      defaultSenderName: 'BrosDev Forms',
      defaultSenderEmail: 'forms@brosdev.xyz',
      defaultReplyTo: 'support@brosdev.xyz',
      defaultEmailFooter: 'Delivered securely via BrosDev Forms (brosdev.xyz).',
      globalNotificationsEnabled: true,
      connectionStatus: process.env.RESEND_API_KEY ? 'connected' : 'unconfigured',
    });
  }

  // 4. Seed default platform settings
  const defaultSettings: Array<{ key: string; value: Record<string, unknown> }> = [
    {
      key: 'global_api_limits',
      value: {
        globalRequestsPerMin: 1200,
        perIpRequestsPerMin: 120,
        maxPayloadKb: 512,
        maxFileUploadMb: 5,
        blockSuspiciousOrigins: true,
      },
    },
    {
      key: 'platform_general',
      value: {
        platformName: 'BrosDev Forms',
        publicApiBaseUrl: 'https://api.brosdev.xyz',
        supportEmail: 'support@brosdev.xyz',
        allowNewRegistrations: true,
        requireDomainAllowlist: false,
        enforceStrictUsageLimits: true,
        upgradeNotificationThresholdPct: 80,
      },
    },
    {
      key: 'payment_gateways',
      value: {
        brosdevPayEnabled: true,
        gatewayName: 'BrosDev Pay',
        defaultCurrency: 'USD',
        acceptedBrands: ['Visa', 'Mastercard', 'American Express'],
        resendWebhookEndpoint: '/api/webhooks/resend',
      },
    },
  ];

  for (const s of defaultSettings) {
    await db
      .insert(platformSettings)
      .values({ key: s.key, value: s.value })
      .onConflictDoNothing();
  }
}

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
}) {
  await ensurePlatformBootstrapped();

  const normalizedEmail = params.email.toLowerCase();
  const [userRow] = await db
    .insert(users)
    .values({
      uid: params.uid,
      email: normalizedEmail,
      displayName: params.displayName || normalizedEmail.split('@')[0],
      photoUrl: params.photoUrl || '',
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: normalizedEmail,
        displayName: params.displayName || normalizedEmail.split('@')[0],
        photoUrl: params.photoUrl || '',
        lastLoginAt: new Date(),
      },
    })
    .returning();

  // Ensure subscription exists (defaults to Free plan)
  const existingSub = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userRow.id))
    .limit(1);

  if (existingSub.length === 0) {
    const [freePlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.slug, 'free'))
      .limit(1);

    const fallbackPlan =
      freePlan || (await db.select().from(subscriptionPlans).limit(1))[0];

    if (fallbackPlan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await db
        .insert(subscriptions)
        .values({
          userId: userRow.id,
          planId: fallbackPlan.id,
          status: 'active',
          billingCycle: 'monthly',
          provider: 'manual',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        })
        .onConflictDoNothing();
    }
  }

  // Ensure current month usage record exists
  const periodMonth = getCurrentPeriodMonth();
  await db
    .insert(subscriptionUsage)
    .values({
      userId: userRow.id,
      periodMonth,
    })
    .onConflictDoNothing();

  // Automatically provision initial Super Admin for the platform owner
  if (normalizedEmail === INITIAL_SUPER_ADMIN_EMAIL) {
    const [superAdminRole] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.slug, 'super_admin'))
      .limit(1);

    if (superAdminRole) {
      await db
        .insert(adminUsers)
        .values({
          userId: userRow.id,
          roleId: superAdminRole.id,
          isActive: true,
        })
        .onConflictDoNothing();
    }
  }

  return userRow;
}

export async function getUserUsageForMonth(userId: number, periodMonth = getCurrentPeriodMonth()) {
  const existing = await db
    .select()
    .from(subscriptionUsage)
    .where(
      and(
        eq(subscriptionUsage.userId, userId),
        eq(subscriptionUsage.periodMonth, periodMonth)
      )
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(subscriptionUsage)
    .values({ userId, periodMonth })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const refetched = await db
    .select()
    .from(subscriptionUsage)
    .where(
      and(
        eq(subscriptionUsage.userId, userId),
        eq(subscriptionUsage.periodMonth, periodMonth)
      )
    )
    .limit(1);
  return refetched[0];
}
