import type { FieldType, PlanFeatures, PlanRecord, WorkspaceMe } from '../types';

export type PlanLockKey =
  | 'formsLimit'
  | 'advancedBuilder'
  | 'jsIntegration'
  | 'customEmailTemplates'
  | 'multipleRecipients'
  | 'removeBranding'
  | 'webhooks'
  | 'webhooksLimit'
  | 'advancedAnalytics'
  | 'teamMembers'
  | 'projectsLimit'
  | 'apiKeysLimit'
  | 'scopedApiKeys'
  | 'newsletterApi'
  | 'newsletterLimit'
  | 'newsletterExport'
  | 'shortLinksLimit'
  | 'customShortSlugs'
  | 'pdfGenerator';

export const BUSINESS_TEAM_SEATS = 15;

export const ADVANCED_FIELD_TYPES: FieldType[] = [
  'dropdown',
  'radio',
  'checkbox',
  'date',
  'url',
  'file',
  'hidden',
  'heading',
  'divider',
];

export interface PlanLockDescriptor {
  key: PlanLockKey;
  title: string;
  requiredPlan: 'Starter' | 'Professional' | 'Business';
  requiredPlanSlug: 'starter' | 'professional' | 'business';
  requiredPriceLabel: string;
  freeSummary: string;
  description: string;
  currentPlanLimits: string[];
  unlockedBenefits: string[];
}

export const PLAN_LOCK_CATALOG: Record<PlanLockKey, PlanLockDescriptor> = {
  formsLimit: {
    key: 'formsLimit',
    title: 'Form Quota Limit Reached',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free includes up to 2 active forms and 100 submissions/month.',
    description:
      'You have reached the maximum number of forms included in your current plan. Upgrade to create more forms and expand your monthly submission & email quota.',
    currentPlanLimits: [
      'Up to 2 forms on Free',
      '100 monthly submissions & 100 emails',
      'Basic HTML & REST form endpoints',
    ],
    unlockedBenefits: [
      'Up to 10 forms on Starter (50 on Professional, 200 on Business)',
      '2,000+ monthly submissions & email notifications',
      'Advanced form builder fields, JavaScript Fetch & Embed widgets',
    ],
  },
  projectsLimit: {
    key: 'projectsLimit',
    title: 'Project Quota Limit Reached',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free includes 1 workspace project and website domain container.',
    description:
      'Organize multiple websites, staging environments, and client domains with isolated verification tokens and product toggles by upgrading your plan.',
    currentPlanLimits: [
      '1 workspace project on Free',
      'Single domain container for all endpoints',
    ],
    unlockedBenefits: [
      'Up to 3 projects on Starter (15 on Professional, 50 on Business)',
      'Dedicated DNS TXT verification token per website project',
      'Project-scoped API keys and per-project product toggles',
    ],
  },
  advancedBuilder: {
    key: 'advancedBuilder',
    title: 'Advanced Form Builder & Controls',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free includes core inputs (Text, Email, Phone, Number, Textarea) and basic honeypot spam protection.',
    description:
      'Dropdowns, radio/checkbox groups, file uploads, hidden fields, custom validation rules, redirect URLs, domain allowlists, and API key enforcement require Starter or higher.',
    currentPlanLimits: [
      'Basic fields only (Short Text, Long Text, Email, Phone, Number)',
      'Default success message (no custom redirect URL)',
      'Standard honeypot protection only',
    ],
    unlockedBenefits: [
      'All 15 field types including Dropdown, Radio, Checkbox, File Upload & Date',
      'Custom validation rules (min/max length, numeric bounds, custom errors)',
      'Custom redirect URLs, allowed origin domains, and X-API-Key enforcement',
    ],
  },
  jsIntegration: {
    key: 'jsIntegration',
    title: 'JavaScript Fetch & Embeddable Widget',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free supports standard HTML <form action="..."> and REST API submission endpoints.',
    description:
      'Unlock asynchronous JavaScript Fetch snippets and drop-in zero-dependency Embed Code widgets to render styled BrosDev forms inside any website.',
    currentPlanLimits: [
      'Standard HTML <form> endpoint only',
      'REST API JSON endpoint',
      'Embed script & JS Fetch snippets locked',
    ],
    unlockedBenefits: [
      'Async JavaScript Fetch integration with inline validation states',
      '1-line Embeddable Widget script synced live with your form builder',
      'Seamless SPA support for React, Next.js, Webflow, and WordPress',
    ],
  },
  customEmailTemplates: {
    key: 'customEmailTemplates',
    title: 'Custom Email Sender Name & Auto-Reply',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free delivers standard submission alert emails from your dedicated account sender address.',
    description:
      'Customize your sender display name, notification template style, and automated confirmation emails sent directly to every form submitter.',
    currentPlanLimits: [
      'Standard default notification email layout',
      'Default BrosDev Forms sender display name',
      'No submitter auto-reply confirmations',
    ],
    unlockedBenefits: [
      'Custom sender display name paired with your unique {Account ID}-forms email',
      'Custom notification templates & dynamic {{field}} subject interpolation',
      'Automated submitter confirmation emails immediately on submission',
    ],
  },
  newsletterApi: {
    key: 'newsletterApi',
    title: 'Newsletter Subscription API',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'The Newsletter Subscription API and audience list endpoints require the Starter plan or higher.',
    description:
      'Capture and manage newsletter subscribers directly from any website using public HTML, JavaScript Fetch, or REST endpoints with automatic duplicate protection.',
    currentPlanLimits: [
      'Newsletter lists & subscribe endpoints locked on Free',
      'No audience list management or subscriber deduplication',
    ],
    unlockedBenefits: [
      '3 audience lists & 2,500 subscribers on Starter (15 lists / 25K on Pro)',
      'Drop-in HTML, Fetch, and cURL subscribe endpoints',
      'Built-in duplicate email prevention & unsubscribe status controls',
    ],
  },
  newsletterLimit: {
    key: 'newsletterLimit',
    title: 'Newsletter Audience Quota Reached',
    requiredPlan: 'Professional',
    requiredPlanSlug: 'professional',
    requiredPriceLabel: '$49/mo',
    freeSummary: 'Starter includes up to 3 newsletter lists and 2,500 subscribers.',
    description:
      'You have reached your current newsletter list or subscriber capacity. Upgrade to Professional or Business for higher audience limits and CSV exports.',
    currentPlanLimits: [
      'Up to 3 newsletter lists on Starter',
      '2,500 subscriber capacity',
    ],
    unlockedBenefits: [
      '15 newsletter lists & 25,000 subscribers on Professional (100 lists / 250K on Business)',
      'One-click CSV subscriber exports',
      'Signed webhook notifications on newsletter.subscriber.created',
    ],
  },
  newsletterExport: {
    key: 'newsletterExport',
    title: 'Newsletter CSV Export',
    requiredPlan: 'Professional',
    requiredPlanSlug: 'professional',
    requiredPriceLabel: '$49/mo',
    freeSummary: 'Subscriber CSV exports require the Professional plan or higher.',
    description:
      'Export filtered subscriber lists to CSV for CRM sync, email campaigns, or compliance archiving with the Professional plan.',
    currentPlanLimits: [
      'Dashboard viewing & search only',
      'Bulk CSV export locked',
    ],
    unlockedBenefits: [
      'One-click CSV export for both Newsletter Subscribers and Form Submissions',
      'Up to 25,000 subscribers across 15 lists on Professional',
      'Real-time signed webhooks & white-label branding included',
    ],
  },
  apiKeysLimit: {
    key: 'apiKeysLimit',
    title: 'API Key Quota Reached',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free includes 1 workspace API key.',
    description:
      'Generate multiple isolated API keys for separate websites, CI pipelines, and environments by upgrading your BrosDev Services plan.',
    currentPlanLimits: [
      '1 active workspace API key on Free',
      'No project-level isolation or zero-downtime key rotation',
    ],
    unlockedBenefits: [
      '5 scoped API keys on Starter (25 on Professional, 100 on Business)',
      'Assign keys to specific projects and product scopes',
      'Instant one-click key rotation & revocation',
    ],
  },
  scopedApiKeys: {
    key: 'scopedApiKeys',
    title: 'Project-Scoped Keys & Key Rotation',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free supports 1 workspace-wide API key without project scoping or rotation.',
    description:
      'Bind API keys to individual website projects, restrict permission scopes, and rotate keys in one click without deleting key records.',
    currentPlanLimits: [
      'Workspace-wide key scope only on Free',
      'One-click secret rotation locked',
    ],
    unlockedBenefits: [
      'Scope keys to specific Projects and Developer Products',
      'One-click SHA-256 secret rotation with instant reveal',
      'Up to 5 keys on Starter, 25 on Professional, 100 on Business',
    ],
  },
  shortLinksLimit: {
    key: 'shortLinksLimit',
    title: 'Short Link Quota Reached',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free includes up to 5 active short links with automatic random slugs.',
    description:
      'Expand your URL Shortener capacity and unlock branded custom slugs and scheduled expiration dates.',
    currentPlanLimits: [
      'Up to 5 short links on Free',
      'Auto-generated random slugs only (no expiry dates)',
    ],
    unlockedBenefits: [
      '50 short links on Starter (250 on Professional, 1,000 on Business)',
      'Custom branded vanity slugs (/r/your-campaign)',
      'Scheduled link expiration dates & live click analytics',
    ],
  },
  customShortSlugs: {
    key: 'customShortSlugs',
    title: 'Custom Vanity Slugs & Link Expiration',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free generates random short slugs without scheduled expiration dates.',
    description:
      'Create memorable branded slugs like /r/launch-2026 and set automatic expiry dates for time-limited campaigns on Starter or higher.',
    currentPlanLimits: [
      'Randomly generated short link slugs only',
      'No scheduled link expiration timestamps',
    ],
    unlockedBenefits: [
      'Custom vanity slugs (/r/my-offer)',
      'Automatic link expiration with HTTP 410 expired status page',
      '50+ short links with persistent click counters',
    ],
  },
  pdfGenerator: {
    key: 'pdfGenerator',
    title: 'PDF Document Studio & Vector SVG QR Exports',
    requiredPlan: 'Starter',
    requiredPlanSlug: 'starter',
    requiredPriceLabel: '$19/mo',
    freeSummary: 'Free includes PNG QR Code generation; PDF document generation and SVG vector QR exports require Starter or higher.',
    description:
      'Generate structured downloadable PDF invoices, reports, and form summaries plus print-ready vector SVG QR codes with Starter or higher.',
    currentPlanLimits: [
      'Standard PNG QR Code downloads only on Free',
      'Vector SVG QR downloads locked',
      'PDF Document Generator Studio locked',
    ],
    unlockedBenefits: [
      'Structured PDF Generator (Invoices, Reports, Form Summaries)',
      'Scalable vector SVG QR code downloads alongside high-res PNG',
      'Saved utility history synced in your workspace',
    ],
  },
  multipleRecipients: {
    key: 'multipleRecipients',
    title: 'Multiple Email Recipients',
    requiredPlan: 'Professional',
    requiredPlanSlug: 'professional',
    requiredPriceLabel: '$49/mo',
    freeSummary: 'Free and Starter plans route form notifications to 1 recipient email address per form.',
    description:
      'Route every form submission simultaneously to multiple team inboxes (sales, support, operations) by upgrading to the Professional plan.',
    currentPlanLimits: [
      'Single recipient email address per form',
      'Manual forwarding required for additional stakeholders',
    ],
    unlockedBenefits: [
      'Add up to 20 simultaneous notification recipients per form',
      '10,000 monthly submissions & emails included',
      'White-label delivery, signed webhooks, and advanced analytics',
    ],
  },
  removeBranding: {
    key: 'removeBranding',
    title: 'White-Label (Remove BrosDev Branding)',
    requiredPlan: 'Professional',
    requiredPlanSlug: 'professional',
    requiredPriceLabel: '$49/mo',
    freeSummary: 'Free and Starter plans include the "Delivered via BrosDev Forms" footer on emails and embeds.',
    description:
      'Remove BrosDev branding from outgoing submission notifications, auto-reply confirmations, thank-you pages, and embedded widgets.',
    currentPlanLimits: [
      'BrosDev attribution shown in email footers',
      'BrosDev attribution shown on embedded widgets',
    ],
    unlockedBenefits: [
      '100% white-label emails and embeddable form widgets',
      'Dedicated per-account sender email with custom display name',
      'Multiple recipients, signed webhooks, and CSV exports included',
    ],
  },
  webhooks: {
    key: 'webhooks',
    title: 'HMAC-SHA256 Signed Webhook Service',
    requiredPlan: 'Professional',
    requiredPlanSlug: 'professional',
    requiredPriceLabel: '$49/mo',
    freeSummary: 'Free and Starter plans store submissions in the dashboard and forward via email only.',
    description:
      'Automatically POST cryptographically signed JSON payloads (X-BrosDev-Signature) to your backend, Slack, Zapier, Make, or CRM with full delivery logs and one-click retry.',
    currentPlanLimits: [
      'Email routing & dashboard inbox only',
      'No automated outbound HTTP webhook endpoints or delivery retries',
    ],
    unlockedBenefits: [
      'Up to 10 signed HTTPS webhook endpoints on Professional (50 on Business)',
      'HMAC-SHA256 signature verification & secret rotation',
      'Live test dispatch, HTTP status/latency logs, and 1-click retry',
    ],
  },
  webhooksLimit: {
    key: 'webhooksLimit',
    title: 'Webhook Endpoint Quota Reached',
    requiredPlan: 'Business',
    requiredPlanSlug: 'business',
    requiredPriceLabel: '$129/mo',
    freeSummary: 'Professional includes up to 10 signed webhook endpoints.',
    description:
      'Scale up to 50 signed webhook endpoints across all your production services and invite up to 15 teammates on the Business plan.',
    currentPlanLimits: [
      'Up to 10 webhook endpoints on Professional',
      'Single-owner workspace (no team seats)',
    ],
    unlockedBenefits: [
      'Up to 50 signed HTTPS webhook endpoints',
      '15 team seats with Admin, Editor, and Viewer RBAC roles',
      '50 projects, 200 forms, 50,000 monthly submissions & 600 req/min API limit',
    ],
  },
  advancedAnalytics: {
    key: 'advancedAnalytics',
    title: 'Advanced Analytics, Date Filters & CSV Export',
    requiredPlan: 'Professional',
    requiredPlanSlug: 'professional',
    requiredPriceLabel: '$49/mo',
    freeSummary: 'Free and Starter plans provide basic submission counts and recent inbox viewing.',
    description:
      'Unlock submission conversion analytics, custom date-range filtering, delivery health breakdowns, and one-click CSV data exports.',
    currentPlanLimits: [
      'Basic 14-day overview totals only',
      'No CSV export or custom date-range filtering',
    ],
    unlockedBenefits: [
      'One-click CSV export for filtered submissions & newsletter subscribers',
      'Custom From/To date range filtering across all forms',
      'Email delivery success rates and form performance metrics',
    ],
  },
  teamMembers: {
    key: 'teamMembers',
    title: 'Team Collaboration & Role Access',
    requiredPlan: 'Business',
    requiredPlanSlug: 'business',
    requiredPriceLabel: '$129/mo',
    freeSummary: 'Free, Starter, and Professional plans are single-owner workspaces.',
    description:
      'Invite up to 15 teammates with granular Admin, Editor, and Viewer roles to manage forms, webhooks, newsletters, projects, and submissions inside your shared workspace.',
    currentPlanLimits: [
      'Single account owner only (1 seat)',
      'No role-based team invitations or shared access controls',
    ],
    unlockedBenefits: [
      'Up to 15 team seats with Admin, Editor, and Viewer roles',
      'Direct email invitations sent from your dedicated {Account ID}-forms address',
      '50 projects, 200 forms, 50 webhooks, 100 API keys & 50,000 monthly submissions',
    ],
  },
};

export interface PlanQuotaDefaults {
  maxProjects: number;
  maxApiKeys: number;
  maxWebhooks: number;
  maxNewsletterLists: number;
  maxSubscribers: number;
  maxShortLinks: number;
  maxTeamSeats: number;
  features: Partial<PlanFeatures>;
}

export const TIER_DEFAULTS_BY_SLUG: Record<string, PlanQuotaDefaults> = {
  free: {
    maxProjects: 1,
    maxApiKeys: 1,
    maxWebhooks: 0,
    maxNewsletterLists: 0,
    maxSubscribers: 0,
    maxShortLinks: 5,
    maxTeamSeats: 1,
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
      newsletterApi: false,
      pdfGenerator: false,
      customShortSlugs: false,
      svgQrExport: false,
      scopedApiKeys: false,
    },
  },
  starter: {
    maxProjects: 3,
    maxApiKeys: 5,
    maxWebhooks: 0,
    maxNewsletterLists: 3,
    maxSubscribers: 2500,
    maxShortLinks: 50,
    maxTeamSeats: 1,
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
      newsletterApi: true,
      pdfGenerator: true,
      customShortSlugs: true,
      svgQrExport: true,
      scopedApiKeys: true,
    },
  },
  professional: {
    maxProjects: 15,
    maxApiKeys: 25,
    maxWebhooks: 10,
    maxNewsletterLists: 15,
    maxSubscribers: 25000,
    maxShortLinks: 250,
    maxTeamSeats: 1,
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
      newsletterApi: true,
      pdfGenerator: true,
      customShortSlugs: true,
      svgQrExport: true,
      scopedApiKeys: true,
    },
  },
  business: {
    maxProjects: 50,
    maxApiKeys: 100,
    maxWebhooks: 50,
    maxNewsletterLists: 100,
    maxSubscribers: 250000,
    maxShortLinks: 1000,
    maxTeamSeats: BUSINESS_TEAM_SEATS,
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
      newsletterApi: true,
      pdfGenerator: true,
      customShortSlugs: true,
      svgQrExport: true,
      scopedApiKeys: true,
    },
  },
};

export function hydratePlanQuotas(raw: Partial<PlanRecord>): PlanRecord {
  const slug = String(raw.slug || 'free').toLowerCase();
  const fallback = TIER_DEFAULTS_BY_SLUG[slug] || TIER_DEFAULTS_BY_SLUG.free;
  const rawFeatures = (raw.features || {}) as Partial<PlanFeatures>;

  const mergedFeatures: PlanFeatures = {
    advancedBuilder: Boolean(rawFeatures.advancedBuilder ?? fallback.features.advancedBuilder),
    jsIntegration: Boolean(rawFeatures.jsIntegration ?? fallback.features.jsIntegration),
    restApi: Boolean(rawFeatures.restApi ?? fallback.features.restApi ?? true),
    webhooks: Boolean(rawFeatures.webhooks ?? fallback.features.webhooks),
    customEmailTemplates: Boolean(
      rawFeatures.customEmailTemplates ?? fallback.features.customEmailTemplates
    ),
    multipleRecipients: Boolean(
      rawFeatures.multipleRecipients ?? fallback.features.multipleRecipients
    ),
    removeBranding: Boolean(rawFeatures.removeBranding ?? fallback.features.removeBranding),
    teamMembers: Boolean(rawFeatures.teamMembers ?? fallback.features.teamMembers),
    prioritySupport: Boolean(rawFeatures.prioritySupport ?? fallback.features.prioritySupport),
    advancedAnalytics: Boolean(
      rawFeatures.advancedAnalytics ?? fallback.features.advancedAnalytics
    ),
    newsletterApi: Boolean(rawFeatures.newsletterApi ?? fallback.features.newsletterApi),
    pdfGenerator: Boolean(rawFeatures.pdfGenerator ?? fallback.features.pdfGenerator),
    customShortSlugs: Boolean(rawFeatures.customShortSlugs ?? fallback.features.customShortSlugs),
    svgQrExport: Boolean(rawFeatures.svgQrExport ?? fallback.features.svgQrExport),
    scopedApiKeys: Boolean(rawFeatures.scopedApiKeys ?? fallback.features.scopedApiKeys),
  };

  return {
    id: Number(raw.id || 1),
    slug,
    name: String(raw.name || 'Free'),
    audienceLabel: String(raw.audienceLabel || ''),
    description: String(raw.description || ''),
    monthlyPriceCents: Number(raw.monthlyPriceCents || 0),
    yearlyPriceCents: Number(raw.yearlyPriceCents || 0),
    trialDays: Number(raw.trialDays || 0),
    maxForms: Number(raw.maxForms ?? 2),
    maxSubmissionsPerMonth: Number(raw.maxSubmissionsPerMonth ?? 100),
    maxEmailsPerMonth: Number(raw.maxEmailsPerMonth ?? 100),
    maxApiRequestsPerMin: Number(raw.maxApiRequestsPerMin ?? 20),
    maxStorageMb: Number(raw.maxStorageMb ?? 25),
    maxProjects: Number(raw.maxProjects ?? fallback.maxProjects),
    maxApiKeys: Number(raw.maxApiKeys ?? fallback.maxApiKeys),
    maxWebhooks: Number(raw.maxWebhooks ?? fallback.maxWebhooks),
    maxNewsletterLists: Number(raw.maxNewsletterLists ?? fallback.maxNewsletterLists),
    maxSubscribers: Number(raw.maxSubscribers ?? fallback.maxSubscribers),
    maxShortLinks: Number(raw.maxShortLinks ?? fallback.maxShortLinks),
    maxTeamSeats: Number(raw.maxTeamSeats ?? fallback.maxTeamSeats),
    features: mergedFeatures,
    isActive: raw.isActive !== false,
    isArchived: Boolean(raw.isArchived),
    sortOrder: Number(raw.sortOrder ?? 0),
    subscriberCount: raw.subscriberCount,
  };
}

export function formatAccountSenderEmail(accountId?: string | null, sendingDomain?: string | null): string {
  const cleanId = String(accountId || 'account')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'account';
  const cleanDomain = String(sendingDomain || 'brosdev.info')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '') || 'brosdev.info';
  return `${cleanId}-forms@${cleanDomain}`;
}

export function hasPlanFeature(
  workspace: WorkspaceMe | null | undefined,
  feature: keyof PlanFeatures
): boolean {
  return Boolean(workspace?.plan?.features?.[feature]);
}

export function isFormLimitReached(workspace: WorkspaceMe | null | undefined, currentFormCount?: number): boolean {
  if (!workspace) return false;
  const used = typeof currentFormCount === 'number' ? currentFormCount : workspace.usage.formsCreated;
  return used >= workspace.limits.maxForms;
}

export function isAdvancedFieldType(type: FieldType): boolean {
  return ADVANCED_FIELD_TYPES.includes(type);
}
