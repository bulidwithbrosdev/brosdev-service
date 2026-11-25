import React, { useEffect, useState } from 'react';
import {
  FileText,
  Mail,
  Webhook,
  Newspaper,
  KeyRound,
  QrCode,
  Link2,
  FileDown,
  HardDrive,
  ArrowRight,
  Lock,
  Layers,
  LayoutGrid,
  Send,
} from 'lucide-react';
import { getDevServicesSummary } from '../../lib/devServicesApi';
import { hasPlanFeature, type PlanLockKey } from '../../lib/planLimits';
import type { DevServicesSummary, WorkspaceMe } from '../../types';

export type ProductNavTarget =
  | 'widgets'
  | 'campaigns'
  | 'forms'
  | 'submissions'
  | 'projects'
  | 'webhooks'
  | 'newsletter'
  | 'apikeys'
  | 'utilities'
  | 'billing'
  | 'docs'
  | 'settings';

interface ProductsViewProps {
  workspace: WorkspaceMe;
  onNavigate: (target: ProductNavTarget, subTab?: 'qr' | 'shortener' | 'pdf') => void;
  onRequestUpgrade: (key: PlanLockKey) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  workspace,
  onNavigate,
  onRequestUpgrade,
}) => {
  const [summary, setSummary] = useState<DevServicesSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const canUseWebhooks = hasPlanFeature(workspace, 'webhooks');
  const canUseNewsletter = hasPlanFeature(workspace, 'newsletterApi');
  const canUsePdf = hasPlanFeature(workspace, 'pdfGenerator');
  const canUseSvgQr = hasPlanFeature(workspace, 'svgQrExport');
  const canUseCustomSlugs = hasPlanFeature(workspace, 'customShortSlugs');
  const canUseScopedKeys = hasPlanFeature(workspace, 'scopedApiKeys');

  useEffect(() => {
    let active = true;
    getDevServicesSummary()
      .then((res) => {
        if (active) setSummary(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const coreProducts = [
    {
      id: 'widgets',
      title: 'Website Components & Widgets',
      tier: 'Phase 2 · 28 Modules',
      description:
        'Visual 3-panel builder for 20 UI components & 8 business widgets with Shadow DOM embeds, hosted URLs, versioning, and analytics.',
      metric: loading
        ? 'Loading...'
        : `${summary?.publishedWidgetsCount ?? 0} / ${workspace.limits.maxWidgets ?? 2} published`,
      subMetric: loading
        ? ''
        : `${summary?.widgetsCount ?? 0} total components · Shadow DOM embed`,
      icon: LayoutGrid,
      actionLabel: 'Open Widget Builder',
      onClick: () => onNavigate('widgets'),
      locked: false,
    },
    {
      id: 'campaigns',
      title: 'Newsletter & Email Campaign Studio',
      tier: 'Phase 3 · Resend Powered',
      description:
        'Visual drag-and-drop email builder, 10 announcement & newsletter templates, subscriber CRM, dynamic segments, scheduling, and Resend webhooks.',
      metric: loading
        ? 'Loading...'
        : `${summary?.campaignsCount ?? 0} campaign(s) · ${(workspace.limits.maxCampaignEmailsPerMonth ?? 500).toLocaleString()} emails/mo`,
      subMetric: 'One-click signed unsubscribe · Verified Resend delivery',
      icon: Send,
      actionLabel: 'Open Campaign Studio',
      onClick: () => onNavigate('campaigns'),
      locked: false,
    },
    {
      id: 'forms',
      title: 'Form Submission API',
      tier: 'Included · All Plans',
      description:
        'Visual form builder with Native HTML, JavaScript Fetch, REST API, and zero-dependency Embed endpoints stored in Firestore.',
      metric: `${workspace.usage.formsCreated} / ${workspace.limits.maxForms} forms`,
      subMetric: `${workspace.usage.submissionsCount.toLocaleString()} / ${workspace.limits.maxSubmissions.toLocaleString()} submissions/mo`,
      icon: FileText,
      actionLabel: 'Open Forms',
      onClick: () => onNavigate('forms'),
      locked: false,
    },
    {
      id: 'email',
      title: 'Email Notification Service',
      tier: 'Included · All Plans',
      description:
        'Resend-powered transactional alerts & submitter auto-replies dispatched from your dedicated account sender address.',
      metric: `${workspace.usage.emailsSentCount.toLocaleString()} / ${workspace.limits.maxEmails.toLocaleString()} emails/mo`,
      subMetric: workspace.user.senderEmail,
      icon: Mail,
      actionLabel: 'Configure Sender',
      onClick: () => onNavigate('settings'),
      locked: false,
    },
    {
      id: 'webhooks',
      title: 'Signed Webhook Service',
      tier: canUseWebhooks ? 'Unlocked · Pro+' : 'Professional Plan',
      description:
        'HMAC-SHA256 signed HTTPS event delivery with private-network protection, durable delivery logs, HTTP status tracking, and retry.',
      metric: loading
        ? 'Loading...'
        : canUseWebhooks
          ? `${summary?.webhooksCount ?? 0} / ${workspace.limits.maxWebhooks} endpoints`
          : 'Locked on current plan',
      subMetric: loading
        ? ''
        : canUseWebhooks
          ? `${summary?.webhookDeliveriesCount ?? 0} deliveries logged`
          : 'Upgrade to Professional ($49/mo) for 10 endpoints',
      icon: Webhook,
      actionLabel: canUseWebhooks ? 'Manage Webhooks' : 'Unlock Webhooks',
      onClick: () => (canUseWebhooks ? onNavigate('webhooks') : onRequestUpgrade('webhooks')),
      locked: !canUseWebhooks,
    },
  ];

  const additionalServices = [
    {
      id: 'newsletter',
      title: 'Newsletter Subscription API',
      tier: canUseNewsletter ? 'Unlocked · Starter+' : 'Starter Plan',
      description:
        'Create audience lists with duplicate prevention, HTML/Fetch/REST subscribe endpoints, search, and CSV export (Pro+).',
      metric: loading
        ? 'Loading...'
        : canUseNewsletter
          ? `${summary?.newsletterListsCount ?? 0} / ${workspace.limits.maxNewsletterLists} lists`
          : 'Locked on Free plan',
      subMetric: loading
        ? ''
        : canUseNewsletter
          ? `${summary?.subscribersCount ?? 0} / ${workspace.limits.maxSubscribers.toLocaleString()} subscribers`
          : 'Upgrade to Starter ($19/mo) for 3 lists & 2,500 subs',
      icon: Newspaper,
      actionLabel: canUseNewsletter ? 'Open Newsletter' : 'Unlock Newsletter API',
      onClick: () => (canUseNewsletter ? onNavigate('newsletter') : onRequestUpgrade('newsletterApi')),
      comingSoon: false,
      locked: !canUseNewsletter,
    },
    {
      id: 'apikeys',
      title: 'Scoped API Key Management',
      tier: canUseScopedKeys ? 'Scoped · Starter+' : 'Basic · 1 Key on Free',
      description:
        'Generate workspace & project-scoped keys stored as SHA-256 hashes with one-time secret reveal, rotation, and revocation.',
      metric: loading
        ? 'Loading...'
        : `${summary?.apiKeysCount ?? 0} / ${workspace.limits.maxApiKeys} active keys`,
      subMetric: loading
        ? ''
        : `${summary?.projectsCount ?? 0} / ${workspace.limits.maxProjects} workspace projects`,
      icon: KeyRound,
      actionLabel: 'Manage API Keys',
      onClick: () => onNavigate('apikeys'),
      comingSoon: false,
      locked: false,
    },
    {
      id: 'files',
      title: 'File Storage Vault API',
      tier: 'Planned · Roadmap',
      description:
        'Dedicated private Firebase Storage bucket uploads with signed download URLs, MIME validation, and retention rules.',
      metric: 'Coming Soon',
      subMetric: 'Form file metadata capture is live today',
      icon: HardDrive,
      actionLabel: 'Coming Soon',
      onClick: undefined,
      comingSoon: true,
      locked: false,
    },
  ];

  const utilities = [
    {
      id: 'qr',
      title: 'QR Code Generator',
      tier: canUseSvgQr ? 'PNG & SVG · Starter+' : 'PNG on Free · SVG Starter+',
      description:
        'Generate crisp QR codes for URLs or text with custom sizing, error correction, and saved workspace history.',
      metric: canUseSvgQr ? 'PNG + Vector SVG unlocked' : 'PNG unlocked · SVG requires Starter',
      icon: QrCode,
      actionLabel: 'Open QR Generator',
      onClick: () => onNavigate('utilities', 'qr'),
      locked: false,
    },
    {
      id: 'shortener',
      title: 'URL Shortener API',
      tier: canUseCustomSlugs ? 'Custom Slugs · Starter+' : `Up to ${workspace.limits.maxShortLinks} links`,
      description:
        'Create short links with real HTTP 302 redirects, click tracking, custom vanity slugs (Starter+), and expiration dates.',
      metric: loading
        ? 'Loading...'
        : `${summary?.shortLinksCount ?? 0} / ${workspace.limits.maxShortLinks} links · ${summary?.shortLinkClicks ?? 0} clicks`,
      icon: Link2,
      actionLabel: 'Open Shortener',
      onClick: () => onNavigate('utilities', 'shortener'),
      locked: false,
    },
    {
      id: 'pdf',
      title: 'PDF Document Generator',
      tier: canUsePdf ? 'Unlocked · Starter+' : 'Starter Plan',
      description:
        'Generate downloadable structured PDFs (Invoices, Reports, Form Summaries) directly from structured templates.',
      metric: canUsePdf ? 'All 3 PDF templates unlocked' : 'Locked on Free plan',
      icon: FileDown,
      actionLabel: canUsePdf ? 'Open PDF Studio' : 'Unlock PDF Studio',
      onClick: () => (canUsePdf ? onNavigate('utilities', 'pdf') : onRequestUpgrade('pdfGenerator')),
      locked: !canUsePdf,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            BrosDev Developer Services
          </h1>
          <p className="mt-1 text-sm text-[#525252]">
            Active Plan:{' '}
            <span className="font-semibold text-[#111111]">{workspace.plan?.name || 'Free'}</span> ·
            Workspace{' '}
            <span className="font-mono font-semibold text-[#111111]">{workspace.user.accountId}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer whitespace-nowrap"
          >
            <Layers className="h-3.5 w-3.5" />
            Projects ({summary?.projectsCount ?? 0}/{workspace.limits.maxProjects})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('billing')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer whitespace-nowrap"
          >
            Compare Plans
          </button>
          <button
            type="button"
            onClick={() => onNavigate('docs')}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#262626] cursor-pointer whitespace-nowrap"
          >
            API Reference
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Priority 1 — Core Products */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#111111]">Core Backend Services</h2>
          <span className="text-xs text-[#737373]">Production APIs · Firestore &amp; Resend</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {coreProducts.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-lg border bg-white p-5 ${
                  item.locked ? 'border-dashed border-[#D4D4D4]' : 'border-[#E5E5E5]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E5E5] bg-[#FAFAFA] text-[#111111]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        item.locked ? 'text-[#A90706]' : 'text-[#737373]'
                      }`}
                    >
                      {item.tier}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#111111]">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#525252]">{item.description}</p>
                </div>

                <div className="mt-5 border-t border-[#F0F0F0] pt-4">
                  <div className="font-mono text-xs font-semibold tabular-nums text-[#111111]">
                    {item.metric}
                  </div>
                  {item.subMetric && (
                    <div className="mt-0.5 truncate font-mono text-[11px] text-[#737373]">
                      {item.subMetric}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={item.onClick}
                    className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      item.locked
                        ? 'border border-[#D4D4D4] bg-[#F5F5F5] text-[#525252] hover:border-[#A90706] hover:text-[#A90706]'
                        : 'bg-[#A90706] text-white hover:bg-[#8C0605]'
                    }`}
                  >
                    {item.locked && <Lock className="h-3.5 w-3.5" />}
                    <span>{item.actionLabel}</span>
                    {!item.locked && <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Priority 2 — Additional Services */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#111111]">Audience, Security &amp; Storage</h2>
          <span className="text-xs text-[#737373]">Plan-governed SaaS modules</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {additionalServices.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-lg border bg-white p-5 ${
                  item.comingSoon
                    ? 'border-[#E5E5E5] opacity-75'
                    : item.locked
                      ? 'border-dashed border-[#D4D4D4]'
                      : 'border-[#E5E5E5]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E5E5] bg-[#FAFAFA] text-[#111111]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        item.locked ? 'text-[#A90706]' : 'text-[#737373]'
                      }`}
                    >
                      {item.tier}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#111111]">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#525252]">{item.description}</p>
                </div>

                <div className="mt-5 border-t border-[#F0F0F0] pt-4">
                  <div className="font-mono text-xs font-semibold tabular-nums text-[#111111]">
                    {item.metric}
                  </div>
                  {item.subMetric && (
                    <div className="mt-0.5 text-[11px] text-[#737373]">{item.subMetric}</div>
                  )}
                  <button
                    type="button"
                    disabled={item.comingSoon}
                    onClick={item.onClick}
                    className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
                      item.comingSoon
                        ? 'cursor-not-allowed border border-[#E5E5E5] bg-[#F5F5F5] text-[#737373]'
                        : item.locked
                          ? 'cursor-pointer border border-[#D4D4D4] bg-[#F5F5F5] text-[#525252] hover:border-[#A90706] hover:text-[#A90706]'
                          : 'cursor-pointer border border-[#111111] bg-white text-[#111111] hover:bg-[#111111] hover:text-white'
                    }`}
                  >
                    {item.locked && <Lock className="h-3.5 w-3.5" />}
                    <span>{item.actionLabel}</span>
                    {!item.comingSoon && !item.locked && <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Priority 3 — Developer Utilities */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#111111]">Developer Utilities</h2>
          <span className="text-xs text-[#737373]">Instant tools with Firestore persistence</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {utilities.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-lg border bg-white p-5 ${
                  item.locked ? 'border-dashed border-[#D4D4D4]' : 'border-[#E5E5E5]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E5E5] bg-[#FAFAFA] text-[#111111]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        item.locked ? 'text-[#A90706]' : 'text-[#737373]'
                      }`}
                    >
                      {item.tier}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#111111]">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#525252]">{item.description}</p>
                  {item.metric && (
                    <div className="mt-3 font-mono text-xs font-semibold tabular-nums text-[#111111]">
                      {item.metric}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={item.onClick}
                  className={`mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    item.locked
                      ? 'border border-[#D4D4D4] bg-[#F5F5F5] text-[#525252] hover:border-[#A90706] hover:text-[#A90706]'
                      : 'border border-[#D4D4D4] bg-white text-[#111111] hover:border-[#111111] hover:bg-[#FAFAFA]'
                  }`}
                >
                  {item.locked && <Lock className="h-3.5 w-3.5" />}
                  <span>{item.actionLabel}</span>
                  {!item.locked && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
