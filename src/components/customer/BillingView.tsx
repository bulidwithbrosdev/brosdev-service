import React, { useEffect, useState } from 'react';
import {
  Check,
  CreditCard,
  Lock,
  ShieldCheck,
  X,
  FileText,
  Smartphone,
  Building2,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getDevServicesSummary } from '../../lib/devServicesApi';
import { DevServicesSummary, InvoiceDetailRecord, PlanRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { InvoiceModal } from '../shared/InvoiceModal';

interface BillingPayload {
  subscription: {
    id: number;
    planId: number;
    status: string;
    billingCycle: 'monthly' | 'yearly';
    provider: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
  } | null;
  currentPlan: PlanRecord | null;
  usage: {
    periodMonth: string;
    submissionsCount: number;
    emailsSentCount: number;
    apiRequestsCount: number;
    storageBytes: number;
  } | null;
  currentFormCount: number;
  plans: PlanRecord[];
  payments: Array<{
    id: number;
    provider: string;
    providerPaymentId: string;
    amountCents: number;
    currency: string;
    status: string;
    refundStatus: string;
    metadata?: {
      paymentMethod?: string;
      cardBrand?: string;
      last4?: string;
      upiId?: string;
      bankName?: string;
      declineReason?: string;
    };
    createdAt: string;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    amountCents: number;
    currency: string;
    status: string;
    issuedAt: string;
  }>;
}

const POPULAR_BANKS = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank of India',
  'Axis Bank',
  'Chase Business',
  'Mercury Bank',
];

const COUNTRIES = [
  'United States',
  'India',
  'United Kingdom',
  'Canada',
  'Singapore',
  'Germany',
  'Australia',
];

function formatCardNumber(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function detectBrandLabel(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  if (/^6(?:011|5)/.test(digits)) return 'DISCOVER';
  return 'CARD';
}

export const BillingView: React.FC<{ highlightPlanSlug?: string }> = ({ highlightPlanSlug }) => {
  const { workspace, refreshWorkspace } = useAuth();
  const [data, setData] = useState<BillingPayload | null>(null);
  const [devSummary, setDevSummary] = useState<DevServicesSummary | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; invoiceId?: number } | null>(
    null
  );

  // Invoice viewer state
  const [activeInvoice, setActiveInvoice] = useState<InvoiceDetailRecord | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // BrosDev Pay unified checkout modal state
  const [checkoutPlan, setCheckoutPlan] = useState<PlanRecord | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi' | 'netbanking'>('card');
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [billingCountry, setBillingCountry] = useState('United States');
  const [billingZip, setBillingZip] = useState('');
  const [upiId, setUpiId] = useState('');
  const [bankName, setBankName] = useState(POPULAR_BANKS[0]);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [checkoutReceipt, setCheckoutReceipt] = useState<{
    transactionId: string;
    invoiceId?: number;
    invoiceNumber?: string;
    receiptSummary: string;
    amountUsd: string;
    planName: string;
  } | null>(null);

  const load = async () => {
    const [res, summary] = await Promise.all([
      apiRequest<BillingPayload>('/api/billing'),
      getDevServicesSummary().catch(() => null),
    ]);
    setData(res);
    setDevSummary(summary);
  };

  useEffect(() => {
    load();
  }, []);

  const openInvoiceViewer = async (invoiceId: number) => {
    setLoadingInvoice(true);
    setActiveInvoice(null);
    try {
      const res = await apiRequest<{ invoice: InvoiceDetailRecord }>(
        `/api/billing/invoices/${invoiceId}`
      );
      setActiveInvoice(res.invoice);
    } catch (err: any) {
      setNotice({ ok: false, text: err.message || 'Unable to load invoice.' });
    } finally {
      setLoadingInvoice(false);
    }
  };

  const handlePlanClick = async (plan: PlanRecord) => {
    const priceCents =
      billingCycle === 'yearly' ? plan.yearlyPriceCents : plan.monthlyPriceCents;

    if (priceCents === 0) {
      setBusyPlanId(plan.id);
      setNotice(null);
      try {
        const res = await apiRequest<{ message?: string }>('/api/billing/brosdev-pay/checkout', {
          method: 'POST',
          body: { planId: plan.id, billingCycle },
        });
        setNotice({ ok: true, text: res.message || `Switched to ${plan.name}.` });
        await Promise.all([load(), refreshWorkspace()]);
      } catch (err: any) {
        setNotice({ ok: false, text: err.message || 'Unable to switch plan.' });
      } finally {
        setBusyPlanId(null);
      }
      return;
    }

    setPaymentMethod('card');
    setCardholderName(workspace?.user.displayName || '');
    setCardNumber('');
    setExpiry('');
    setCvc('');
    setBillingZip('');
    setBillingCountry('United States');
    setUpiId('');
    setBankName(POPULAR_BANKS[0]);
    setCheckoutError(null);
    setCheckoutReceipt(null);
    setCheckoutPlan(plan);
  };

  const handleBrosDevPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    setCheckoutError(null);

    const payload: Record<string, unknown> = {
      planId: checkoutPlan.id,
      billingCycle,
      paymentMethod,
    };

    if (paymentMethod === 'card') {
      const [expMonth = '', expYear = ''] = expiry.split('/').map((s) => s.trim());
      if (!expMonth || !expYear) {
        setCheckoutError('Enter expiration date in MM/YY format.');
        return;
      }
      payload.cardholderName = cardholderName.trim();
      payload.cardNumber = cardNumber.replace(/\s+/g, '');
      payload.expiryMonth = expMonth;
      payload.expiryYear = expYear;
      payload.cvc = cvc.trim();
      payload.billingZip = billingZip.trim();
      payload.billingCountry = billingCountry;
    } else if (paymentMethod === 'upi') {
      payload.upiId = upiId.trim();
    } else if (paymentMethod === 'netbanking') {
      payload.bankName = bankName;
    }

    setProcessingPayment(true);
    try {
      const res = await apiRequest<{
        message: string;
        transactionId: string;
        invoiceId?: number;
        invoiceNumber?: string;
        receiptSummary?: string;
      }>('/api/billing/brosdev-pay/checkout', {
        method: 'POST',
        body: payload,
      });

      const amountUsd = (
        (billingCycle === 'yearly'
          ? checkoutPlan.yearlyPriceCents
          : checkoutPlan.monthlyPriceCents) / 100
      ).toFixed(2);

      setCheckoutReceipt({
        transactionId: res.transactionId,
        invoiceId: res.invoiceId,
        invoiceNumber: res.invoiceNumber,
        receiptSummary: res.receiptSummary || 'BrosDev Pay',
        amountUsd,
        planName: checkoutPlan.name,
      });

      setNotice({
        ok: true,
        text: res.invoiceNumber
          ? `${res.message} Invoice ${res.invoiceNumber} issued.`
          : res.message,
        invoiceId: res.invoiceId,
      });
      await Promise.all([load(), refreshWorkspace()]);
    } catch (err: any) {
      setCheckoutError(err.message || 'Payment could not be authorized.');
      await load();
    } finally {
      setProcessingPayment(false);
    }
  };

  if (!data) {
    return (
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-10 text-center text-sm text-[#737373]">
        Loading plans, entitlements, and workspace usage...
      </div>
    );
  }

  const checkoutAmountUsd = checkoutPlan
    ? (
        (billingCycle === 'yearly'
          ? checkoutPlan.yearlyPriceCents
          : checkoutPlan.monthlyPriceCents) / 100
      ).toFixed(2)
    : '0.00';

  const brandLabel = detectBrandLabel(cardNumber);
  const cp = data.currentPlan;

  const usageMeters = [
    {
      label: 'Forms Created',
      used: data.currentFormCount,
      limit: cp?.maxForms ?? 2,
    },
    {
      label: 'Submissions / Mo',
      used: data.usage?.submissionsCount ?? 0,
      limit: cp?.maxSubmissionsPerMonth ?? 100,
    },
    {
      label: 'Emails Sent / Mo',
      used: data.usage?.emailsSentCount ?? 0,
      limit: cp?.maxEmailsPerMonth ?? 100,
    },
    {
      label: 'Projects & Domains',
      used: devSummary?.projectsCount ?? 0,
      limit: cp?.maxProjects ?? 1,
    },
    {
      label: 'Scoped API Keys',
      used: devSummary?.apiKeysCount ?? 0,
      limit: cp?.maxApiKeys ?? 1,
    },
    {
      label: 'Short Links',
      used: devSummary?.shortLinksCount ?? 0,
      limit: cp?.maxShortLinks ?? 5,
    },
    {
      label: 'Newsletter Lists',
      used: devSummary?.newsletterListsCount ?? 0,
      limit: cp?.maxNewsletterLists ?? 0,
      locked: !cp?.features.newsletterApi,
    },
    {
      label: 'Published Widgets',
      used: devSummary?.publishedWidgetsCount ?? 0,
      limit: cp?.maxWidgets ?? 2,
    },
    {
      label: 'Signed Webhooks',
      used: devSummary?.webhooksCount ?? 0,
      limit: cp?.maxWebhooks ?? 0,
      locked: !cp?.features.webhooks,
    },
  ];

  const comparisonGroups: Array<{
    group: string;
    rows: Array<{
      label: string;
      render: (plan: PlanRecord) => React.ReactNode;
    }>;
  }> = [
    {
      group: 'Core Forms & Email Routing',
      rows: [
        {
          label: 'Active Forms',
          render: (p) => <span className="font-mono font-semibold">{p.maxForms}</span>,
        },
        {
          label: 'Monthly Submissions & Resend Emails',
          render: (p) => (
            <span className="font-mono font-semibold">
              {p.maxSubmissionsPerMonth.toLocaleString()} / mo
            </span>
          ),
        },
        {
          label: 'Advanced Builder (15 fields, validation, redirects, allowlist)',
          render: (p) =>
            p.features.advancedBuilder ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'JavaScript Fetch & Drop-in Embed Widget',
          render: (p) =>
            p.features.jsIntegration ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Custom Sender Display Name & Submitter Auto-Reply',
          render: (p) =>
            p.features.customEmailTemplates ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Multiple Email Recipients (up to 20 per form)',
          render: (p) =>
            p.features.multipleRecipients ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'White-Label (Remove BrosDev Branding)',
          render: (p) =>
            p.features.removeBranding ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
      ],
    },
    {
      group: 'Website Components & Widgets (Phase 2)',
      rows: [
        {
          label: 'Published Website Components & Business Widgets',
          render: (p) => <span className="font-mono font-semibold">{p.maxWidgets ?? 2} live</span>,
        },
        {
          label: 'Shadow DOM Embed, Hosted Pages & Analytics',
          render: () => <Check className="w-4 h-4 text-[#16A34A] mx-auto" />,
        },
        {
          label: 'Domain Allowlist Restrictions & Subdomain Control',
          render: (p) =>
            p.features.widgetDomainRestrictions ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Validated Scoped Custom CSS Editor',
          render: (p) =>
            p.features.widgetCustomCss ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
      ],
    },
    {
      group: 'Newsletter & Email Campaign Studio (Phase 3)',
      rows: [
        {
          label: 'Monthly Campaign Emails (Resend Delivery)',
          render: (p) => (
            <span className="font-mono font-semibold">
              {(p.maxCampaignEmailsPerMonth ?? 500).toLocaleString()} / mo
            </span>
          ),
        },
        {
          label: 'Custom Reusable Email Templates',
          render: (p) =>
            p.features.campaignCustomTemplates ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Campaign Scheduling (Durable Queue)',
          render: (p) =>
            p.features.campaignScheduling ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Dynamic Subscriber Segmentation Rules',
          render: (p) =>
            p.features.campaignSegmentation ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Automated Email Sequences & Triggers',
          render: (p) =>
            p.features.campaignAutomation ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Multiple Custom Sender Identities',
          render: (p) =>
            p.features.multipleSenderIdentities ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
      ],
    },
    {
      group: 'Developer Services & APIs',
      rows: [
        {
          label: 'Projects & Verified Website Domains',
          render: (p) => <span className="font-mono font-semibold">{p.maxProjects}</span>,
        },
        {
          label: 'Workspace & Project API Keys',
          render: (p) => (
            <span className="font-mono font-semibold">
              {p.maxApiKeys} {p.features.scopedApiKeys ? '(Scoped + Rotate)' : '(Basic)'}
            </span>
          ),
        },
        {
          label: 'Newsletter Subscription API (Lists / Subscribers)',
          render: (p) =>
            p.features.newsletterApi ? (
              <span className="font-mono font-semibold">
                {p.maxNewsletterLists} / {p.maxSubscribers.toLocaleString()}
              </span>
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'HMAC-SHA256 Signed Webhook Endpoints & Retries',
          render: (p) =>
            p.features.webhooks ? (
              <span className="font-mono font-semibold">{p.maxWebhooks} endpoints</span>
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'API Rate Limit',
          render: (p) => (
            <span className="font-mono text-[#525252]">{p.maxApiRequestsPerMin} req/min</span>
          ),
        },
      ],
    },
    {
      group: 'Developer Utilities',
      rows: [
        {
          label: 'QR Code Generator',
          render: (p) => (
            <span className="text-xs font-semibold text-[#111111]">
              {p.features.svgQrExport ? 'PNG + Vector SVG' : 'PNG Only'}
            </span>
          ),
        },
        {
          label: 'URL Shortener (/r/:slug) Links',
          render: (p) => (
            <span className="font-mono font-semibold">
              {p.maxShortLinks} {p.features.customShortSlugs ? '(Custom + Expiry)' : '(Auto)'}
            </span>
          ),
        },
        {
          label: 'PDF Document Generator (Invoice / Report / Summary)',
          render: (p) =>
            p.features.pdfGenerator ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
      ],
    },
    {
      group: 'Analytics, Export & Organization',
      rows: [
        {
          label: 'CSV Exports (Submissions & Newsletter) + Date Filters',
          render: (p) =>
            p.features.advancedAnalytics ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Team Collaboration (Admin / Editor / Viewer RBAC)',
          render: (p) =>
            p.features.teamMembers ? (
              <span className="font-mono font-semibold text-[#111111]">
                Up to {p.maxTeamSeats} seats
              </span>
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
        {
          label: 'Priority Support',
          render: (p) =>
            p.features.prioritySupport ? (
              <Check className="w-4 h-4 text-[#16A34A] mx-auto" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[#A3A3A3] mx-auto" />
            ),
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Current Plan & Full Developer Services Quota Overview */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
          <div>
            <div className="text-xs text-[#525252] font-medium">
              BrosDev Developer Services · Active Subscription
            </div>
            <div className="text-xl font-bold text-[#111111] mt-1">
              {cp?.name || 'Free'} Plan ·{' '}
              <span className="text-sm font-semibold capitalize text-[#16A34A]">
                {data.subscription?.status || 'active'}
              </span>
            </div>
            {data.subscription?.currentPeriodEnd && (
              <div className="text-xs text-[#737373] mt-1 font-mono">
                Renews {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()} · Billing:{' '}
                {data.subscription.billingCycle} · Processor: BrosDev Pay
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F5F5F5] rounded-lg">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                billingCycle === 'monthly' ? 'bg-white text-[#111111] shadow-xs' : 'text-[#525252]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer inline-flex items-center gap-1.5 ${
                billingCycle === 'yearly' ? 'bg-white text-[#111111] shadow-xs' : 'text-[#525252]'
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] font-bold text-[#16A34A]">Save 17%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5">
          {usageMeters.map((m) => {
            const pct = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
            const atLimit = !m.locked && m.limit > 0 && m.used >= m.limit;
            return (
              <div
                key={m.label}
                className="rounded-md border border-[#EFEFEF] bg-[#FAFAFA] p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[#525252]">{m.label}</span>
                  {m.locked && <Lock className="w-3 h-3 text-[#A3A3A3]" />}
                </div>
                <div className="font-mono text-sm font-bold tabular-nums text-[#111111]">
                  {m.locked ? (
                    <span className="text-xs font-semibold text-[#737373]">Locked</span>
                  ) : (
                    <>
                      {m.used.toLocaleString()} / {m.limit.toLocaleString()}
                    </>
                  )}
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#E5E5E5] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      m.locked
                        ? 'bg-[#D4D4D4]'
                        : atLimit
                          ? 'bg-[#A90706]'
                          : 'bg-[#111111]'
                    }`}
                    style={{ width: m.locked ? '0%' : `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-lg text-sm border flex flex-wrap items-center justify-between gap-3 ${
            notice.ok
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
          }`}
        >
          <span>{notice.text}</span>
          {notice.invoiceId && (
            <button
              type="button"
              onClick={() => openInvoiceViewer(notice.invoiceId!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111111] bg-white border border-[#BBF7D0] hover:bg-[#FAFAFA] rounded-md cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              View Invoice
            </button>
          )}
        </div>
      )}

      {/* Redeveloped 4-Tier Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.plans.map((plan) => {
          const isCurrent = cp?.id === plan.id;
          const isHighlighted = Boolean(
            (highlightPlanSlug && plan.slug === highlightPlanSlug && !isCurrent) ||
              (!highlightPlanSlug && plan.slug === 'professional' && !isCurrent)
          );
          const price =
            billingCycle === 'yearly'
              ? Math.round(plan.yearlyPriceCents / 100)
              : Math.round(plan.monthlyPriceCents / 100);
          return (
            <div
              key={plan.id}
              className={`bg-white border rounded-lg p-6 flex flex-col justify-between transition-shadow ${
                isCurrent
                  ? 'border-[#A90706] ring-1 ring-[#A90706]/20'
                  : isHighlighted
                    ? 'border-[#111111] ring-2 ring-[#111111]/10'
                    : 'border-[#E5E5E5]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-[#737373]">{plan.audienceLabel || 'SaaS Tier'}</div>
                  {isCurrent ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#A90706]">
                      Current
                    </span>
                  ) : isHighlighted ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#111111]">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <h3 className="text-lg font-bold text-[#111111] mt-1">{plan.name}</h3>
                <p className="text-xs text-[#525252] mt-1 leading-relaxed min-h-[36px]">
                  {plan.description}
                </p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold font-mono tabular-nums text-[#111111]">
                    ${price}
                  </span>
                  <span className="text-xs text-[#737373]">
                    /{billingCycle === 'yearly' ? 'year' : 'month'}
                  </span>
                </div>

                <ul className="mt-5 pt-5 border-t border-[#EFEFEF] space-y-2 text-xs text-[#333333]">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span className="tabular-nums">
                      <strong>{plan.maxWidgets ?? 2}</strong> published widgets ·{' '}
                      <strong>{plan.maxForms}</strong> forms
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span className="tabular-nums">
                      <strong>{plan.maxSubmissionsPerMonth.toLocaleString()}</strong> subs/mo ·{' '}
                      <strong>{plan.maxProjects}</strong> projects
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span className="tabular-nums">
                      <strong>{(plan.maxCampaignEmailsPerMonth ?? 500).toLocaleString()}</strong>{' '}
                      campaign emails/mo ·{' '}
                      {plan.features.campaignAutomation ? 'Automations' : plan.features.campaignScheduling ? 'Scheduling' : 'Templates'}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span className="tabular-nums">
                      <strong>{plan.maxShortLinks}</strong> short links ·{' '}
                      {plan.features.svgQrExport ? 'PNG+SVG QR' : 'PNG QR'}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.newsletterApi ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />
                    )}
                    <span className={plan.features.newsletterApi ? '' : 'text-[#737373]'}>
                      {plan.features.newsletterApi
                        ? `Newsletter API (${plan.maxNewsletterLists} lists)`
                        : 'Newsletter API (Starter+)'}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.pdfGenerator ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />
                    )}
                    <span className={plan.features.pdfGenerator ? '' : 'text-[#737373]'}>
                      PDF Studio &amp; Custom Short Slugs
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.advancedBuilder ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />
                    )}
                    <span className={plan.features.advancedBuilder ? '' : 'text-[#737373]'}>
                      Advanced Builder, Embed &amp; Auto-Reply
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.webhooks ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />
                    )}
                    <span className={plan.features.webhooks ? '' : 'text-[#737373]'}>
                      {plan.features.webhooks
                        ? `Signed Webhooks (${plan.maxWebhooks} endpoints)`
                        : 'Signed Webhooks & White-Label'}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.multipleRecipients ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />
                    )}
                    <span className={plan.features.multipleRecipients ? '' : 'text-[#737373]'}>
                      Multi-Recipient &amp; CSV Exports
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.teamMembers ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />
                    )}
                    <span
                      className={
                        plan.features.teamMembers ? 'font-semibold text-[#111111]' : 'text-[#737373]'
                      }
                    >
                      Team RBAC (up to {plan.maxTeamSeats || 15} seats)
                    </span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handlePlanClick(plan)}
                disabled={isCurrent || busyPlanId === plan.id}
                className={`mt-6 w-full py-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-[#F5F5F5] text-[#737373] cursor-default'
                    : 'bg-[#A90706] hover:bg-[#8C0605] text-white'
                }`}
              >
                {isCurrent
                  ? 'Current Plan'
                  : busyPlanId === plan.id
                    ? 'Updating...'
                    : price === 0
                      ? 'Switch to Free'
                      : 'Checkout with BrosDev Pay'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Full Service & Feature Access Comparison Matrix */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#111111]">
              Full Plan Access &amp; Entitlement Matrix
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Every service lock and quota enforced across BrosDev Developer Services.
            </p>
          </div>
          <span className="text-xs font-mono text-[#737373]">
            Active Tier: {cp?.name || 'Free'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252]">
                <th className="py-3 px-5 font-semibold min-w-[240px]">Service / Feature</th>
                {data.plans.map((p) => (
                  <th
                    key={p.id}
                    className={`py-3 px-4 text-center font-bold min-w-[120px] ${
                      cp?.id === p.id ? 'text-[#A90706] bg-[#FEF2F2]/60' : 'text-[#111111]'
                    }`}
                  >
                    {p.name}
                    <div className="text-[11px] font-mono font-normal text-[#737373]">
                      ${Math.round((billingCycle === 'yearly' ? p.yearlyPriceCents : p.monthlyPriceCents) / 100)}
                      /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {comparisonGroups.map((section) => (
                <React.Fragment key={section.group}>
                  <tr className="bg-[#FAFAFA]/80">
                    <td
                      colSpan={data.plans.length + 1}
                      className="py-2 px-5 text-[11px] font-bold uppercase tracking-wider text-[#525252]"
                    >
                      {section.group}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.label} className="hover:bg-[#FAFAFA]/60">
                      <td className="py-2.5 px-5 text-[#262626] font-medium">{row.label}</td>
                      {data.plans.map((p) => (
                        <td
                          key={p.id}
                          className={`py-2.5 px-4 text-center ${
                            cp?.id === p.id ? 'bg-[#FEF2F2]/30' : ''
                          }`}
                        >
                          {row.render(p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E5E5] font-bold text-sm text-[#111111]">
            Payment History
          </div>
          {data.payments.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#737373]">No payments recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252]">
                  <tr>
                    <th className="py-2.5 px-4">Method</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEF]">
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 font-medium">
                        BrosDev Pay
                        {p.metadata?.last4 && (
                          <span className="text-[#737373] font-mono ml-1.5">
                            · {p.metadata.cardBrand || 'Card'} •••• {p.metadata.last4}
                          </span>
                        )}
                        {p.metadata?.upiId && (
                          <span className="text-[#737373] font-mono ml-1.5">
                            · UPI ({p.metadata.upiId})
                          </span>
                        )}
                        {p.metadata?.bankName && (
                          <span className="text-[#737373] ml-1.5">· {p.metadata.bankName}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        ${(p.amountCents / 100).toFixed(2)} {p.currency}
                      </td>
                      <td
                        className={`py-2.5 px-4 capitalize font-semibold ${
                          p.status === 'succeeded'
                            ? 'text-[#16A34A]'
                            : p.status === 'failed'
                              ? 'text-[#A90706]'
                              : 'text-[#737373]'
                        }`}
                      >
                        {p.status}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#737373]">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E5E5] flex items-center justify-between">
            <span className="font-bold text-sm text-[#111111]">Invoices</span>
            <span className="text-[11px] text-[#737373]">Click any invoice to view or print</span>
          </div>
          {data.invoices.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#737373]">No invoices issued yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252]">
                  <tr>
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEF]">
                  {data.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#FAFAFA]">
                      <td className="py-2.5 px-4">
                        <div className="font-mono font-semibold text-[#111111]">
                          {inv.invoiceNumber}
                        </div>
                        <div className="text-[11px] text-[#737373] font-mono">
                          {new Date(inv.issuedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        ${(inv.amountCents / 100).toFixed(2)} {inv.currency}
                      </td>
                      <td className="py-2.5 px-4 capitalize font-semibold text-[#16A34A]">
                        {inv.status}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openInvoiceViewer(inv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* BrosDev Pay Unified Hosted Checkout Modal */}
      {checkoutPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden my-8 shadow-2xl border border-[#262626]/20 grid grid-cols-1 lg:grid-cols-12">
            {/* Left Order Summary Rail — High-Contrast Fintech Checkout Panel */}
            <div className="lg:col-span-5 bg-[#111111] text-white p-7 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#A90706] flex items-center justify-center font-bold text-sm">
                      B
                    </div>
                    <div>
                      <div className="text-sm font-bold tracking-tight">BrosDev Pay</div>
                      <div className="text-[11px] text-[#A3A3A3]">BrosDev Forms Checkout</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 text-[10px] font-semibold text-[#D4D4D4]">
                    <ShieldCheck className="w-3 h-3 text-[#4ADE80]" />
                    Verified
                  </span>
                </div>

                <div>
                  <div className="text-xs text-[#A3A3A3]">Subscribe to {checkoutPlan.name}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold font-mono tabular-nums tracking-tight">
                      ${checkoutAmountUsd}
                    </span>
                    <span className="text-xs text-[#A3A3A3]">
                      USD / {billingCycle === 'yearly' ? 'year' : 'month'}
                    </span>
                  </div>
                </div>

                {/* Live Interactive Card Preview when Card method is active */}
                {paymentMethod === 'card' && !checkoutReceipt && (
                  <div className="rounded-xl p-4 bg-[#1C1C1C] border border-white/10 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-5 rounded-xs bg-[#D4AF37]/80" />
                      <span className="text-xs font-mono font-bold tracking-widest text-white">
                        {brandLabel}
                      </span>
                    </div>
                    <div className="font-mono text-sm tracking-[0.18em] text-[#F5F5F5]">
                      {cardNumber || '•••• •••• •••• ••••'}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#A3A3A3] uppercase tracking-wider">
                      <span className="truncate max-w-[160px]">
                        {cardholderName || 'CARDHOLDER NAME'}
                      </span>
                      <span className="font-mono">{expiry || 'MM/YY'}</span>
                    </div>
                  </div>
                )}

                {/* Order Line Items */}
                <div className="space-y-3 pt-4 border-t border-white/10 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white">
                        BrosDev Forms {checkoutPlan.name}
                      </div>
                      <div className="text-[#A3A3A3] mt-0.5 capitalize">
                        Billed {billingCycle} · {checkoutPlan.maxForms} forms ·{' '}
                        {checkoutPlan.maxSubmissionsPerMonth.toLocaleString()} subs/mo
                      </div>
                    </div>
                    <div className="font-mono font-semibold tabular-nums">${checkoutAmountUsd}</div>
                  </div>
                  <div className="flex items-center justify-between text-[#A3A3A3] pt-2 border-t border-white/10">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">${checkoutAmountUsd}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#A3A3A3]">
                    <span>Tax</span>
                    <span className="font-mono tabular-nums">$0.00</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-bold text-white pt-2 border-t border-white/10">
                    <span>Total due today</span>
                    <span className="font-mono tabular-nums">${checkoutAmountUsd} USD</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-white/10 flex items-center justify-between text-[11px] text-[#A3A3A3]">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#4ADE80]" />
                  256-bit TLS Encrypted
                </span>
                <span>Instant Activation</span>
              </div>
            </div>

            {/* Right Payment Form / Success Receipt Panel */}
            <div className="lg:col-span-7 bg-white p-7 flex flex-col justify-between">
              {checkoutReceipt ? (
                <div className="my-auto py-8 text-center space-y-5">
                  <div className="w-14 h-14 rounded-full bg-[#F0FDF4] border border-[#BBF7D0] flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7 text-[#16A34A]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#111111]">Payment Approved</h3>
                    <p className="text-xs text-[#525252] mt-1">
                      Your <strong>{checkoutReceipt.planName}</strong> subscription is now active.
                    </p>
                  </div>

                  <div className="max-w-sm mx-auto bg-[#FAFAFA] border border-[#E5E5E5] rounded-xl p-4 text-xs space-y-2 text-left">
                    <div className="flex justify-between">
                      <span className="text-[#737373]">Amount Paid</span>
                      <span className="font-mono font-bold text-[#111111]">
                        ${checkoutReceipt.amountUsd} USD
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#737373]">Method</span>
                      <span className="font-medium text-[#111111]">
                        {checkoutReceipt.receiptSummary}
                      </span>
                    </div>
                    {checkoutReceipt.invoiceNumber && (
                      <div className="flex justify-between">
                        <span className="text-[#737373]">Invoice #</span>
                        <span className="font-mono font-semibold text-[#111111]">
                          {checkoutReceipt.invoiceNumber}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#737373]">Reference</span>
                      <span className="font-mono text-[#525252] truncate max-w-[180px]">
                        {checkoutReceipt.transactionId}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {checkoutReceipt.invoiceId && (
                      <button
                        type="button"
                        onClick={() => {
                          const invId = checkoutReceipt.invoiceId!;
                          setCheckoutPlan(null);
                          setCheckoutReceipt(null);
                          openInvoiceViewer(invId);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-lg cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View &amp; Download Invoice
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutPlan(null);
                        setCheckoutReceipt(null);
                      }}
                      className="px-4 py-2.5 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-lg cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleBrosDevPaySubmit} className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[#111111]">Payment Details</h3>
                      <p className="text-xs text-[#525252]">
                        Choose a payment method to complete your upgrade.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCheckoutPlan(null)}
                      className="p-1.5 text-[#737373] hover:text-[#111111] rounded-md cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Unified Method Selector */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'card', label: 'Card', icon: CreditCard },
                      { id: 'upi', label: 'UPI / Instant', icon: Smartphone },
                      { id: 'netbanking', label: 'NetBanking', icon: Building2 },
                    ].map((m) => {
                      const Icon = m.icon;
                      const active = paymentMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setPaymentMethod(m.id as any);
                            setCheckoutError(null);
                          }}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                            active
                              ? 'border-[#111111] bg-[#FAFAFA] text-[#111111] shadow-xs'
                              : 'border-[#E5E5E5] text-[#525252] hover:border-[#D4D4D4]'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#A90706]' : ''}`} />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {checkoutError && (
                    <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#A90706]">
                      {checkoutError}
                    </div>
                  )}

                  {/* Customer Email Read-Only Row */}
                  <div>
                    <label className="block text-xs font-semibold text-[#525252] mb-1">
                      Receipt Email
                    </label>
                    <input
                      type="email"
                      readOnly
                      value={workspace?.user.email || ''}
                      className="w-full px-3.5 py-2 text-xs font-mono bg-[#FAFAFA] text-[#525252] border border-[#E5E5E5] rounded-lg"
                    />
                  </div>

                  {paymentMethod === 'card' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#111111] mb-1">
                          Card Information
                        </label>
                        <div className="border border-[#D4D4D4] rounded-lg overflow-hidden focus-within:border-[#111111]">
                          <div className="relative border-b border-[#E5E5E5]">
                            <input
                              type="text"
                              inputMode="numeric"
                              required
                              value={cardNumber}
                              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                              placeholder="1234 1234 1234 1234"
                              className="w-full px-3.5 py-2.5 pr-24 text-sm font-mono tracking-wider focus:outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[#F5F5F5] text-[#111111] border border-[#E5E5E5]">
                              {brandLabel}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 divide-x divide-[#E5E5E5]">
                            <input
                              type="text"
                              required
                              maxLength={5}
                              value={expiry}
                              onChange={(e) => {
                                const clean = e.target.value.replace(/[^\d/]/g, '');
                                if (
                                  clean.length === 2 &&
                                  !clean.includes('/') &&
                                  expiry.length === 1
                                ) {
                                  setExpiry(`${clean}/`);
                                } else {
                                  setExpiry(clean);
                                }
                              }}
                              placeholder="MM / YY"
                              className="w-full px-3.5 py-2.5 text-sm font-mono focus:outline-none"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              required
                              maxLength={4}
                              value={cvc}
                              onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              placeholder="CVC"
                              className="w-full px-3.5 py-2.5 text-sm font-mono focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#111111] mb-1">
                          Cardholder Name
                        </label>
                        <input
                          type="text"
                          required
                          value={cardholderName}
                          onChange={(e) => setCardholderName(e.target.value)}
                          placeholder="Full name on card"
                          className="w-full px-3.5 py-2.5 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#111111] mb-1">
                            Country or Region
                          </label>
                          <select
                            value={billingCountry}
                            onChange={(e) => setBillingCountry(e.target.value)}
                            className="w-full px-3 py-2.5 text-xs bg-white border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                          >
                            {COUNTRIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#111111] mb-1">
                            Postal / ZIP Code
                          </label>
                          <input
                            type="text"
                            value={billingZip}
                            onChange={(e) => setBillingZip(e.target.value)}
                            placeholder="10001"
                            className="w-full px-3.5 py-2.5 text-xs font-mono border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'upi' && (
                    <div className="space-y-4">
                      <div className="p-4 bg-[#FAFAFA] border border-[#E5E5E5] rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#111111]">
                          <Sparkles className="w-3.5 h-3.5 text-[#A90706]" />
                          Instant UPI Collect Authorization
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#111111] mb-1">
                            UPI ID / VPA
                          </label>
                          <input
                            type="text"
                            required
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            placeholder="yourname@okaxis"
                            className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                          />
                        </div>
                        <p className="text-[11px] text-[#737373]">
                          Enter your verified UPI handle (e.g. <span className="font-mono">name@upi</span>). Payment settles immediately and generates an invoice.
                        </p>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'netbanking' && (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-[#111111]">
                        Select Your Bank
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {POPULAR_BANKS.map((bank) => (
                          <button
                            key={bank}
                            type="button"
                            onClick={() => setBankName(bank)}
                            className={`px-3 py-2.5 text-left text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                              bankName === bank
                                ? 'border-[#A90706] bg-[#FEF2F2] text-[#A90706]'
                                : 'border-[#E5E5E5] hover:bg-[#FAFAFA] text-[#111111]'
                            }`}
                          >
                            {bank}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 space-y-3">
                    <button
                      type="submit"
                      disabled={processingPayment}
                      className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-lg transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {processingPayment
                          ? 'Authorizing via BrosDev Pay...'
                          : `Pay $${checkoutAmountUsd} USD`}
                      </span>
                      {!processingPayment && <ArrowRight className="w-4 h-4" />}
                    </button>

                    <div className="flex items-center justify-between text-[11px] text-[#737373]">
                      <span>Card numbers and CVC are never persisted on disk.</span>
                      <span className="font-semibold text-[#111111]">Powered by BrosDev Pay</span>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Invoice Template Viewer Modal */}
      <InvoiceModal
        invoice={activeInvoice}
        loading={loadingInvoice}
        onClose={() => {
          setActiveInvoice(null);
          setLoadingInvoice(false);
        }}
      />
    </div>
  );
};
