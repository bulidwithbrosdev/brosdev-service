export type WidgetGroup = 'ui' | 'business';

export type WidgetCategoryId =
  | 'bars_banners'
  | 'popups_modals'
  | 'social_proof'
  | 'conversion_cta'
  | 'navigation_media'
  | 'business_contact';

export type WidgetType =
  // A. Website UI Components (20)
  | 'announcement_bar'
  | 'popup_modal'
  | 'cookie_consent'
  | 'pricing_table'
  | 'faq_accordion'
  | 'testimonial_slider'
  | 'countdown_timer'
  | 'floating_contact'
  | 'review_widget'
  | 'social_share'
  | 'toast_notification'
  | 'back_to_top'
  | 'reading_progress'
  | 'sticky_cta'
  | 'feedback_widget'
  | 'image_gallery'
  | 'before_after_slider'
  | 'table_of_contents'
  | 'newsletter_popup'
  | 'exit_intent_popup'
  // B. Business Widgets (8)
  | 'whatsapp_chat'
  | 'contact_widget'
  | 'business_hours'
  | 'google_maps_embed'
  | 'appointment_cta'
  | 'customer_review_display'
  | 'lead_capture_popup'
  | 'digital_business_card';

export type WidgetStatus = 'draft' | 'published' | 'disabled';

export type WidgetEventType =
  | 'impression'
  | 'load'
  | 'click'
  | 'cta_click'
  | 'popup_open'
  | 'popup_close'
  | 'consent_accept'
  | 'consent_reject'
  | 'error';

export type WidgetDeviceType = 'desktop' | 'tablet' | 'mobile';

export interface WidgetStyleConfig {
  theme: 'light' | 'dark' | 'custom';
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  buttonTextColor: string;
  borderColor: string;
  fontFamily: string;
  fontSizePx: number;
  width: string;
  maxWidthPx: number;
  height: string;
  paddingPx: number;
  marginPx: number;
  borderRadiusPx: number;
  shadow: 'none' | 'sm' | 'md' | 'lg';
  alignment: 'left' | 'center' | 'right';
  position:
    | 'inline'
    | 'top'
    | 'bottom'
    | 'bottom-right'
    | 'bottom-left'
    | 'top-right'
    | 'top-left'
    | 'center';
  animation: 'none' | 'fade' | 'slide' | 'scale';
  overlayOpacity: number;
}

export interface WidgetVisibilityConfig {
  showOnDesktop: boolean;
  showOnTablet: boolean;
  showOnMobile: boolean;
  dismissible: boolean;
  displayFrequency: 'always' | 'once_per_session' | 'once_per_day' | 'once_ever';
  triggerDelaySec: number;
  scrollTriggerPct: number;
  exitIntent: boolean;
  startDate: string;
  endDate: string;
}

export interface WidgetConfiguration {
  schemaVersion: number;
  content: Record<string, unknown>;
  style: WidgetStyleConfig;
  visibility: WidgetVisibilityConfig;
  customCss: string;
  showBranding: boolean;
}

export interface WidgetRecord {
  id: number;
  docId: string;
  publicId: string;
  ownerUid: string;
  projectKey: string;
  name: string;
  type: WidgetType;
  group: WidgetGroup;
  category: WidgetCategoryId;
  status: WidgetStatus;
  version: number;
  publishedVersion: number;
  configuration: WidgetConfiguration;
  publishedConfiguration?: WidgetConfiguration | null;
  domainRestrictionEnabled: boolean;
  allowedDomains: string[];
  allowSubdomains: boolean;
  totalViews: number;
  totalClicks: number;
  lastLoadedAt: string;
  abuseFlagged: boolean;
  abuseReason: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export interface WidgetVersionRecord {
  id: number;
  docId: string;
  widgetId: number;
  widgetDocId: string;
  publicId: string;
  ownerUid: string;
  version: number;
  label: string;
  action: 'publish' | 'draft_snapshot' | 'restore';
  configuration: WidgetConfiguration;
  createdAt: string;
}

export interface WidgetDomainRecord {
  id: number;
  docId: string;
  ownerUid: string;
  widgetId: number;
  publicId: string;
  domain: string;
  allowSubdomains: boolean;
  verified: boolean;
  verificationToken: string;
  lastLoadedAt: string;
  status: 'active' | 'pending' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface WidgetDailyStatRecord {
  docId: string;
  publicId: string;
  widgetId: number;
  ownerUid: string;
  dateKey: string; // YYYY-MM-DD
  impressions: number;
  loads: number;
  uniqueVisitors: number;
  clicks: number;
  ctaClicks: number;
  popupOpens: number;
  popupCloses: number;
  consentAccepts: number;
  consentRejects: number;
  errors: number;
  desktopCount: number;
  tabletCount: number;
  mobileCount: number;
  updatedAt: string;
}

export interface WidgetAnalyticsOverview {
  totalViews: number;
  totalLoads: number;
  uniqueVisitors: number;
  totalClicks: number;
  ctaConversions: number;
  engagementRate: number;
  conversionRate: number;
  popupOpens: number;
  popupCloses: number;
  consentAccepts: number;
  consentRejects: number;
  errors: number;
  devices: {
    desktop: number;
    tablet: number;
    mobile: number;
  };
  dailySeries: Array<{
    date: string;
    views: number;
    uniqueVisitors: number;
    clicks: number;
    conversions: number;
  }>;
  topWidgets: Array<{
    publicId: string;
    widgetId: number;
    name: string;
    type: WidgetType;
    status: WidgetStatus;
    views: number;
    clicks: number;
    conversions: number;
    engagementRate: number;
  }>;
}

export type WidgetSchemaFieldType =
  | 'text'
  | 'textarea'
  | 'url'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'string_list'
  | 'json_list';

export interface WidgetSchemaField {
  key: string;
  label: string;
  type: WidgetSchemaFieldType;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  itemShape?: Array<{ key: string; label: string; type: 'text' | 'textarea' | 'url' | 'number' | 'boolean' }>;
}

export interface WidgetDefinition {
  type: WidgetType;
  name: string;
  group: WidgetGroup;
  category: WidgetCategoryId;
  shortDescription: string;
  useCase: string;
  supportsHostedPage: boolean;
  defaultConfig: WidgetConfiguration;
  contentFields: WidgetSchemaField[];
  integrationTips: string[];
}
