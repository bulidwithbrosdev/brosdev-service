import type { FieldType, PlanFeatures, WorkspaceMe } from '../types';

export type PlanLockKey =
  | 'formsLimit'
  | 'advancedBuilder'
  | 'jsIntegration'
  | 'customEmailTemplates'
  | 'multipleRecipients'
  | 'removeBranding'
  | 'webhooks'
  | 'advancedAnalytics'
  | 'teamMembers';

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
      'You have reached the maximum number of forms included in your current plan. Upgrade to create more forms and expand your monthly submission quota.',
    currentPlanLimits: [
      'Up to 2 forms on Free',
      '100 monthly submissions & 100 emails',
      'Basic HTML form endpoint',
    ],
    unlockedBenefits: [
      'Up to 10 forms on Starter (50 on Professional, 200 on Business)',
      '2,000+ monthly submissions & email notifications',
      'Advanced form builder fields, JavaScript Fetch & Embed widgets',
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
      'White-label delivery, webhooks, and advanced analytics',
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
      'Remove BrosDev Forms branding from outgoing submission notifications, auto-reply confirmations, thank-you pages, and embedded widgets.',
    currentPlanLimits: [
      'BrosDev Forms branding shown in email footers',
      'BrosDev Forms attribution shown on embedded widgets',
    ],
    unlockedBenefits: [
      '100% white-label emails and embeddable form widgets',
      'Dedicated per-account sender email with custom display name',
      'Multiple recipients, webhooks, and CSV exports included',
    ],
  },
  webhooks: {
    key: 'webhooks',
    title: 'Real-Time Webhooks',
    requiredPlan: 'Professional',
    requiredPlanSlug: 'professional',
    requiredPriceLabel: '$49/mo',
    freeSummary: 'Free and Starter plans store submissions in the dashboard and forward via email only.',
    description:
      'Automatically POST structured JSON payloads to your own backend, Slack, Zapier, Make, or CRM whenever a website visitor submits your form.',
    currentPlanLimits: [
      'Email routing & dashboard inbox only',
      'No automated outbound HTTP webhook triggers',
    ],
    unlockedBenefits: [
      'Real-time HTTPS JSON webhook delivery on every submission',
      'Includes submission ID, form key, origin domain, and full payload',
      'Compatible with Zapier, Make, n8n, Slack, and custom APIs',
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
      'One-click CSV export for filtered submissions',
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
      'Invite up to 15 teammates with granular Admin, Editor, and Viewer roles to build forms, manage submissions, and collaborate inside your shared workspace.',
    currentPlanLimits: [
      'Single account owner only (1 seat)',
      'No role-based team invitations or shared access controls',
    ],
    unlockedBenefits: [
      'Up to 15 team seats with Admin, Editor, and Viewer roles',
      'Direct email invitations sent from your dedicated {Account ID}-forms address',
      '200 forms, 50,000 monthly submissions/emails, and priority support',
    ],
  },
};

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
