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
  features: PlanFeatures;
  isActive: boolean;
  isArchived: boolean;
  sortOrder: number;
  subscriberCount?: number;
}

export interface WorkspaceMe {
  user: {
    id: number;
    uid: string;
    email: string;
    displayName: string;
    photoUrl: string;
    status: string;
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
