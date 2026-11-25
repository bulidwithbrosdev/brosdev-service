import type {
  WidgetCategoryId,
  WidgetConfiguration,
  WidgetDefinition,
  WidgetStyleConfig,
  WidgetType,
  WidgetVisibilityConfig,
} from './types';

export const CURRENT_SCHEMA_VERSION = 1;

export const WIDGET_CATEGORIES: Array<{
  id: WidgetCategoryId;
  label: string;
  description: string;
}> = [
  {
    id: 'bars_banners',
    label: 'Bars & Banners',
    description: 'Top/bottom announcement bars, cookie consent, sticky CTAs, and progress bars.',
  },
  {
    id: 'popups_modals',
    label: 'Popups & Modals',
    description: 'Timed popups, exit-intent offers, newsletter & lead capture overlays, and toasts.',
  },
  {
    id: 'conversion_cta',
    label: 'Pricing & Conversion',
    description: 'Pricing tables, countdown timers, appointment CTAs, and feedback collectors.',
  },
  {
    id: 'social_proof',
    label: 'Social Proof & Reviews',
    description: 'Testimonial sliders, star review badges, customer reviews, and social sharing.',
  },
  {
    id: 'navigation_media',
    label: 'Content & Media',
    description: 'FAQ accordions, image galleries, before/after sliders, table of contents, and back-to-top.',
  },
  {
    id: 'business_contact',
    label: 'Business & Contact',
    description: 'WhatsApp chat, floating contact, business hours, maps, and digital business cards.',
  },
];

export const BASE_STYLE: WidgetStyleConfig = {
  theme: 'light',
  backgroundColor: '#FFFFFF',
  textColor: '#111111',
  accentColor: '#A90706',
  buttonTextColor: '#FFFFFF',
  borderColor: '#E5E5E5',
  fontFamily: 'Plus Jakarta Sans, system-ui, -apple-system, sans-serif',
  fontSizePx: 14,
  width: '100%',
  maxWidthPx: 680,
  height: 'auto',
  paddingPx: 20,
  marginPx: 0,
  borderRadiusPx: 10,
  shadow: 'sm',
  alignment: 'left',
  position: 'inline',
  animation: 'fade',
  overlayOpacity: 0.55,
};

export const BASE_VISIBILITY: WidgetVisibilityConfig = {
  showOnDesktop: true,
  showOnTablet: true,
  showOnMobile: true,
  dismissible: true,
  displayFrequency: 'always',
  triggerDelaySec: 0,
  scrollTriggerPct: 0,
  exitIntent: false,
  startDate: '',
  endDate: '',
};

function makeConfig(
  content: Record<string, unknown>,
  styleOverrides: Partial<WidgetStyleConfig> = {},
  visibilityOverrides: Partial<WidgetVisibilityConfig> = {}
): WidgetConfiguration {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    content,
    style: { ...BASE_STYLE, ...styleOverrides },
    visibility: { ...BASE_VISIBILITY, ...visibilityOverrides },
    customCss: '',
    showBranding: true,
  };
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  // =========================================================================
  // A. WEBSITE UI COMPONENTS (20)
  // =========================================================================
  {
    type: 'announcement_bar',
    name: 'Announcement Bar',
    group: 'ui',
    category: 'bars_banners',
    shortDescription: 'Top or bottom promotional banner with CTA button and dismiss control.',
    useCase: 'Product launches, limited-time offers, maintenance notices.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Spring Release v2.4 is live',
        description: 'Ship faster with zero-dependency Shadow DOM widgets across every client site.',
        ctaLabel: 'Explore Release',
        ctaUrl: 'https://brosdev.site',
      },
      {
        backgroundColor: '#111111',
        textColor: '#FFFFFF',
        accentColor: '#A90706',
        borderColor: '#262626',
        paddingPx: 14,
        borderRadiusPx: 8,
        maxWidthPx: 1200,
        position: 'top',
        alignment: 'center',
      },
      { dismissible: true, displayFrequency: 'always' }
    ),
    contentFields: [
      { key: 'title', label: 'Headline', type: 'text', placeholder: 'New feature launched' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Short announcement copy...' },
      { key: 'ctaLabel', label: 'CTA Button Label', type: 'text', placeholder: 'Learn More' },
      { key: 'ctaUrl', label: 'CTA Destination URL', type: 'url', placeholder: 'https://example.com/offer' },
    ],
    integrationTips: [
      'Place the embed script in your site <head> or before </body> for automatic top/bottom positioning.',
      'Configure start and end dates under Rules to auto-expire seasonal campaigns.',
    ],
  },
  {
    type: 'popup_modal',
    name: 'Popup Modal',
    group: 'ui',
    category: 'popups_modals',
    shortDescription: 'High-impact overlay modal with timed, scroll, or exit-intent triggers.',
    useCase: 'Announcements, promotional discounts, product demos.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        badge: 'Limited Offer',
        title: 'Save 25% on Annual Developer Plans',
        description: 'Unlock 50 published widgets, signed webhooks, and white-label embeds with one click.',
        imageUrl: '',
        ctaLabel: 'Claim Discount',
        ctaUrl: 'https://brosdev.site/pricing',
        secondaryLabel: 'Maybe Later',
      },
      {
        maxWidthPx: 480,
        paddingPx: 28,
        borderRadiusPx: 12,
        shadow: 'lg',
        position: 'center',
        alignment: 'left',
        animation: 'scale',
        overlayOpacity: 0.6,
      },
      { triggerDelaySec: 3, scrollTriggerPct: 0, exitIntent: false, displayFrequency: 'once_per_session' }
    ),
    contentFields: [
      { key: 'badge', label: 'Kicker Text', type: 'text', placeholder: 'Special Offer' },
      { key: 'title', label: 'Popup Title', type: 'text' },
      { key: 'description', label: 'Popup Body', type: 'textarea' },
      { key: 'imageUrl', label: 'Header Image URL (Optional)', type: 'url', placeholder: 'https://...' },
      { key: 'ctaLabel', label: 'Primary CTA Label', type: 'text' },
      { key: 'ctaUrl', label: 'Primary CTA URL', type: 'url' },
      { key: 'secondaryLabel', label: 'Dismiss Button Label', type: 'text' },
    ],
    integrationTips: [
      'Use Rules -> Trigger Delay or Scroll % to avoid showing popups immediately on arrival.',
      'Set Display Frequency to "Once per session" or "Once per day" for respectful UX.',
    ],
  },
  {
    type: 'cookie_consent',
    name: 'Cookie Consent Banner',
    group: 'ui',
    category: 'bars_banners',
    shortDescription: 'GDPR/CCPA cookie consent banner with granular category preferences.',
    useCase: 'Privacy compliance, analytics opt-in, marketing consent.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'We value your privacy',
        bannerText:
          'We use essential cookies to keep this site reliable and optional analytics cookies to improve your experience.',
        acceptLabel: 'Accept All',
        rejectLabel: 'Reject Optional',
        preferencesLabel: 'Preferences',
        policyLabel: 'Privacy Policy',
        policyUrl: 'https://brosdev.site/privacy',
        consentExpiryDays: 180,
        categories: [
          { id: 'essential', name: 'Essential', description: 'Required for core navigation and security.', required: true },
          { id: 'analytics', name: 'Analytics', description: 'Helps us understand aggregate usage.', required: false },
          { id: 'marketing', name: 'Marketing', description: 'Used to personalize relevant offers.', required: false },
        ],
      },
      {
        maxWidthPx: 920,
        paddingPx: 20,
        borderRadiusPx: 10,
        shadow: 'md',
        position: 'bottom',
      },
      { dismissible: false, displayFrequency: 'once_ever' }
    ),
    contentFields: [
      { key: 'title', label: 'Banner Heading', type: 'text' },
      { key: 'bannerText', label: 'Banner Copy', type: 'textarea' },
      { key: 'acceptLabel', label: 'Accept Button Label', type: 'text' },
      { key: 'rejectLabel', label: 'Reject Button Label', type: 'text' },
      { key: 'preferencesLabel', label: 'Preferences Button Label', type: 'text' },
      { key: 'policyLabel', label: 'Policy Link Label', type: 'text' },
      { key: 'policyUrl', label: 'Privacy Policy URL', type: 'url' },
      { key: 'consentExpiryDays', label: 'Consent Expiry (Days)', type: 'number', min: 1, max: 730 },
    ],
    integrationTips: [
      'Listens for user choice and stores consent preferences in localStorage under bd_consent_{publicId}.',
      'Fires privacy-safe consent_accept and consent_reject analytics events automatically.',
    ],
  },
  {
    type: 'pricing_table',
    name: 'Pricing Table',
    group: 'ui',
    category: 'conversion_cta',
    shortDescription: 'Multi-tier SaaS pricing comparison with highlighted recommended tier.',
    useCase: 'SaaS pricing pages, service packages, retainer tiers.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        heading: 'Transparent Developer Pricing',
        subheading: 'Start free and upgrade as your websites grow.',
        tiers: [
          {
            name: 'Starter',
            price: '$19',
            period: '/mo',
            description: 'For freelancers and indie sites.',
            features: '10 Published Widgets\nCustom Colors & Typography\nHosted Preview URLs',
            ctaLabel: 'Start Starter',
            ctaUrl: 'https://brosdev.site/start',
            highlighted: false,
          },
          {
            name: 'Professional',
            price: '$49',
            period: '/mo',
            description: 'For growing SaaS and agencies.',
            features: '50 Published Widgets\nRemove BrosDev Branding\nScoped Custom CSS & Domain Lock',
            ctaLabel: 'Choose Pro',
            ctaUrl: 'https://brosdev.site/pro',
            highlighted: true,
          },
          {
            name: 'Business',
            price: '$129',
            period: '/mo',
            description: 'For multi-seat production teams.',
            features: '200 Published Widgets\n15 Team Seats (RBAC)\nPriority SLA Support',
            ctaLabel: 'Contact Sales',
            ctaUrl: 'https://brosdev.site/business',
            highlighted: false,
          },
        ],
      },
      { maxWidthPx: 980, paddingPx: 24, borderRadiusPx: 12, alignment: 'center' }
    ),
    contentFields: [
      { key: 'heading', label: 'Section Heading', type: 'text' },
      { key: 'subheading', label: 'Subheading', type: 'text' },
      {
        key: 'tiers',
        label: 'Pricing Tiers',
        type: 'json_list',
        itemShape: [
          { key: 'name', label: 'Plan Name', type: 'text' },
          { key: 'price', label: 'Price', type: 'text' },
          { key: 'period', label: 'Period', type: 'text' },
          { key: 'description', label: 'Subtitle', type: 'text' },
          { key: 'features', label: 'Features (one per line)', type: 'textarea' },
          { key: 'ctaLabel', label: 'CTA Label', type: 'text' },
          { key: 'ctaUrl', label: 'CTA URL', type: 'url' },
          { key: 'highlighted', label: 'Highlight Tier', type: 'boolean' },
        ],
      },
    ],
    integrationTips: [
      'Embed inside a full-width container on your pricing page for automatic 3-column responsive grid.',
      'Each CTA click is tracked separately in Widget Analytics.',
    ],
  },
  {
    type: 'faq_accordion',
    name: 'FAQ Accordion',
    group: 'ui',
    category: 'navigation_media',
    shortDescription: 'Expandable question-and-answer accordion with smooth accessible toggles.',
    useCase: 'Product FAQs, onboarding docs, billing questions.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        heading: 'Frequently Asked Questions',
        subheading: 'Everything you need to know about embedding BrosDev widgets.',
        allowMultipleOpen: false,
        items: [
          {
            question: 'Will the widget conflict with my website CSS?',
            answer:
              'No. Every embed script renders inside an isolated Shadow DOM root so your site stylesheets and widget styles never collide.',
          },
          {
            question: 'Can I update a widget after embedding it?',
            answer:
              'Yes. Publish a new version from the Widget Builder and every live website automatically reflects your latest published snapshot.',
          },
          {
            question: 'Does it work on WordPress, Webflow, and React?',
            answer:
              'Yes. Paste the single async script tag anywhere in HTML, WordPress Custom HTML blocks, Webflow embeds, or Next.js layouts.',
          },
        ],
      },
      { maxWidthPx: 760, paddingPx: 24, borderRadiusPx: 10 }
    ),
    contentFields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'subheading', label: 'Subheading', type: 'text' },
      { key: 'allowMultipleOpen', label: 'Allow Multiple Items Open', type: 'boolean' },
      {
        key: 'items',
        label: 'FAQ Items',
        type: 'json_list',
        itemShape: [
          { key: 'question', label: 'Question', type: 'text' },
          { key: 'answer', label: 'Answer', type: 'textarea' },
        ],
      },
    ],
    integrationTips: [
      'Ideal for inline placement in documentation, pricing, or checkout pages.',
      'Click interactions on FAQ questions are recorded as engagement clicks.',
    ],
  },
  {
    type: 'testimonial_slider',
    name: 'Testimonial Slider',
    group: 'ui',
    category: 'social_proof',
    shortDescription: 'Interactive customer quote carousel with author attribution and controls.',
    useCase: 'Landing page social proof, agency case study quotes.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        heading: 'Trusted by Engineering Teams',
        autoAdvance: false,
        items: [
          {
            quote:
              'We replaced four separate widget plugins with BrosDev. Publishing updates across twelve client sites now takes seconds.',
            author: 'Aarav Mehta',
            role: 'Founder, PixelForge Studio',
            rating: 5,
          },
          {
            quote:
              'Shadow DOM isolation saved us hours of CSS debugging on legacy WordPress themes. Cleanest embed script we have used.',
            author: 'Elena Rostova',
            role: 'Lead Frontend Engineer, CloudScale',
            rating: 5,
          },
          {
            quote:
              'Version rollback and domain restrictions gave our compliance team complete peace of mind before launch.',
            author: 'Marcus Vance',
            role: 'CTO, FinLedger Labs',
            rating: 5,
          },
        ],
      },
      { maxWidthPx: 720, paddingPx: 28, borderRadiusPx: 12, alignment: 'center' }
    ),
    contentFields: [
      { key: 'heading', label: 'Section Title', type: 'text' },
      { key: 'autoAdvance', label: 'Auto-Advance Slides', type: 'boolean' },
      {
        key: 'items',
        label: 'Testimonials',
        type: 'json_list',
        itemShape: [
          { key: 'quote', label: 'Quote', type: 'textarea' },
          { key: 'author', label: 'Author Name', type: 'text' },
          { key: 'role', label: 'Role & Company', type: 'text' },
          { key: 'rating', label: 'Rating (1-5)', type: 'number' },
        ],
      },
    ],
    integrationTips: [
      'Pair next to pricing or CTA sections for high-trust claim-to-proof adjacency.',
    ],
  },
  {
    type: 'countdown_timer',
    name: 'Countdown Timer',
    group: 'ui',
    category: 'conversion_cta',
    shortDescription: 'Live ticking countdown clock with target date, urgency copy, and CTA.',
    useCase: 'Flash sales, webinar launches, beta closing deadlines.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Founder Launch Pricing Ends Soon',
        subtitle: 'Lock in lifetime 20% savings before the public release window closes.',
        targetDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
        expiredText: 'This launch window has ended.',
        ctaLabel: 'Reserve Spot',
        ctaUrl: 'https://brosdev.site',
      },
      {
        backgroundColor: '#111111',
        textColor: '#FFFFFF',
        accentColor: '#A90706',
        borderColor: '#262626',
        maxWidthPx: 680,
        paddingPx: 28,
        borderRadiusPx: 12,
        alignment: 'center',
      }
    ),
    contentFields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'targetDate', label: 'Target Date & Time (ISO / YYYY-MM-DDTHH:MM)', type: 'text', placeholder: '2026-12-31T23:59' },
      { key: 'expiredText', label: 'Message After Expiry', type: 'text' },
      { key: 'ctaLabel', label: 'CTA Button Label', type: 'text' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'url' },
    ],
    integrationTips: [
      'Uses client clock with tabular monospace numerals so digits never jitter.',
    ],
  },
  {
    type: 'floating_contact',
    name: 'Floating Contact Button',
    group: 'ui',
    category: 'business_contact',
    shortDescription: 'Persistent corner action button expanding quick contact channels.',
    useCase: 'Support shortcut, sales inquiry launcher, quick email/phone menu.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        buttonLabel: 'Contact Us',
        greeting: 'Need help? Reach our engineering team directly.',
        email: 'support@brosdev.site',
        phone: '+1-415-555-0192',
        supportUrl: 'https://brosdev.site/support',
        supportLabel: 'Open Help Center',
      },
      {
        maxWidthPx: 320,
        paddingPx: 16,
        borderRadiusPx: 12,
        shadow: 'lg',
        position: 'bottom-right',
      }
    ),
    contentFields: [
      { key: 'buttonLabel', label: 'Launcher Label', type: 'text' },
      { key: 'greeting', label: 'Panel Greeting', type: 'textarea' },
      { key: 'email', label: 'Support Email', type: 'text' },
      { key: 'phone', label: 'Phone Number', type: 'text' },
      { key: 'supportLabel', label: 'Help Link Label', type: 'text' },
      { key: 'supportUrl', label: 'Help Center URL', type: 'url' },
    ],
    integrationTips: [
      'Set Position to Bottom-Right or Bottom-Left so it floats cleanly without obscuring content.',
    ],
  },
  {
    type: 'review_widget',
    name: 'Review Widget',
    group: 'ui',
    category: 'social_proof',
    shortDescription: 'Aggregate star rating badge and verified review score summary.',
    useCase: 'Trust strip near checkout, hero social proof, agency credibility.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        platformName: 'Verified Customer Reviews',
        averageRating: 4.9,
        totalReviews: 342,
        summaryText: 'Rated 4.9 out of 5 across agencies and SaaS founders.',
        ctaLabel: 'Read Reviews',
        ctaUrl: 'https://brosdev.site/reviews',
      },
      { maxWidthPx: 420, paddingPx: 20, borderRadiusPx: 10 }
    ),
    contentFields: [
      { key: 'platformName', label: 'Review Source Title', type: 'text' },
      { key: 'averageRating', label: 'Average Rating (0-5)', type: 'number', min: 0, max: 5 },
      { key: 'totalReviews', label: 'Review Count', type: 'number', min: 0, max: 1000000 },
      { key: 'summaryText', label: 'Summary Caption', type: 'text' },
      { key: 'ctaLabel', label: 'Link Label', type: 'text' },
      { key: 'ctaUrl', label: 'Link URL', type: 'url' },
    ],
    integrationTips: [
      'Place inside your hero footer or checkout sidebar for instant trust verification.',
    ],
  },
  {
    type: 'social_share',
    name: 'Social Share Widget',
    group: 'ui',
    category: 'social_proof',
    shortDescription: 'Clean share toolbar for X/Twitter, LinkedIn, WhatsApp, Email, and Copy Link.',
    useCase: 'Blog articles, documentation pages, product launches.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        label: 'Share this page',
        shareText: 'Check out BrosDev Developer Services — instant website widgets and APIs.',
        shareUrl: '',
        showX: true,
        showLinkedIn: true,
        showWhatsApp: true,
        showEmail: true,
        showCopyLink: true,
      },
      { maxWidthPx: 540, paddingPx: 16, borderRadiusPx: 10 }
    ),
    contentFields: [
      { key: 'label', label: 'Header Label', type: 'text' },
      { key: 'shareText', label: 'Default Share Text', type: 'textarea' },
      { key: 'shareUrl', label: 'Custom Share URL (blank = current page)', type: 'url' },
      { key: 'showX', label: 'Show X / Twitter', type: 'boolean' },
      { key: 'showLinkedIn', label: 'Show LinkedIn', type: 'boolean' },
      { key: 'showWhatsApp', label: 'Show WhatsApp', type: 'boolean' },
      { key: 'showEmail', label: 'Show Email', type: 'boolean' },
      { key: 'showCopyLink', label: 'Show Copy Link', type: 'boolean' },
    ],
    integrationTips: [
      'Leave Custom Share URL empty so the embed automatically shares the visitor’s current page URL.',
    ],
  },
  {
    type: 'toast_notification',
    name: 'Toast Notification',
    group: 'ui',
    category: 'popups_modals',
    shortDescription: 'Non-intrusive corner notification card for status alerts or live activity.',
    useCase: 'Recent signup notices, shipping alerts, quick announcements.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'New Template Pack Available',
        message: '28 modular components are ready to embed in your websites.',
        ctaLabel: 'View Library',
        ctaUrl: 'https://brosdev.site',
        autoHideSec: 0,
      },
      {
        maxWidthPx: 360,
        paddingPx: 16,
        borderRadiusPx: 10,
        shadow: 'md',
        position: 'bottom-left',
        animation: 'slide',
      },
      { dismissible: true, triggerDelaySec: 2 }
    ),
    contentFields: [
      { key: 'title', label: 'Toast Title', type: 'text' },
      { key: 'message', label: 'Message', type: 'textarea' },
      { key: 'ctaLabel', label: 'Action Label', type: 'text' },
      { key: 'ctaUrl', label: 'Action URL', type: 'url' },
      { key: 'autoHideSec', label: 'Auto-Hide After (sec, 0 = stay)', type: 'number', min: 0, max: 120 },
    ],
    integrationTips: [
      'Position in Bottom-Left or Top-Right to keep primary navigation clear.',
    ],
  },
  {
    type: 'back_to_top',
    name: 'Back to Top Button',
    group: 'ui',
    category: 'navigation_media',
    shortDescription: 'Smooth scroll-to-top button that appears after a configurable scroll threshold.',
    useCase: 'Long-form blogs, API documentation, catalog pages.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        label: 'Top',
        showLabel: true,
        scrollThresholdPx: 240,
      },
      {
        backgroundColor: '#111111',
        textColor: '#FFFFFF',
        accentColor: '#A90706',
        paddingPx: 12,
        borderRadiusPx: 999,
        maxWidthPx: 140,
        shadow: 'md',
        position: 'bottom-right',
      }
    ),
    contentFields: [
      { key: 'label', label: 'Button Text', type: 'text' },
      { key: 'showLabel', label: 'Show Text Beside Arrow', type: 'boolean' },
      { key: 'scrollThresholdPx', label: 'Show After Scroll (px)', type: 'number', min: 0, max: 3000 },
    ],
    integrationTips: [
      'Automatically hides at the top of the host page and fades in once visitors scroll past your threshold.',
    ],
  },
  {
    type: 'reading_progress',
    name: 'Reading Progress Bar',
    group: 'ui',
    category: 'bars_banners',
    shortDescription: 'Slim viewport scroll progress indicator pinned to the top or bottom edge.',
    useCase: 'Editorial articles, technical docs, case studies.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        barHeightPx: 4,
        trackColor: '#E5E5E5',
        showPercentageLabel: true,
        previewPercent: 64,
      },
      {
        accentColor: '#A90706',
        backgroundColor: '#FFFFFF',
        paddingPx: 0,
        borderRadiusPx: 0,
        maxWidthPx: 1200,
        position: 'top',
      }
    ),
    contentFields: [
      { key: 'barHeightPx', label: 'Bar Thickness (px)', type: 'number', min: 2, max: 14 },
      { key: 'trackColor', label: 'Track Color', type: 'color' },
      { key: 'showPercentageLabel', label: 'Show % Pill in Preview', type: 'boolean' },
      { key: 'previewPercent', label: 'Preview Progress (%)', type: 'number', min: 0, max: 100 },
    ],
    integrationTips: [
      'Tracks real host window scroll progress automatically on embedded pages.',
    ],
  },
  {
    type: 'sticky_cta',
    name: 'Sticky CTA Bar',
    group: 'ui',
    category: 'bars_banners',
    shortDescription: 'Persistent conversion bar anchored to bottom or top with dual action support.',
    useCase: 'Book a demo bar, free trial footer bar, event registration.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        headline: 'Ready to launch your next website faster?',
        subtext: 'Get 28 embeddable widgets + Forms API in one dashboard.',
        ctaLabel: 'Get Started Free',
        ctaUrl: 'https://brosdev.site/signup',
      },
      {
        backgroundColor: '#FFFFFF',
        textColor: '#111111',
        accentColor: '#A90706',
        borderColor: '#E5E5E5',
        maxWidthPx: 1100,
        paddingPx: 16,
        borderRadiusPx: 10,
        shadow: 'md',
        position: 'bottom',
      },
      { dismissible: true }
    ),
    contentFields: [
      { key: 'headline', label: 'Headline', type: 'text' },
      { key: 'subtext', label: 'Supporting Copy', type: 'text' },
      { key: 'ctaLabel', label: 'CTA Label', type: 'text' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'url' },
    ],
    integrationTips: [
      'Respects mobile viewport height limits so it stays slim and unobtrusive.',
    ],
  },
  {
    type: 'feedback_widget',
    name: 'Feedback Widget',
    group: 'ui',
    category: 'conversion_cta',
    shortDescription: 'Quick page usefulness rating with optional comment submission.',
    useCase: 'Documentation helpfulness, feature feedback, customer pulse.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        prompt: 'Was this page helpful?',
        positiveLabel: 'Yes, helpful',
        negativeLabel: 'Needs work',
        commentPlaceholder: 'Tell us how we can improve this page...',
        submitLabel: 'Send Feedback',
        thankYouMessage: 'Thanks for your feedback — we review every note.',
      },
      { maxWidthPx: 460, paddingPx: 20, borderRadiusPx: 10 }
    ),
    contentFields: [
      { key: 'prompt', label: 'Question Prompt', type: 'text' },
      { key: 'positiveLabel', label: 'Positive Choice Label', type: 'text' },
      { key: 'negativeLabel', label: 'Negative Choice Label', type: 'text' },
      { key: 'commentPlaceholder', label: 'Comment Placeholder', type: 'text' },
      { key: 'submitLabel', label: 'Submit Button Label', type: 'text' },
      { key: 'thankYouMessage', label: 'Confirmation Text', type: 'text' },
    ],
    integrationTips: [
      'Privacy-first: logs engagement clicks without storing personal visitor identifiers.',
    ],
  },
  {
    type: 'image_gallery',
    name: 'Image Gallery',
    group: 'ui',
    category: 'navigation_media',
    shortDescription: 'Responsive grid gallery with interactive lightbox modal viewer.',
    useCase: 'Portfolio showcases, product shots, real estate listings.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        heading: 'Project Showcase',
        columns: 3,
        items: [
          {
            title: 'Architecture Blueprint',
            caption: 'Modular API Gateway & Dashboard',
            imageUrl: '',
            accentBg: '#111111',
          },
          {
            title: 'Component Studio',
            caption: 'Live Responsive Preview Canvas',
            imageUrl: '',
            accentBg: '#A90706',
          },
          {
            title: 'Edge Analytics',
            caption: 'Privacy-Safe Daily Aggregation',
            imageUrl: '',
            accentBg: '#333333',
          },
        ],
      },
      { maxWidthPx: 880, paddingPx: 20, borderRadiusPx: 10 }
    ),
    contentFields: [
      { key: 'heading', label: 'Gallery Title', type: 'text' },
      { key: 'columns', label: 'Desktop Columns (2-4)', type: 'number', min: 2, max: 4 },
      {
        key: 'items',
        label: 'Gallery Items',
        type: 'json_list',
        itemShape: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'caption', label: 'Caption', type: 'text' },
          { key: 'imageUrl', label: 'Image URL (optional)', type: 'url' },
          { key: 'accentBg', label: 'Fallback Color', type: 'text' },
        ],
      },
    ],
    integrationTips: [
      'Provide your own hosted HTTPS image URLs; items without an image render clean studio tiles.',
    ],
  },
  {
    type: 'before_after_slider',
    name: 'Before/After Image Slider',
    group: 'ui',
    category: 'navigation_media',
    shortDescription: 'Interactive split-screen comparison slider with draggable divider handle.',
    useCase: 'UI redesigns, photo retouching, architectural renovations.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Performance Redesign Comparison',
        beforeLabel: 'Before',
        afterLabel: 'After',
        beforeImageUrl: '',
        afterImageUrl: '',
        beforeColor: '#262626',
        afterColor: '#A90706',
        initialPosition: 50,
      },
      { maxWidthPx: 720, paddingPx: 20, borderRadiusPx: 12 }
    ),
    contentFields: [
      { key: 'title', label: 'Widget Title', type: 'text' },
      { key: 'beforeLabel', label: 'Before Label', type: 'text' },
      { key: 'afterLabel', label: 'After Label', type: 'text' },
      { key: 'beforeImageUrl', label: 'Before Image URL (optional)', type: 'url' },
      { key: 'afterImageUrl', label: 'After Image URL (optional)', type: 'url' },
      { key: 'beforeColor', label: 'Before Panel Color', type: 'color' },
      { key: 'afterColor', label: 'After Panel Color', type: 'color' },
      { key: 'initialPosition', label: 'Initial Split (%)', type: 'number', min: 10, max: 90 },
    ],
    integrationTips: [
      'Supports mouse drag, touch input, and accessible range keyboard controls.',
    ],
  },
  {
    type: 'table_of_contents',
    name: 'Table of Contents',
    group: 'ui',
    category: 'navigation_media',
    shortDescription: 'Structured jump-link outline card for long articles and documentation.',
    useCase: 'Blog sidebars, technical guides, legal terms.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        heading: 'On This Page',
        autoScanHeadings: true,
        items: [
          { label: '01. Quickstart Embed', anchor: '#quickstart' },
          { label: '02. Shadow DOM Isolation', anchor: '#shadow-dom' },
          { label: '03. Domain Access Control', anchor: '#domains' },
          { label: '04. Privacy-First Analytics', anchor: '#analytics' },
        ],
      },
      { maxWidthPx: 340, paddingPx: 20, borderRadiusPx: 10 }
    ),
    contentFields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'autoScanHeadings', label: 'Auto-Detect Page H2/H3 on Host Site', type: 'boolean' },
      {
        key: 'items',
        label: 'Manual Outline Links',
        type: 'json_list',
        itemShape: [
          { key: 'label', label: 'Section Label', type: 'text' },
          { key: 'anchor', label: 'Anchor (#section-id)', type: 'text' },
        ],
      },
    ],
    integrationTips: [
      'When Auto-Detect is enabled, the embed script scans host H2/H3 elements and generates smooth jump links automatically.',
    ],
  },
  {
    type: 'newsletter_popup',
    name: 'Newsletter Popup',
    group: 'ui',
    category: 'popups_modals',
    shortDescription: 'Email subscription modal connectable directly to your BrosDev Newsletter API.',
    useCase: 'Audience list building, release notes signup, content upgrades.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Join 8,400+ Web Engineers',
        description: 'Get monthly architecture deep dives, UI components, and launch updates. Unsubscribe anytime.',
        placeholder: 'you@company.com',
        ctaLabel: 'Subscribe Free',
        newsletterEndpoint: '',
        successMessage: 'Subscribed! Check your inbox for the latest issue.',
      },
      { maxWidthPx: 460, paddingPx: 28, borderRadiusPx: 12, shadow: 'lg', position: 'center' },
      { triggerDelaySec: 5, displayFrequency: 'once_per_day' }
    ),
    contentFields: [
      { key: 'title', label: 'Modal Heading', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'placeholder', label: 'Email Input Placeholder', type: 'text' },
      { key: 'ctaLabel', label: 'Subscribe Button Label', type: 'text' },
      {
        key: 'newsletterEndpoint',
        label: 'BrosDev Newsletter API URL (optional)',
        type: 'url',
        placeholder: 'https://your-domain/api/newsletter/nl_xxx/subscribe',
      },
      { key: 'successMessage', label: 'Success Message', type: 'text' },
    ],
    integrationTips: [
      'Paste any BrosDev Newsletter API subscribe URL from Phase 1 to save subscribers directly into Firestore.',
    ],
  },
  {
    type: 'exit_intent_popup',
    name: 'Exit Intent Popup',
    group: 'ui',
    category: 'popups_modals',
    shortDescription: 'Cursor-exit triggered retention modal with coupon code and one-click copy.',
    useCase: 'Cart abandonment recovery, trial retention, lead magnet offer.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Wait — Take 15% Off Before You Go',
        description: 'Use this exclusive code at checkout to upgrade any BrosDev Services tier.',
        couponCode: 'BROSDEV15',
        ctaLabel: 'Apply Code & Continue',
        ctaUrl: 'https://brosdev.site/billing',
        dismissLabel: 'No thanks, continue browsing',
      },
      { maxWidthPx: 480, paddingPx: 28, borderRadiusPx: 12, shadow: 'lg', position: 'center', animation: 'scale' },
      { exitIntent: true, displayFrequency: 'once_per_session' }
    ),
    contentFields: [
      { key: 'title', label: 'Headline', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'couponCode', label: 'Coupon / Promo Code', type: 'text' },
      { key: 'ctaLabel', label: 'Primary CTA Label', type: 'text' },
      { key: 'ctaUrl', label: 'Primary CTA URL', type: 'url' },
      { key: 'dismissLabel', label: 'Dismiss Text', type: 'text' },
    ],
    integrationTips: [
      'Triggers automatically when desktop mouse leaves the top viewport boundary (exit intent).',
    ],
  },

  // =========================================================================
  // B. BUSINESS WIDGETS (8)
  // =========================================================================
  {
    type: 'whatsapp_chat',
    name: 'WhatsApp Chat Button',
    group: 'business',
    category: 'business_contact',
    shortDescription: 'Floating WhatsApp launcher with greeting bubble and pre-filled message link.',
    useCase: 'Instant customer sales chat, local business support.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        agentName: 'BrosDev Support',
        agentRole: 'Typically replies in 10 mins',
        welcomeMessage: 'Hi there! Have a question about our services or pricing? Chat with us on WhatsApp.',
        phoneNumber: '14155550192',
        prefillMessage: 'Hello! I would like to learn more about your services.',
        buttonLabel: 'Chat on WhatsApp',
      },
      {
        accentColor: '#16A34A',
        maxWidthPx: 340,
        paddingPx: 18,
        borderRadiusPx: 14,
        shadow: 'lg',
        position: 'bottom-right',
      }
    ),
    contentFields: [
      { key: 'agentName', label: 'Agent / Business Name', type: 'text' },
      { key: 'agentRole', label: 'Response Time / Role', type: 'text' },
      { key: 'welcomeMessage', label: 'Chat Bubble Greeting', type: 'textarea' },
      { key: 'phoneNumber', label: 'WhatsApp Number (digits with country code)', type: 'text', placeholder: '14155550192' },
      { key: 'prefillMessage', label: 'Pre-filled User Message', type: 'text' },
      { key: 'buttonLabel', label: 'CTA Button Label', type: 'text' },
    ],
    integrationTips: [
      'Opens https://wa.me/{phoneNumber}?text=... safely in a new tab with rel="noopener noreferrer".',
    ],
  },
  {
    type: 'contact_widget',
    name: 'Contact Widget',
    group: 'business',
    category: 'business_contact',
    shortDescription: 'Compact embeddable inquiry card connectable to any BrosDev Forms API endpoint.',
    useCase: 'Sidebar contact form, agency inquiry box, support ticket starter.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Send Us a Message',
        subtitle: 'We respond within one business day.',
        namePlaceholder: 'Your name',
        emailPlaceholder: 'you@company.com',
        messagePlaceholder: 'Tell us about your project...',
        submitLabel: 'Send Inquiry',
        formEndpoint: '',
        successMessage: 'Message received! Our team will reply shortly.',
      },
      { maxWidthPx: 440, paddingPx: 24, borderRadiusPx: 12 }
    ),
    contentFields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'namePlaceholder', label: 'Name Placeholder', type: 'text' },
      { key: 'emailPlaceholder', label: 'Email Placeholder', type: 'text' },
      { key: 'messagePlaceholder', label: 'Message Placeholder', type: 'text' },
      { key: 'submitLabel', label: 'Submit Label', type: 'text' },
      { key: 'formEndpoint', label: 'BrosDev Form Submit URL (optional)', type: 'url', placeholder: 'https://your-domain/api/submit/frm_xxx' },
      { key: 'successMessage', label: 'Confirmation Message', type: 'text' },
    ],
    integrationTips: [
      'Connect your Phase 1 Forms API endpoint URL to receive submissions in your Inbox and Resend email alerts.',
    ],
  },
  {
    type: 'business_hours',
    name: 'Business Hours Widget',
    group: 'business',
    category: 'business_contact',
    shortDescription: 'Structured weekly operating hours card with live Open/Closed status badge.',
    useCase: 'Clinics, agencies, retail stores, studios.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        businessName: 'BrosDev Engineering Studio',
        timezoneLabel: 'Mon–Fri · UTC / Local Office Hours',
        currentStatusText: 'Open Today',
        phone: '+1 (415) 555-0192',
        schedule: [
          { day: 'Monday', hours: '09:00 – 18:00' },
          { day: 'Tuesday', hours: '09:00 – 18:00' },
          { day: 'Wednesday', hours: '09:00 – 18:00' },
          { day: 'Thursday', hours: '09:00 – 18:00' },
          { day: 'Friday', hours: '09:00 – 17:00' },
          { day: 'Saturday', hours: 'By Appointment' },
          { day: 'Sunday', hours: 'Closed' },
        ],
      },
      { maxWidthPx: 420, paddingPx: 22, borderRadiusPx: 12 }
    ),
    contentFields: [
      { key: 'businessName', label: 'Business Name', type: 'text' },
      { key: 'timezoneLabel', label: 'Timezone / Subtitle', type: 'text' },
      { key: 'currentStatusText', label: 'Status Label', type: 'text' },
      { key: 'phone', label: 'Contact Phone', type: 'text' },
      {
        key: 'schedule',
        label: 'Weekly Schedule',
        type: 'json_list',
        itemShape: [
          { key: 'day', label: 'Day', type: 'text' },
          { key: 'hours', label: 'Hours', type: 'text' },
        ],
      },
    ],
    integrationTips: [
      'Ideal for footer columns, contact pages, or standalone hosted link pages.',
    ],
  },
  {
    type: 'google_maps_embed',
    name: 'Google Maps Embed Wrapper',
    group: 'business',
    category: 'business_contact',
    shortDescription: 'Responsive styled location card wrapping a safe Google Maps embed + directions CTA.',
    useCase: 'Office locations, local business storefronts, event venues.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        locationName: 'BrosDev Studio HQ',
        address: '548 Market Street, San Francisco, CA 94104',
        mapQuery: '548 Market Street, San Francisco, CA',
        mapHeightPx: 260,
        directionsLabel: 'Open in Google Maps',
      },
      { maxWidthPx: 640, paddingPx: 20, borderRadiusPx: 12 }
    ),
    contentFields: [
      { key: 'locationName', label: 'Location Name', type: 'text' },
      { key: 'address', label: 'Display Address', type: 'text' },
      { key: 'mapQuery', label: 'Map Search Query / Coordinates', type: 'text' },
      { key: 'mapHeightPx', label: 'Map Height (px)', type: 'number', min: 160, max: 520 },
      { key: 'directionsLabel', label: 'Directions Button Label', type: 'text' },
    ],
    integrationTips: [
      'Generates a clean sandboxed Google Maps iframe URL from your address query with no API key exposure.',
    ],
  },
  {
    type: 'appointment_cta',
    name: 'Appointment CTA',
    group: 'business',
    category: 'conversion_cta',
    shortDescription: 'Booking call-to-action card with consultation duration, highlights, and booking link.',
    useCase: 'Calendly / Cal.com booking CTAs, agency discovery calls, clinics.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Book a 30-Minute Architecture Call',
        description: 'Walk through your website stack with a senior engineer and leave with a clear deployment plan.',
        durationLabel: '30 min · Video Call · Free',
        availabilityNote: 'Next slots available this week',
        ctaLabel: 'Schedule Consultation',
        bookingUrl: 'https://cal.com',
      },
      { maxWidthPx: 540, paddingPx: 26, borderRadiusPx: 12 }
    ),
    contentFields: [
      { key: 'title', label: 'Heading', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'durationLabel', label: 'Session Metadata', type: 'text' },
      { key: 'availabilityNote', label: 'Availability Note', type: 'text' },
      { key: 'ctaLabel', label: 'Booking CTA Label', type: 'text' },
      { key: 'bookingUrl', label: 'Booking URL (Cal.com / Calendly / Custom)', type: 'url' },
    ],
    integrationTips: [
      'Share directly via the Hosted Widget URL (/w/PUBLIC_ID) as a lightweight booking landing card.',
    ],
  },
  {
    type: 'customer_review_display',
    name: 'Customer Review Display',
    group: 'business',
    category: 'social_proof',
    shortDescription: 'Multi-card verified customer review wall with ratings, dates, and source tags.',
    useCase: 'Agency credibility walls, service pages, local business sites.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        heading: 'What Our Clients Say',
        averageScore: '4.9 / 5.0',
        reviews: [
          {
            author: 'Priya Nair',
            company: 'Northstar Digital',
            rating: 5,
            date: 'Oct 2026',
            comment: 'Fast delivery and rock-solid embeds. Our clients manage banners themselves now.',
          },
          {
            author: 'Daniel Brooks',
            company: 'Veloce Commerce',
            rating: 5,
            date: 'Nov 2026',
            comment: 'Cookie consent and exit-intent popups increased our newsletter signups by 28%.',
          },
          {
            author: 'Hannah Lindqvist',
            company: 'Nordic Webworks',
            rating: 5,
            date: 'Nov 2026',
            comment: 'Zero styling conflicts across Shopify, WordPress, and static marketing sites.',
          },
        ],
      },
      { maxWidthPx: 920, paddingPx: 24, borderRadiusPx: 12 }
    ),
    contentFields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'averageScore', label: 'Aggregate Score Label', type: 'text' },
      {
        key: 'reviews',
        label: 'Customer Reviews',
        type: 'json_list',
        itemShape: [
          { key: 'author', label: 'Reviewer Name', type: 'text' },
          { key: 'company', label: 'Company / City', type: 'text' },
          { key: 'rating', label: 'Rating (1-5)', type: 'number' },
          { key: 'date', label: 'Date', type: 'text' },
          { key: 'comment', label: 'Review Text', type: 'textarea' },
        ],
      },
    ],
    integrationTips: [
      'Adapts automatically from 3 columns on desktop to 1 column on mobile viewports.',
    ],
  },
  {
    type: 'lead_capture_popup',
    name: 'Lead Capture Popup',
    group: 'business',
    category: 'popups_modals',
    shortDescription: 'Multi-field lead generation modal (Name, Email, Company) wired to BrosDev Forms API.',
    useCase: 'B2B quote requests, whitepaper downloads, demo signups.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        title: 'Request a Custom Agency Proposal',
        subtitle: 'Share your website URL and goals — we will send a tailored plan within 24 hours.',
        ctaLabel: 'Request Proposal',
        formEndpoint: '',
        successMessage: 'Request received! We will email your proposal shortly.',
      },
      { maxWidthPx: 480, paddingPx: 28, borderRadiusPx: 12, shadow: 'lg', position: 'center' },
      { triggerDelaySec: 4, displayFrequency: 'once_per_session' }
    ),
    contentFields: [
      { key: 'title', label: 'Heading', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'ctaLabel', label: 'Submit Button Label', type: 'text' },
      { key: 'formEndpoint', label: 'BrosDev Form Submit URL (optional)', type: 'url', placeholder: 'https://your-domain/api/submit/frm_xxx' },
      { key: 'successMessage', label: 'Success Message', type: 'text' },
    ],
    integrationTips: [
      'Connect a BrosDev Form Submit URL to store leads in Submissions and trigger Resend + Webhook alerts.',
    ],
  },
  {
    type: 'digital_business_card',
    name: 'Digital Business Card',
    group: 'business',
    category: 'business_contact',
    shortDescription: 'Shareable founder/company vCard profile with email, phone, website, and Save Contact.',
    useCase: 'QR code profile pages, founder bio links, agency team cards.',
    supportsHostedPage: true,
    defaultConfig: makeConfig(
      {
        fullName: 'Sagar Gajjar',
        role: 'Founder & Principal Engineer',
        company: 'BrosDev IT Engineering Studio',
        bio: 'Building developer-first SaaS infrastructure, APIs, and modular web components.',
        email: 'hello@brosdev.site',
        phone: '+1 (415) 555-0192',
        website: 'https://brosdev.site',
        linkedinUrl: 'https://linkedin.com',
        saveVcardLabel: 'Save Contact (.vcf)',
      },
      { maxWidthPx: 400, paddingPx: 26, borderRadiusPx: 14, shadow: 'md', alignment: 'center' }
    ),
    contentFields: [
      { key: 'fullName', label: 'Full Name', type: 'text' },
      { key: 'role', label: 'Title / Role', type: 'text' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'bio', label: 'Short Bio', type: 'textarea' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'website', label: 'Website URL', type: 'url' },
      { key: 'linkedinUrl', label: 'LinkedIn / Social URL', type: 'url' },
      { key: 'saveVcardLabel', label: 'vCard Button Label', type: 'text' },
    ],
    integrationTips: [
      'Pair the Hosted Widget URL (/w/PUBLIC_ID) with the Phase 1 QR Code Generator for instant scannable business cards!',
    ],
  },
];

export const WIDGET_CATALOG_MAP: Record<WidgetType, WidgetDefinition> = WIDGET_CATALOG.reduce(
  (acc, item) => {
    acc[item.type] = item;
    return acc;
  },
  {} as Record<WidgetType, WidgetDefinition>
);

export function getWidgetDefinition(type: WidgetType): WidgetDefinition {
  return WIDGET_CATALOG_MAP[type] || WIDGET_CATALOG[0];
}

export function cloneDefaultConfiguration(type: WidgetType): WidgetConfiguration {
  const def = getWidgetDefinition(type);
  return JSON.parse(JSON.stringify(def.defaultConfig)) as WidgetConfiguration;
}

/**
 * Safely migrate older widget configuration versions to the current schema
 * so published widgets never break when new settings are introduced.
 */
export function hydrateWidgetConfiguration(
  type: WidgetType,
  raw: Partial<WidgetConfiguration> | null | undefined
): WidgetConfiguration {
  const defaults = cloneDefaultConfiguration(type);
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    schemaVersion: Number(raw.schemaVersion || CURRENT_SCHEMA_VERSION),
    content: {
      ...defaults.content,
      ...(raw.content && typeof raw.content === 'object' ? raw.content : {}),
    },
    style: {
      ...defaults.style,
      ...(raw.style && typeof raw.style === 'object' ? raw.style : {}),
    },
    visibility: {
      ...defaults.visibility,
      ...(raw.visibility && typeof raw.visibility === 'object' ? raw.visibility : {}),
    },
    customCss: typeof raw.customCss === 'string' ? raw.customCss : '',
    showBranding: raw.showBranding !== false,
  };
}
