export type FieldType =
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

export interface FormFieldConfig {
  id: string;
  type: FieldType;
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

export interface FormRecord {
  id: number;
  formKey: string;
  userId: number;
  title: string;
  description: string;
  fields: FormFieldConfig[];
  status: 'draft' | 'published' | 'inactive' | 'suspended';
  successMessage: string;
  redirectUrl: string;
  allowedDomains: string[];
  spamProtection: FormSpamConfig;
  secretApiKeyPrefix: string;
  emailConfig: FormEmailConfig;
  removeBranding?: boolean;
  webhookUrl?: string;
  createdAt: string;
  updatedAt: string;
  submissionCount?: number;
  unreadCount?: number;
}

export interface SubmissionRecord {
  id: number;
  formId: number;
  formTitle: string;
  formKey: string;
  payload: Record<string, unknown>;
  files: Array<{ field: string; originalName: string; mimeType: string; sizeBytes: number }>;
  isRead: boolean;
  status: 'received' | 'spam' | 'failed';
  emailDeliveryStatus: 'pending' | 'accepted' | 'delivered' | 'bounced' | 'failed' | 'disabled';
  sourceIp: string;
  originDomain: string;
  createdAt: string;
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
  newsletterApi: boolean;
  pdfGenerator: boolean;
  customShortSlugs: boolean;
  svgQrExport: boolean;
  scopedApiKeys: boolean;
}

export interface PlanRecord {
  id: number;
  slug: string;
  name: string;
  audienceLabel: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  trialDays: number;
  maxForms: number;
  maxSubmissionsPerMonth: number;
  maxEmailsPerMonth: number;
  maxApiRequestsPerMin: number;
  maxStorageMb: number;
  maxProjects: number;
  maxApiKeys: number;
  maxWebhooks: number;
  maxNewsletterLists: number;
  maxSubscribers: number;
  maxShortLinks: number;
  maxTeamSeats: number;
  features: PlanFeatures;
  isActive: boolean;
  isArchived: boolean;
  sortOrder: number;
  subscriberCount?: number;
}

export interface InvoiceTemplateConfig {
  companyName: string;
  companyTagline: string;
  companyAddress: string;
  supportEmail: string;
  website: string;
  taxId: string;
  taxRatePct: number;
  invoicePrefix: string;
  accentColor: string;
  footerNotes: string;
  paymentTerms: string;
}

export interface InvoiceDetailRecord {
  id: number;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  customer: {
    id: number;
    email: string;
    displayName: string;
  };
  plan: {
    name: string;
    billingCycle: string;
    description: string;
  };
  payment: {
    provider: string;
    providerPaymentId: string;
    status: string;
    refundStatus: string;
    paymentMethod: string;
    cardBrand?: string;
    last4?: string;
    cardholderName?: string;
    billingZip?: string;
    upiId?: string;
    bankName?: string;
    createdAt: string;
  } | null;
  template: InvoiceTemplateConfig;
}

export interface WorkspaceMe {
  user: {
    id: number;
    uid: string;
    accountId: string;
    senderEmail: string;
    email: string;
    displayName: string;
    photoUrl: string;
    status: string;
    hasPassword: boolean;
    authProvider: 'email' | 'google';
    createdAt: string;
  };
  subscription: {
    id: number;
    planId: number;
    status: string;
    billingCycle: 'monthly' | 'yearly';
    provider: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  plan: PlanRecord | null;
  usage: {
    periodMonth: string;
    formsCreated: number;
    submissionsCount: number;
    emailsSentCount: number;
    apiRequestsCount: number;
    storageBytes: number;
  };
  limits: {
    maxForms: number;
    maxSubmissions: number;
    maxEmails: number;
    maxApiRequestsPerMin: number;
    maxStorageMb: number;
    maxProjects: number;
    maxApiKeys: number;
    maxWebhooks: number;
    maxNewsletterLists: number;
    maxSubscribers: number;
    maxShortLinks: number;
    maxTeamSeats: number;
  };
  platformEmailSender: {
    sendingDomain: string;
    defaultSenderEmail: string;
    defaultSenderName: string;
  };
  publicApiBaseUrl: string;
  admin: {
    roleSlug: 'super_admin' | 'admin' | 'support';
    roleName: string;
    permissions: string[];
    totpEnabled: boolean;
    totpVerified: boolean;
  } | null;
}

export type TeamMemberRole = 'admin' | 'editor' | 'viewer';
export type TeamMemberStatus = 'invited' | 'active' | 'revoked';

export interface TeamMemberRecord {
  id: number;
  docId: string;
  ownerUid: string;
  ownerEmail: string;
  ownerAccountId: string;
  email: string;
  displayName: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  inviteCode: string;
  invitedByEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamWorkspacePayload {
  allowed: boolean;
  maxSeats: number;
  usedSeats: number;
  accountId: string;
  senderEmail: string;
  members: TeamMemberRecord[];
  incomingInvites: TeamMemberRecord[];
}

export type DeveloperProductId =
  | 'forms'
  | 'email'
  | 'webhooks'
  | 'newsletter'
  | 'qr_generator'
  | 'url_shortener'
  | 'pdf_generator';

export interface ProjectRecord {
  id: number;
  docId: string;
  projectKey: string;
  ownerUid: string;
  name: string;
  description: string;
  allowedDomains: string[];
  verifiedDomains: string[];
  verificationToken: string;
  enabledProducts: DeveloperProductId[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export type WebhookEventType =
  | 'form.submission.created'
  | 'form.submission.updated'
  | 'newsletter.subscriber.created'
  | 'link.clicked';

export interface WebhookRecord {
  id: number;
  docId: string;
  ownerUid: string;
  projectKey: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  signingSecret: string;
  isActive: boolean;
  lastDeliveryStatus: 'idle' | 'succeeded' | 'failed';
  lastDeliveryAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryRecord {
  id: number;
  docId: string;
  deliveryId: string;
  ownerUid: string;
  webhookId: number;
  webhookName: string;
  targetUrl: string;
  eventType: string;
  status: 'succeeded' | 'failed';
  httpStatus: number;
  durationMs: number;
  attemptCount: number;
  signature: string;
  responseSnippet: string;
  payloadSnippet: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRecord {
  id: number;
  docId: string;
  ownerUid: string;
  projectKey: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  products: DeveloperProductId[];
  status: 'active' | 'revoked';
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewsletterListRecord {
  id: number;
  docId: string;
  listKey: string;
  ownerUid: string;
  projectKey: string;
  name: string;
  description: string;
  doubleOptIn: boolean;
  welcomeEmailEnabled: boolean;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface NewsletterSubscriberRecord {
  id: number;
  docId: string;
  ownerUid: string;
  listId: number;
  listKey: string;
  email: string;
  name: string;
  status: 'subscribed' | 'unsubscribed' | 'pending';
  source: string;
  unsubscribeToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShortLinkRecord {
  id: number;
  slug: string;
  ownerUid: string;
  title: string;
  targetUrl: string;
  clicks: number;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityRecord {
  id: number;
  docId: string;
  ownerUid: string;
  kind: 'qr' | 'pdf';
  title: string;
  summary: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DevServicesSummary {
  projectsCount: number;
  webhooksCount: number;
  webhookDeliveriesCount: number;
  apiKeysCount: number;
  newsletterListsCount: number;
  subscribersCount: number;
  shortLinksCount: number;
  shortLinkClicks: number;
  utilityRecordsCount: number;
}


