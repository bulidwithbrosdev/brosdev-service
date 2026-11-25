export type EmailCampaignType =
  | 'newsletter'
  | 'announcement'
  | 'promotional'
  | 'transactional_update';

export type EmailCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'paused'
  | 'canceled'
  | 'failed';

export type EmailAudienceType = 'list' | 'segment' | 'all_subscribed';

export type EmailBlockType =
  | 'header'
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'gallery'
  | 'divider'
  | 'spacer'
  | 'social'
  | 'footer';

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  // Header
  logoUrl?: string;
  brandName?: string;
  tagline?: string;
  // Heading / Text
  title?: string;
  headingLevel?: 'h1' | 'h2' | 'h3';
  body?: string;
  align?: 'left' | 'center' | 'right';
  // Button
  buttonLabel?: string;
  buttonUrl?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonRadius?: number;
  // Image
  imageUrl?: string;
  imageAlt?: string;
  imageLink?: string;
  caption?: string;
  // Gallery (2-column)
  galleryItems?: Array<{
    imageUrl: string;
    alt: string;
    caption: string;
    linkUrl: string;
  }>;
  // Divider / Spacer
  dividerColor?: string;
  spacerHeight?: number;
  // Social links
  socialLinks?: Array<{
    label: string;
    url: string;
  }>;
  // Footer
  companyName?: string;
  companyAddress?: string;
  footerNote?: string;
  unsubscribeLabel?: string;
  // Visual padding/colors
  backgroundColor?: string;
  textColor?: string;
  paddingY?: number;
}

export interface EmailDesignSettings {
  backgroundColor: string;
  contentBackgroundColor: string;
  primaryColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
  maxWidth: number;
  borderRadius: number;
}

export interface EmailCampaignStats {
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  failed: number;
}

export interface EmailCampaignRecord {
  id: string;
  ownerUid: string;
  projectKey?: string;
  name: string;
  campaignType: EmailCampaignType;
  status: EmailCampaignStatus;
  subject: string;
  previewText: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  audienceType: EmailAudienceType;
  listIds: string[];
  segmentId?: string;
  templateId?: string;
  blocks: EmailBlock[];
  designSettings: EmailDesignSettings;
  compiledHtml?: string;
  compiledText?: string;
  scheduledAt?: string;
  timezone?: string;
  sentAt?: string;
  recipientCount: number;
  stats: EmailCampaignStats;
  removeBranding: boolean;
  abuseSuspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignVersionRecord {
  id: string;
  campaignId: string;
  ownerUid: string;
  version: number;
  subject: string;
  blocks: EmailBlock[];
  designSettings: EmailDesignSettings;
  createdAt: string;
}

export interface EmailListRecord {
  id: string;
  ownerUid: string;
  name: string;
  description: string;
  doubleOptIn: boolean;
  defaultSenderEmail?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export type EmailSubscriberStatus =
  | 'subscribed'
  | 'pending'
  | 'unsubscribed'
  | 'bounced'
  | 'complained'
  | 'suppressed';

export interface EmailSubscriberRecord {
  id: string;
  ownerUid: string;
  email: string;
  firstName: string;
  lastName: string;
  status: EmailSubscriberStatus;
  listIds: string[];
  tags: string[];
  customFields: Record<string, string>;
  source: string;
  consentConfirmed: boolean;
  consentNote?: string;
  subscribedAt: string;
  unsubscribedAt?: string;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SegmentRuleField = 'listId' | 'status' | 'tag' | 'source' | 'emailDomain' | 'customField';
export type SegmentRuleOperator = 'equals' | 'not_equals' | 'contains';

export interface SegmentRule {
  id: string;
  field: SegmentRuleField;
  customKey?: string;
  operator: SegmentRuleOperator;
  value: string;
}

export interface EmailSegmentRecord {
  id: string;
  ownerUid: string;
  name: string;
  description: string;
  matchType: 'all' | 'any';
  rules: SegmentRule[];
  createdAt: string;
  updatedAt: string;
}

export type EmailTemplateCategory =
  | 'newsletter'
  | 'product_announcement'
  | 'product_launch'
  | 'company_update'
  | 'maintenance_notification'
  | 'event_invitation'
  | 'welcome_email'
  | 'promotional_campaign'
  | 'feature_release'
  | 'weekly_digest';

export interface EmailTemplateRecord {
  id: string;
  ownerUid: string;
  name: string;
  category: EmailTemplateCategory;
  description: string;
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
  designSettings: EmailDesignSettings;
  isBuiltIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AutomationTriggerType =
  | 'new_subscriber'
  | 'subscriber_confirmed'
  | 'added_to_list'
  | 'new_customer'
  | 'product_announcement'
  | 'scheduled_newsletter';

export type AutomationActionType =
  | 'send_welcome'
  | 'send_confirmation'
  | 'send_announcement'
  | 'send_followup'
  | 'add_tag'
  | 'update_status';

export interface EmailAutomationRecord {
  id: string;
  ownerUid: string;
  name: string;
  description: string;
  triggerType: AutomationTriggerType;
  targetListId?: string;
  status: 'active' | 'paused' | 'draft';
  triggeredCount: number;
  sentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAutomationStepRecord {
  id: string;
  automationId: string;
  ownerUid: string;
  stepOrder: number;
  actionType: AutomationActionType;
  delayMinutes: number;
  subject: string;
  templateId?: string;
  tagValue?: string;
  statusValue?: string;
  blocks?: EmailBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailScheduledJobRecord {
  id: string;
  ownerUid: string;
  jobType: 'campaign_send' | 'automation_step';
  campaignId?: string;
  automationId?: string;
  stepId?: string;
  subscriberEmail?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled' | 'paused';
  scheduledAt: string;
  timezone: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  processedCount: number;
  failedCount: number;
  lastError: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type EmailDeliveryEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
  | 'failed';

export interface EmailDeliveryEventRecord {
  id: string;
  ownerUid: string;
  campaignId: string;
  subscriberEmail: string;
  providerMessageId: string;
  eventType: EmailDeliveryEventType;
  linkUrl?: string;
  errorMessage?: string;
  occurredAt: string;
  createdAt: string;
}

export interface EmailSuppressionRecord {
  id: string;
  ownerUid: string;
  email: string;
  reason: 'unsubscribed' | 'hard_bounce' | 'spam_complaint' | 'manual';
  source: string;
  campaignId?: string;
  createdAt: string;
}

export interface ResendDnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

export interface EmailSenderDomainRecord {
  id: string;
  ownerUid: string;
  domain: string;
  resendDomainId?: string;
  status: 'pending' | 'verified' | 'failed' | 'not_started';
  region?: string;
  dnsRecords: ResendDnsRecord[];
  lastCheckedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdditionalSenderIdentity {
  id: string;
  name: string;
  email: string;
  replyTo: string;
}

export interface EmailSenderSettingsRecord {
  ownerUid: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  companyName: string;
  companyWebsite: string;
  companyLogoUrl: string;
  companyAddress: string;
  defaultFooter: string;
  additionalIdentities: AdditionalSenderIdentity[];
  doubleOptInDefault: boolean;
  campaignSuspended: boolean;
  suspensionReason?: string;
  updatedAt: string;
}

export interface EmailCampaignUsageRecord {
  id: string;
  ownerUid: string;
  monthKey: string;
  emailsSent: number;
  campaignsSent: number;
  bounces: number;
  complaints: number;
  updatedAt: string;
}

export interface EmailWebhookEventRecord {
  id: string;
  ownerUid: string;
  campaignId: string;
  provider: 'resend';
  eventType: string;
  providerMessageId: string;
  recipientEmail: string;
  status: 'processed' | 'ignored' | 'failed';
  receivedAt: string;
  createdAt: string;
}

export const DEFAULT_DESIGN_SETTINGS: EmailDesignSettings = {
  backgroundColor: '#F5F5F5',
  contentBackgroundColor: '#FFFFFF',
  primaryColor: '#A90706',
  textColor: '#111111',
  mutedTextColor: '#555555',
  fontFamily: 'Arial, Helvetica, sans-serif',
  maxWidth: 600,
  borderRadius: 10,
};

export const EMPTY_CAMPAIGN_STATS: EmailCampaignStats = {
  totalRecipients: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  failed: 0,
};
